import type { APIClient, RequestConfig } from '../types.js';
/**
 * Mock response types - supports various patterns for flexibility.
 */
export type MockResponse<T> = T | Promise<T> | ((config: RequestConfig, params: Record<string, string>) => T | Promise<T>) | {
    delay: number;
    data: T | Promise<T>;
} | {
    error: Error;
};
/**
 * Mock route definitions.
 * Key format: "METHOD /path/to/resource" or "METHOD /path/:param/resource"
 */
export type MockRoutes = Record<string, MockResponse<any>>;
/**
 * Create a mock API client for testing.
 *
 * Features:
 * - Pattern matching for path parameters (`:id`, `:slug`)
 * - Static responses (values)
 * - Dynamic responses (functions)
 * - Delayed responses ({ delay: ms, data })
 * - Error simulation ({ error: Error })
 * - 404 for unmatched routes
 *
 * @example
 * ```typescript
 * const mockAPI = createMockAPI({
 *   'GET /api/products': [{ id: '1', name: 'Product 1' }],
 *   'GET /api/products/:id': (config, params) => ({
 *     id: params.id,
 *     name: 'Product ' + params.id
 *   }),
 *   'POST /api/products': (config) => ({
 *     id: '2',
 *     ...config.body
 *   }),
 *   'GET /api/slow': { delay: 1000, data: { ok: true } },
 *   'GET /api/error': { error: new APIError('Not found', 404) }
 * });
 * ```
 */
export declare function createMockAPI(routes?: MockRoutes): APIClient;
//# sourceMappingURL=mock-client.d.ts.map