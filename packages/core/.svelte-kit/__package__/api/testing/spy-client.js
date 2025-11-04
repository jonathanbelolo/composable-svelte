// ============================================================================
// Spy API Client for Testing
// ============================================================================
import { createMockAPI } from './mock-client.js';
// ============================================================================
// Spy API Client Implementation
// ============================================================================
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
export function createSpyAPI(baseClient = createMockAPI({})) {
    const calls = [];
    const responses = [];
    const errors = [];
    function recordCall(method, url, config) {
        calls.push({
            method,
            url,
            ...(config !== undefined && { config }),
            timestamp: Date.now()
        });
    }
    async function executeAndTrack(method, url, config, executor) {
        recordCall(method, url, config);
        try {
            const response = await executor();
            responses.push(response);
            return response;
        }
        catch (error) {
            errors.push(error);
            throw error;
        }
    }
    return {
        calls,
        responses,
        errors,
        callsTo(method, url) {
            return calls.filter(c => c.method === method && c.url === url);
        },
        callsMatching(methodPattern, urlPattern) {
            const urlRegex = typeof urlPattern === 'string'
                ? new RegExp('^' + urlPattern.replace(/\*/g, '.*') + '$')
                : urlPattern;
            return calls.filter(c => {
                const methodMatch = methodPattern === '*' || c.method === methodPattern;
                const urlMatch = urlRegex.test(c.url);
                return methodMatch && urlMatch;
            });
        },
        reset() {
            calls.length = 0;
            responses.length = 0;
            errors.length = 0;
        },
        lastCall() {
            return calls[calls.length - 1];
        },
        lastResponse() {
            return responses[responses.length - 1];
        },
        lastError() {
            return errors[errors.length - 1];
        },
        get: (url, config) => {
            return executeAndTrack('GET', url, config, () => baseClient.get(url, config));
        },
        post: (url, body, config) => {
            return executeAndTrack('POST', url, { ...config, body }, () => baseClient.post(url, body, config));
        },
        put: (url, body, config) => {
            return executeAndTrack('PUT', url, { ...config, body }, () => baseClient.put(url, body, config));
        },
        patch: (url, body, config) => {
            return executeAndTrack('PATCH', url, { ...config, body }, () => baseClient.patch(url, body, config));
        },
        delete: (url, config) => {
            return executeAndTrack('DELETE', url, config, () => baseClient.delete(url, config));
        },
        head: (url, config) => {
            return executeAndTrack('HEAD', url, config, () => baseClient.head(url, config));
        },
        request: (request) => {
            return executeAndTrack(request.method, request.url, request.config, () => baseClient.request(request));
        },
        addInterceptor: (interceptor) => {
            return baseClient.addInterceptor(interceptor);
        },
        clearCache: () => {
            baseClient.clearCache();
        },
        invalidateCache: (pattern) => {
            baseClient.invalidateCache(pattern);
        }
    };
}
