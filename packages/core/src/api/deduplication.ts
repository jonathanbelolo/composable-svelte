// ============================================================================
// Request Deduplication Layer
// ============================================================================

import type { APIResponse, HTTPMethod, RequestConfig } from './types.js';

// ============================================================================
// Stable Stringify (Order-Independent JSON Serialization)
// ============================================================================

/**
 * Stable stringify that produces consistent output regardless of object key order.
 * This ensures that { a: 1, b: 2 } and { b: 2, a: 1 } produce the same key.
 */
function stableStringify(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (obj === undefined) {
    return 'undefined';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items: string[] = [];
    for (let i = 0; i < obj.length; i++) {
      items.push(stableStringify(obj[i]));
    }
    return '[' + items.join(',') + ']';
  }

  // Object: sort keys and stringify
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = (obj as Record<string, unknown>)[key];
    pairs.push('"' + key + '":' + stableStringify(value));
  }

  return '{' + pairs.join(',') + '}';
}

/**
 * Generate a stable cache key from request parameters.
 * Ensures consistent key generation regardless of object property order.
 */
function generateRequestKey(method: HTTPMethod, url: string, config?: RequestConfig): string {
  const parts = [
    method,
    url,
    config?.params ? stableStringify(config.params) : '',
    config?.body ? stableStringify(config.body) : '',
    config?.headers ? stableStringify(config.headers) : ''
  ];

  return parts.join('::');
}

// ============================================================================
// Deduplication State
// ============================================================================

/**
 * In-flight request tracking.
 */
interface InFlightRequest<T> {
  promise: Promise<APIResponse<T>>;
  timestamp: number;
}

/**
 * Map of in-flight requests by key.
 */
const inFlightRequests = new Map<string, InFlightRequest<any>>();

/**
 * Maximum age for in-flight request tracking (milliseconds).
 * After this time, we assume the request is stale and create a new one.
 * @default 60000 (1 minute)
 */
const MAX_IN_FLIGHT_AGE = 60000;

// ============================================================================
// Deduplication Logic
// ============================================================================

/**
 * Clean up stale in-flight requests.
 * This prevents memory leaks from abandoned requests.
 */
function cleanupStaleRequests(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  inFlightRequests.forEach((request, key) => {
    if (now - request.timestamp > MAX_IN_FLIGHT_AGE) {
      keysToDelete.push(key);
    }
  });

  for (let i = 0; i < keysToDelete.length; i++) {
    inFlightRequests.delete(keysToDelete[i]);
  }
}

/**
 * Deduplicate a request by checking if an identical request is in-flight.
 * If so, return the existing promise. Otherwise, execute the request and track it.
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param config - Request configuration
 * @param executor - Function that executes the actual request
 * @returns Promise that resolves to the API response
 */
export async function deduplicateRequest<T>(
  method: HTTPMethod,
  url: string,
  config: RequestConfig | undefined,
  executor: () => Promise<APIResponse<T>>
): Promise<APIResponse<T>> {
  // Check if deduplication is disabled
  if (config?.deduplicate === false) {
    return executor();
  }

  // Generate stable key
  const key = generateRequestKey(method, url, config);

  // Check for in-flight request
  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    // Verify request is not stale
    if (Date.now() - inFlight.timestamp <= MAX_IN_FLIGHT_AGE) {
      return inFlight.promise;
    }
  }

  // Execute new request
  const promise = executor();

  // Track in-flight request
  inFlightRequests.set(key, {
    promise,
    timestamp: Date.now()
  });

  // Clean up after completion (success or failure)
  promise
    .then(() => {
      inFlightRequests.delete(key);
    })
    .catch(() => {
      inFlightRequests.delete(key);
    });

  // Periodic cleanup of stale requests
  if (inFlightRequests.size > 100) {
    cleanupStaleRequests();
  }

  return promise;
}

/**
 * Clear all in-flight requests.
 * Useful for testing or manual cleanup.
 */
export function clearInFlightRequests(): void {
  inFlightRequests.clear();
}

/**
 * Get the number of in-flight requests.
 * Useful for debugging and testing.
 */
export function getInFlightRequestCount(): number {
  return inFlightRequests.size;
}
