// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

import { APIError } from './errors.js';
import type { APIResponse, HTTPMethod, RetryConfig } from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  shouldRetry: () => true
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
 * Determine if an error is retryable.
 */
function isRetryableError(error: unknown, config: Required<RetryConfig>): boolean {
  // Use custom predicate if provided
  if (config.shouldRetry && !config.shouldRetry(error, 0)) {
    return false;
  }

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
function calculateBackoff(attempt: number, config: Required<RetryConfig>): number {
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
 * @returns Delay in milliseconds, or null if header is missing/invalid
 */
function parseRetryAfter(headers: Record<string, string>): number | null {
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
 * Delay execution for a specified duration.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Execute a request with retry logic.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Respects Retry-After header
 * - Configurable retry conditions
 * - Safe method detection (no retry for POST/PATCH by default)
 *
 * @param method - HTTP method
 * @param executor - Function that executes the request
 * @param config - Retry configuration (optional)
 * @returns Promise that resolves to the API response
 */
export async function retryRequest<T>(
  method: HTTPMethod,
  executor: () => Promise<APIResponse<T>>,
  config?: boolean | RetryConfig
): Promise<APIResponse<T>> {
  // Check if retry is disabled
  if (config === false) {
    return executor();
  }

  // For unsafe methods (POST, PATCH), disable retry by default
  if (!isSafeMethod(method) && config === undefined) {
    return executor();
  }

  // If retry is explicitly enabled (true) but no config, use defaults
  if (config === true) {
    config = {};
  }

  // Merge with defaults
  const retryConfig: Required<RetryConfig> = {
    maxAttempts: config?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelay: config?.initialDelay ?? DEFAULT_RETRY_CONFIG.initialDelay,
    maxDelay: config?.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
    backoffMultiplier: config?.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
    retryableStatusCodes: config?.retryableStatusCodes ?? DEFAULT_RETRY_CONFIG.retryableStatusCodes,
    shouldRetry: config?.shouldRetry ?? DEFAULT_RETRY_CONFIG.shouldRetry
  };

  let lastError: unknown;
  let attempt = 0;

  while (attempt < retryConfig.maxAttempts) {
    attempt++;

    try {
      const response = await executor();
      return response;
    } catch (error: unknown) {
      lastError = error;

      // Check if we should retry
      if (!isRetryableError(error, retryConfig)) {
        throw error;
      }

      // Check custom shouldRetry predicate
      if (retryConfig.shouldRetry && !retryConfig.shouldRetry(error, attempt)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt >= retryConfig.maxAttempts) {
        throw error;
      }

      // Calculate backoff delay
      let backoffDelay = calculateBackoff(attempt, retryConfig);

      // Check for Retry-After header (takes precedence)
      if (error instanceof APIError && error.headers) {
        const retryAfter = parseRetryAfter(error.headers);
        if (retryAfter !== null) {
          // Cap Retry-After at maxDelay to prevent indefinite waiting
          backoffDelay = Math.min(retryAfter, retryConfig.maxDelay);
        }
      }

      // Wait before retrying
      await delay(backoffDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}
