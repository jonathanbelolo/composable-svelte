import type { APIResponse, HTTPMethod, RequestConfig } from './types.js';
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
export declare function deduplicateRequest<T>(method: HTTPMethod, url: string, config: RequestConfig | undefined, executor: () => Promise<APIResponse<T>>): Promise<APIResponse<T>>;
/**
 * Clear all in-flight requests.
 * Useful for testing or manual cleanup.
 */
export declare function clearInFlightRequests(): void;
/**
 * Get the number of in-flight requests.
 * Useful for debugging and testing.
 */
export declare function getInFlightRequestCount(): number;
//# sourceMappingURL=deduplication.d.ts.map