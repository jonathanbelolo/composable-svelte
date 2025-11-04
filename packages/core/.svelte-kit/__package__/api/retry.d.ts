import type { APIResponse, HTTPMethod, RetryConfig } from './types.js';
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
export declare function retryRequest<T>(method: HTTPMethod, executor: () => Promise<APIResponse<T>>, config?: boolean | RetryConfig): Promise<APIResponse<T>>;
//# sourceMappingURL=retry.d.ts.map