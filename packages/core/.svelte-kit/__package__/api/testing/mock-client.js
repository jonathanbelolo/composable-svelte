// ============================================================================
// Mock API Client for Testing
// ============================================================================
import { APIError } from '../errors.js';
/**
 * Parse URL pattern with parameters (e.g., "/api/products/:id") into regexp.
 * Zero dependencies - manual parsing.
 */
function parsePattern(pattern) {
    const paramNames = [];
    // Replace :paramName with capture groups
    const regexpStr = pattern.replace(/:(\w+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)'; // Match anything except /
    });
    return {
        regexp: new RegExp('^' + regexpStr + '$'),
        paramNames
    };
}
/**
 * Match a URL against a pattern and extract parameters.
 * Returns null if no match, or { params } if matched.
 */
function matchPattern(pattern, url) {
    const { regexp, paramNames } = parsePattern(pattern);
    const match = url.match(regexp);
    if (!match) {
        return null;
    }
    const params = {};
    for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i];
        const matchValue = match[i + 1];
        if (paramName !== undefined && matchValue !== undefined) {
            params[paramName] = matchValue;
        }
    }
    return { params };
}
// ============================================================================
// Mock Response Resolution
// ============================================================================
/**
 * Resolve a mock response value into an actual response.
 * Handles static values, promises, functions, delays, and errors.
 */
async function resolveMockResponse(mockResponse, config, params = {}) {
    // Handle error simulation
    if (typeof mockResponse === 'object' && mockResponse !== null && 'error' in mockResponse) {
        throw mockResponse.error;
    }
    // Handle delayed response
    if (typeof mockResponse === 'object' && mockResponse !== null && 'delay' in mockResponse) {
        await new Promise(resolve => setTimeout(resolve, mockResponse.delay));
        const responseData = mockResponse.data;
        const data = typeof responseData === 'function'
            ? await responseData(config, params)
            : await Promise.resolve(responseData);
        return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: data
        };
    }
    // Handle function response
    if (typeof mockResponse === 'function') {
        const fn = mockResponse;
        const data = await fn(config, params);
        return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            data
        };
    }
    // Handle promise response
    if (mockResponse instanceof Promise) {
        const data = await mockResponse;
        return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            data
        };
    }
    // Handle static response
    return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: mockResponse
    };
}
// ============================================================================
// Mock API Client
// ============================================================================
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
export function createMockAPI(routes = {}) {
    const findRoute = (method, url) => {
        // Strip query string for matching
        const urlPath = url.split('?')[0];
        const routeKey = `${method} ${urlPath}`;
        // Try exact match first
        if (routeKey in routes) {
            return { response: routes[routeKey], params: {} };
        }
        // Try pattern match
        for (const [pattern, response] of Object.entries(routes)) {
            const match = matchPattern(pattern, routeKey);
            if (match) {
                return { response, params: match.params };
            }
        }
        return null;
    };
    return {
        get: async (url, config) => {
            const route = findRoute('GET', url);
            if (!route) {
                throw new APIError(`No mock for: GET ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, config || {}, route.params);
        },
        post: async (url, body, config) => {
            const route = findRoute('POST', url);
            if (!route) {
                throw new APIError(`No mock for: POST ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, { ...config, body }, route.params);
        },
        put: async (url, body, config) => {
            const route = findRoute('PUT', url);
            if (!route) {
                throw new APIError(`No mock for: PUT ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, { ...config, body }, route.params);
        },
        patch: async (url, body, config) => {
            const route = findRoute('PATCH', url);
            if (!route) {
                throw new APIError(`No mock for: PATCH ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, { ...config, body }, route.params);
        },
        delete: async (url, config) => {
            const route = findRoute('DELETE', url);
            if (!route) {
                throw new APIError(`No mock for: DELETE ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, config || {}, route.params);
        },
        head: async (url, config) => {
            const route = findRoute('HEAD', url);
            if (!route) {
                throw new APIError(`No mock for: HEAD ${url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, config || {}, route.params);
        },
        request: async (request) => {
            const route = findRoute(request.method, request.url);
            if (!route) {
                throw new APIError(`No mock for: ${request.method} ${request.url}`, 404, null, {}, false);
            }
            return resolveMockResponse(route.response, request.config || {}, route.params);
        },
        addInterceptor: () => {
            // No-op for mock - interceptors not needed
            return () => { };
        },
        clearCache: () => {
            // No-op for mock
        },
        invalidateCache: () => {
            // No-op for mock
        }
    };
}
