// ============================================================================
// Mock API Client for Testing
// ============================================================================

import { APIError } from '../errors.js';
import type { APIClient, APIRequest, APIResponse, RequestConfig } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Mock response types - supports various patterns for flexibility.
 */
export type MockResponse<T> =
  | T
  | Promise<T>
  | ((config: RequestConfig, params: Record<string, string>) => T | Promise<T>)
  | { delay: number; data: T | Promise<T> }
  | { error: Error };

/**
 * Mock route definitions.
 * Key format: "METHOD /path/to/resource" or "METHOD /path/:param/resource"
 */
export type MockRoutes = Record<string, MockResponse<any>>;

// ============================================================================
// Pattern Matching (Zero Dependencies)
// ============================================================================

interface ParsedPattern {
  regexp: RegExp;
  paramNames: string[];
}

/**
 * Parse URL pattern with parameters (e.g., "/api/products/:id") into regexp.
 * Zero dependencies - manual parsing.
 */
function parsePattern(pattern: string): ParsedPattern {
  const paramNames: string[] = [];

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
function matchPattern(
  pattern: string,
  url: string
): { params: Record<string, string> } | null {
  const { regexp, paramNames } = parsePattern(pattern);
  const match = url.match(regexp);

  if (!match) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    params[paramNames[i]] = match[i + 1];
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
async function resolveMockResponse<T>(
  mockResponse: MockResponse<T>,
  config: RequestConfig,
  params: Record<string, string> = {}
): Promise<APIResponse<T>> {
  // Handle error simulation
  if (typeof mockResponse === 'object' && mockResponse !== null && 'error' in mockResponse) {
    throw mockResponse.error;
  }

  // Handle delayed response
  if (typeof mockResponse === 'object' && mockResponse !== null && 'delay' in mockResponse) {
    await new Promise(resolve => setTimeout(resolve, (mockResponse as any).delay));
    const responseData = (mockResponse as any).data;
    const data = typeof responseData === 'function'
      ? await responseData(config, params)
      : await Promise.resolve(responseData);
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: data as T
    };
  }

  // Handle function response
  if (typeof mockResponse === 'function') {
    const fn = mockResponse as (config: RequestConfig, params: Record<string, string>) => T | Promise<T>;
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
    data: mockResponse as T
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
export function createMockAPI(routes: MockRoutes = {}): APIClient {
  const findRoute = (method: string, url: string) => {
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
    get: async <T = unknown>(url: string, config?: RequestConfig) => {
      const route = findRoute('GET', url);
      if (!route) {
        throw new APIError(`No mock for: GET ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<T>(route.response, config || {}, route.params);
    },

    post: async <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      const route = findRoute('POST', url);
      if (!route) {
        throw new APIError(`No mock for: POST ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<T>(route.response, { ...config, body }, route.params);
    },

    put: async <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      const route = findRoute('PUT', url);
      if (!route) {
        throw new APIError(`No mock for: PUT ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<T>(route.response, { ...config, body }, route.params);
    },

    patch: async <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      const route = findRoute('PATCH', url);
      if (!route) {
        throw new APIError(`No mock for: PATCH ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<T>(route.response, { ...config, body }, route.params);
    },

    delete: async <T = unknown>(url: string, config?: RequestConfig) => {
      const route = findRoute('DELETE', url);
      if (!route) {
        throw new APIError(`No mock for: DELETE ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<T>(route.response, config || {}, route.params);
    },

    head: async (url: string, config?: RequestConfig) => {
      const route = findRoute('HEAD', url);
      if (!route) {
        throw new APIError(`No mock for: HEAD ${url}`, 404, null, {}, false);
      }
      return resolveMockResponse<void>(route.response, config || {}, route.params);
    },

    request: async <T = unknown>(request: APIRequest<T>) => {
      const route = findRoute(request.method, request.url);
      if (!route) {
        throw new APIError(
          `No mock for: ${request.method} ${request.url}`,
          404,
          null,
          {},
          false
        );
      }
      return resolveMockResponse<T>(
        route.response,
        request.config || {},
        route.params
      );
    },

    addInterceptor: () => {
      // No-op for mock - interceptors not needed
      return () => {};
    },

    clearCache: () => {
      // No-op for mock
    },

    invalidateCache: () => {
      // No-op for mock
    }
  };
}
