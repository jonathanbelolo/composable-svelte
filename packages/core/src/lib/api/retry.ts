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
 * Supports integer delay-seconds, all three HTTP-date forms, and ISO dates.
 * ISO date-times require an explicit Z or numeric timezone; date-only is UTC.
 *
 * Exported because it is the only correct implementation of this in the
 * repository and a second one would drift. `@composable-svelte/auth` reads it
 * to fill `RateLimitedError.retryAfterSeconds` — note the units differ, so the
 * caller converts.
 *
 * @returns Delay in **milliseconds**, or null if header is missing/invalid
 */
export function parseRetryAfter(headers: Record<string, string>): number | null {
  const key = Object.keys(headers).find(name => name.toLowerCase() === 'retry-after');
  const retryAfter = key === undefined ? undefined : headers[key];
  if (typeof retryAfter !== 'string') return null;
  const value = retryAfter.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
  }

  const now = Date.now();
  const timestamp = parseRetryDate(value, now);
  return timestamp !== null && timestamp > now ? timestamp - now : null;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Recognize HTTP-date's three wire grammars and the documented ISO extension.
 * Validate the calendar before accepting a timestamp: Date.parse alone rolls
 * invalid days into the following month and accepts implementation-specific text.
 */
function parseRetryDate(value: string, now: number): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (iso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '', zone = 'Z'] = iso;
    const local = calendarTime(+year!, +month! - 1, +day!, +hour, +minute, +second);
    if (local === null) return null;
    let offset = 0;
    if (zone !== 'Z') {
      const hours = Number(zone.slice(1, 3));
      const minutes = Number(zone.slice(4, 6));
      if (hours > 23 || minutes > 59) return null;
      offset = (hours * 60 + minutes) * 60000 * (zone[0] === '+' ? 1 : -1);
    }
    return local + Number(fraction.slice(0, 3).padEnd(3, '0')) - offset;
  }

  const imf = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value);
  const obsolete = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value);
  const ascii = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Z][a-z]{2}) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(value);
  const match = imf ?? obsolete;
  if (match) {
    const [, day, month, rawYear, hour, minute, second] = match;
    let year = Number(rawYear);
    if (obsolete) {
      const current = new Date(now);
      const threshold = new Date(now);
      threshold.setUTCFullYear(current.getUTCFullYear() + 50);
      // Select the latest matching year at or before the fifty-year horizon,
      // including when that horizon is in the next century.
      year += Math.floor(threshold.getUTCFullYear() / 100) * 100;
      const candidate = httpCalendarTime(year, months.indexOf(month!), +day!, +hour!, +minute!, +second!);
      if (candidate !== null && candidate > threshold.getTime()) year -= 100;
    }
    return httpCalendarTime(year, months.indexOf(month!), +day!, +hour!, +minute!, +second!);
  }
  if (ascii) {
    const [, month, day, hour, minute, second, year] = ascii;
    return httpCalendarTime(+year!, months.indexOf(month!), +day!, +hour!, +minute!, +second!);
  }
  return null;
}

// JavaScript timestamps do not represent leap seconds. HTTP permits :60;
// normalize it to the next representable second after validating its date.
function httpCalendarTime(year: number, month: number, day: number, hour: number, minute: number, second: number): number | null {
  if (second > 60) return null;
  const timestamp = calendarTime(year, month, day, hour, minute, Math.min(second, 59));
  return timestamp === null ? null : timestamp + (second === 60 ? 1000 : 0);
}

function calendarTime(year: number, month: number, day: number, hour: number, minute: number, second: number): number | null {
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.getTime() : null;
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
