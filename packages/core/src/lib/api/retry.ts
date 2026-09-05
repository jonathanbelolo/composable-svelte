// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

import { APIError, CancelledError } from './errors.js';
import type { APIResponse, HTTPMethod, RetryConfig } from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/** A retry policy with every field filled in. */
export type ResolvedRetryConfig = Required<RetryConfig>;

/** The predicate a policy has when none is given; the identity layer keys it as 0. */
export const DEFAULT_SHOULD_RETRY: ResolvedRetryConfig['shouldRetry'] = () => true;

const DEFAULT_RETRY_CONFIG: ResolvedRetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  shouldRetry: DEFAULT_SHOULD_RETRY
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if an HTTP method is safe to retry (idempotent).
 */
function isSafeMethod(method: HTTPMethod): boolean {
  // GET, HEAD, OPTIONS: Always safe
  // PUT, DELETE: Idempotent, safe to retry
  // POST, PATCH: NOT idempotent, should not retry by default
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'PUT' || method === 'DELETE';
}

/**
 * The policy a request runs under, or null when it does not retry: `false`
 * never retries; `undefined` retries GET, HEAD, OPTIONS, PUT and DELETE
 * under the defaults and never retries POST or PATCH; `true` or a partial
 * policy retries **any** method under the defaults merged with it. Resolved
 * once per caller, before the request joins an attempt, so the policy is
 * part of the request's identity (R1-REVIEW 1.9).
 *
 * `createAPIClient` passes its own `retry` (default `false`) when the request
 * sets none, so `undefined` reaches here only from a caller of this function
 * — AUDIT-2026-09-03-FINDINGS A5, open for R3.1.
 */
export function resolveRetryConfig(
  method: HTTPMethod,
  config: boolean | RetryConfig | undefined
): ResolvedRetryConfig | null {
  if (config === false) return null;
  if (config === undefined) return isSafeMethod(method) ? { ...DEFAULT_RETRY_CONFIG } : null;
  const overrides = config === true ? {} : config;
  return {
    maxAttempts: overrides.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelay: overrides.initialDelay ?? DEFAULT_RETRY_CONFIG.initialDelay,
    maxDelay: overrides.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
    backoffMultiplier: overrides.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
    retryableStatusCodes: overrides.retryableStatusCodes ?? DEFAULT_RETRY_CONFIG.retryableStatusCodes,
    shouldRetry: overrides.shouldRetry ?? DEFAULT_RETRY_CONFIG.shouldRetry
  };
}

/**
 * Determine if an error is retryable by its kind and status. The policy's
 * `shouldRetry` is consulted once per failure, by the loop, with the attempt
 * number — the first form also called it here with attempt 0 (A12).
 */
function isRetryableError(error: unknown, config: ResolvedRetryConfig): boolean {
  // API errors: check status code
  if (error instanceof APIError) {
    // Network errors and timeouts are always retryable
    if (error.isRetryable && error.status === null) {
      return true;
    }

    // Check against retryable status codes
    if (error.status !== null) {
      for (let i = 0; i < config.retryableStatusCodes.length; i++) {
        if (error.status === config.retryableStatusCodes[i]) {
          return true;
        }
      }
    }

    return false;
  }

  // Unknown errors: not retryable
  return false;
}

/**
 * Calculate backoff delay with exponential backoff and jitter.
 *
 * Formula:
 * - Base delay = initialDelay * (backoffMultiplier ^ (attempt - 1))
 * - Capped delay = min(base delay, maxDelay)
 * - Jitter = random value between 50% and 100% of capped delay
 *
 * Jitter prevents thundering herd problem when multiple clients retry simultaneously.
 */
function calculateBackoff(attempt: number, config: ResolvedRetryConfig): number {
  const { initialDelay, maxDelay, backoffMultiplier } = config;

  // Exponential backoff
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (50-100% of calculated delay)
  const jitter = 0.5 + Math.random() * 0.5;

  return Math.floor(cappedDelay * jitter);
}

/**
 * Parse Retry-After header from response.
 * Supports both delay-seconds (number) and HTTP-date (ISO string).
 *
 * Exported because it is the only correct implementation of this in the
 * repository and a second one would drift. `@composable-svelte/auth` reads it
 * to fill `RateLimitedError.retryAfterSeconds` — note the units differ, so the
 * caller converts.
 *
 * @returns Delay in **milliseconds**, or null if header is missing/invalid
 */
export function parseRetryAfter(headers: Record<string, string>): number | null {
  const retryAfter = headers['retry-after'] || headers['Retry-After'];

  if (!retryAfter) {
    return null;
  }

  // Try parsing as delay-seconds (number)
  const delaySeconds = parseInt(retryAfter, 10);
  if (!isNaN(delaySeconds)) {
    return delaySeconds * 1000;
  }

  // Try parsing as HTTP-date
  try {
    const date = new Date(retryAfter);
    const now = new Date();
    const delay = date.getTime() - now.getTime();

    return delay > 0 ? delay : null;
  } catch {
    return null;
  }
}

/**
 * Sleep for the backoff, ending early when the attempt is abandoned: the
 * signal is the shared attempt's, aborted when its last caller has detached,
 * and a sleep that outlived every caller kept the attempt — and its timer —
 * alive for up to `maxDelay` (the R1.3.f remainder, R1-REVIEW 1.9).
 */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError('Request cancelled', signal.reason));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Execute a request under a resolved policy: exponential backoff with
 * jitter, `Retry-After` honoured (capped at `maxDelay`), `shouldRetry`
 * consulted once per failure with the attempt number. A null policy runs the
 * executor once.
 *
 * @param executor - Function that executes one attempt
 * @param config - The policy from `resolveRetryConfig`, or null
 * @param signal - The attempt's signal; an abort ends a backoff sleep at once
 */
export async function retryRequest<T>(
  executor: () => Promise<APIResponse<T>>,
  config: ResolvedRetryConfig | null,
  signal: AbortSignal
): Promise<APIResponse<T>> {
  if (config === null) {
    return executor();
  }

  let attempt = 0;

  for (;;) {
    attempt++;

    try {
      return await executor();
    } catch (error: unknown) {
      if (!isRetryableError(error, config)) {
        throw error;
      }

      if (!config.shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt >= config.maxAttempts) {
        throw error;
      }

      if (signal.aborted) {
        throw new CancelledError('Request cancelled', signal.reason);
      }

      // Calculate backoff delay
      let backoffDelay = calculateBackoff(attempt, config);

      // Check for Retry-After header (takes precedence)
      if (error instanceof APIError && error.headers) {
        const retryAfter = parseRetryAfter(error.headers);
        if (retryAfter !== null) {
          // Cap Retry-After at maxDelay to prevent indefinite waiting
          backoffDelay = Math.min(retryAfter, config.maxDelay);
        }
      }

      // Wait before retrying
      await delay(backoffDelay, signal);
    }
  }
}
