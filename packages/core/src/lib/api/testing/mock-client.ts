// ============================================================================
// Mock API Client for Testing
// ============================================================================

import { APIError } from '../errors.js';
import { cacheKeyFor, createResponseCache, normalizePath, validateCacheConfig } from '../cache.js';
import { createInFlightRegistry, isDeduplicableMethod, requestKey } from '../deduplication.js';
import {
  finalizeRequest,
  mergeHeaders,
  recoverWithErrorInterceptors,
  runRequestInterceptors,
  runResponseInterceptors,
  validateTimeout
} from '../pipeline.js';
import { resolveRetryConfig } from '../retry.js';
import type {
  APIClient,
  APIRequest,
  APIResponse,
  HTTPMethod,
  Interceptor,
  RequestConfig
} from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A route handler: called with the request config and the matched URL params.
 *
 * Exported because it cannot be inferred at the call site. `MockResponse<T>`
 * includes a bare `T`, and `MockRoutes` fixes `T = any` — a union containing
 * `any` *is* `any`, so the whole route value collapses and nothing contextually
 * types an inline handler. Annotating the parameters, or the handler with this
 * type, is the way to get them checked:
 *
 * ```ts
 * createMockAPI({
 *   'GET /api/products': ((config) => [{ id: '1' }]) satisfies MockHandler
 * });
 * ```
 */
export type MockHandler<T = unknown> = (
  config: RequestConfig,
  params: Record<string, string>
) => T | Promise<T>;

/**
 * Mock response types - supports various patterns for flexibility.
 */
export type MockResponse<T> =
  | T
  | Promise<T>
  | MockHandler<T>
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
 * The mock runs the real client's pipeline (`pipeline.ts`): identical
 * concurrent safe requests share one handler call unless a request says
 * `deduplicate: false`; request interceptors run before the key and the
 * cache lookup; a `signal` and a `timeout` are the caller's own, with no
 * default timeout; header names reach handlers lower-cased
 * (`config.headers.authorization`); a body with no JSON form never
 * coalesces. Nothing retries. Caching uses the same cache implementation
 * `createAPIClient` uses, one instance per mock, as production has one per
 * client: two `createMockAPI` instances do not see each other's cached
 * GETs, and nothing has to be cleared between tests.
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
  // Interceptors and caching are real, not stubs.
  //
  // They used to be three empty closures, which meant a test exercising auth
  // headers, response shaping or error mapping against the mock proved the
  // opposite of what it appeared to. The mock is a test double for `APIClient`,
  // and a double that silently drops half the contract is worse than one that
  // is missing it outright.
  const interceptors: Interceptor[] = [];

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

  /**
   * The one path every verb goes through: the real client's pipeline, in its
   * order — resolve, request interceptors, finalize and key, cache lookup,
   * the shared attempt (the route, then the response interceptors), cache
   * set — with a failure other than this caller's own cancellation offered to
   * the error interceptors once. A `signal` and a `timeout` are the caller's
   * own, as in production; there is no default timeout. Nothing retries, but
   * the policy is part of the identity, so two callers with different
   * policies do not share a handler call, as they would not share a fetch
   * (R1-REVIEW 1.9).
   */
  // This mock's own registry and cache, as a real client has its own.
  const inFlight = createInFlightRegistry();
  const cache = createResponseCache();

  async function execute<T>(
    method: HTTPMethod,
    url: string,
    config: RequestConfig = {}
  ): Promise<APIResponse<T>> {
    const timeout = config.timeout === undefined ? Infinity : validateTimeout(config.timeout, 'request');
    validateCacheConfig(config.cache, 'request');
    // `cache` defaults to false here exactly as it does in `createAPIClient`, so
    // adding caching changes no existing mock's behaviour.
    const cacheConfig = config.cache !== undefined ? config.cache : false;
    const retry = resolveRetryConfig(method, config.retry !== undefined ? config.retry : false);
    const path = normalizePath(url);
    const coalesce = config.deduplicate === true || (config.deduplicate !== false && isDeduplicableMethod(method));

    try {
      const intercepted = await runRequestInterceptors(interceptors, url, {
        ...config,
        headers: mergeHeaders(config.headers)
      });
      const prepared = finalizeRequest(method, url, intercepted, retry);
      const key = requestKey(prepared.identity);
      const cacheKey = cacheKeyFor(key, url, intercepted, cacheConfig);

      const cached = cache.get<T>(method, cacheKey, cacheConfig);
      if (cached) {
        return cached;
      }

      const run = async (): Promise<APIResponse<T>> => {
        const route = findRoute(method, url);
        if (!route) {
          throw new APIError(`No mock for: ${method} ${url}`, 404, null, {}, false);
        }
        const raw = await resolveMockResponse<T>(route.response, intercepted, route.params);
        return runResponseInterceptors(interceptors, raw);
      };
      const response = await inFlight.join(coalesce && key !== null ? key : null, run, {
        signal: config.signal,
        timeout
      });

      cache.set(method, cacheKey, path, response, cacheConfig);
      cache.invalidateOnMutation(method, path, cacheConfig);

      return response;
    } catch (error) {
      // Each hook in its own try, exactly as `createAPIClient` does: a hook that
      // throws has declined to handle the error, so the loop moves to the next
      // one and the *original* error is rethrown if none recovers. Returning
      // from the first hook unconditionally would make the canonical mapping
      // interceptor — `onError: (e) => { throw toDomainError(e) }` — surface a
      // different error under the mock than in production, which is the
      // "double that drops half the contract" problem this file exists to fix.
      return recoverWithErrorInterceptors<T>(interceptors, error);
    }
  }

  return {
    get: <T = unknown>(url: string, config?: RequestConfig) =>
      execute<T>('GET', url, config ?? {}),

    post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
      execute<T>('POST', url, { ...config, body }),

    put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
      execute<T>('PUT', url, { ...config, body }),

    patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
      execute<T>('PATCH', url, { ...config, body }),

    delete: <T = unknown>(url: string, config?: RequestConfig) =>
      execute<T>('DELETE', url, config ?? {}),

    head: (url: string, config?: RequestConfig) =>
      execute<void>('HEAD', url, config ?? {}),

    request: <T = unknown>(request: APIRequest<T>) =>
      execute<T>(request.method, request.url, request.config ?? {}),

    addInterceptor: (interceptor: Interceptor) => {
      interceptors.push(interceptor);
      return () => {
        const index = interceptors.indexOf(interceptor);
        if (index !== -1) {
          interceptors.splice(index, 1);
        }
      };
    },

    clearCache: () => {
      cache.clear();
    },

    invalidateCache: (pattern: string) => {
      cache.invalidate(pattern);
    }
  };
}
