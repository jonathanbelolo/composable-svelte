import type { APIClient, APIResponse, HTTPMethod, RequestConfig } from '../types.js';
/**
 * Recorded API call information.
 */
export interface RecordedCall {
    method: HTTPMethod;
    url: string;
    config?: RequestConfig;
    timestamp: number;
}
/**
 * Spy API client that wraps another client and tracks all calls.
 */
export interface SpyAPIClient extends APIClient {
    /**
     * All recorded calls.
     */
    readonly calls: RecordedCall[];
    /**
     * All recorded responses.
     */
    readonly responses: APIResponse<any>[];
    /**
     * All recorded errors.
     */
    readonly errors: Error[];
    /**
     * Get calls matching specific method and URL.
     */
    callsTo(method: HTTPMethod, url: string): RecordedCall[];
    /**
     * Get calls matching specific method and URL pattern.
     */
    callsMatching(methodPattern: string, urlPattern: string | RegExp): RecordedCall[];
    /**
     * Reset all tracked data.
     */
    reset(): void;
    /**
     * Get the last call made.
     */
    lastCall(): RecordedCall | undefined;
    /**
     * Get the last response received.
     */
    lastResponse(): APIResponse<any> | undefined;
    /**
     * Get the last error thrown.
     */
    lastError(): Error | undefined;
}
/**
 * Create a spy API client that wraps another client and tracks all calls.
 *
 * Features:
 * - Track all calls (method, URL, config, timestamp)
 * - Track all responses
 * - Track all errors
 * - Filter calls by method/URL
 * - Reset tracking
 *
 * @example
 * ```typescript
 * const mockAPI = createMockAPI({
 *   'GET /api/products': [{ id: '1', name: 'Product 1' }]
 * });
 * const spy = createSpyAPI(mockAPI);
 *
 * await spy.get('/api/products');
 *
 * expect(spy.calls).toHaveLength(1);
 * expect(spy.calls[0].method).toBe('GET');
 * expect(spy.calls[0].url).toBe('/api/products');
 * expect(spy.responses).toHaveLength(1);
 * ```
 */
export declare function createSpyAPI(baseClient?: APIClient): SpyAPIClient;
//# sourceMappingURL=spy-client.d.ts.map