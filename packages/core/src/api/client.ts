// ============================================================================
// Base API Client Implementation
// ============================================================================

import { APIError, NetworkError, TimeoutError, ValidationError } from './errors.js';
import { deduplicateRequest } from './deduplication.js';
import { retryRequest } from './retry.js';
import {
  getCachedResponse,
  setCachedResponse,
  invalidateCacheOnMutation,
  clearCache as clearCacheStorage,
  invalidateCache as invalidateCachePattern
} from './cache.js';
import type {
  APIClient,
  APIClientConfig,
  APIRequest,
  APIResponse,
  HTTPMethod,
  Interceptor,
  RequestConfig
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize URL by removing duplicate slashes and ensuring proper formatting.
 */
function normalizeURL(baseURL: string | undefined, path: string): string {
  if (!baseURL) {
    return path;
  }

  // Remove trailing slash from baseURL
  const normalizedBase = baseURL.replace(/\/$/, '');

  // Ensure path starts with slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Combine and normalize double slashes (but not in protocol://)
  const url = `${normalizedBase}${normalizedPath}`;
  return url.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Build query string from params object.
 * Handles null/undefined values by excluding them.
 */
function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries: string[] = [];

  const keys = Object.keys(params);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = params[key];

    if (value !== null && value !== undefined) {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

/**
 * Parse response headers from Headers object to plain object.
 */
function parseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

/**
 * Parse response body based on Content-Type.
 */
async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  // Handle empty responses (204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }

  // JSON response
  if (contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Text response
  if (contentType.includes('text/')) {
    return await response.text();
  }

  // Fallback: try JSON, then text
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return await response.text();
  }
}

/**
 * Determine if HTTP method is safe (idempotent, can retry).
 */
function isSafeMethod(method: HTTPMethod): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'PUT' || method === 'DELETE';
}

/**
 * Merge headers, with later headers taking precedence.
 */
function mergeHeaders(...headerSets: (Record<string, string> | undefined)[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let i = 0; i < headerSets.length; i++) {
    const headers = headerSets[i];
    if (headers) {
      const keys = Object.keys(headers);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        result[key] = headers[key];
      }
    }
  }

  return result;
}

// ============================================================================
// Base API Client
// ============================================================================

/**
 * Create an API client with the given configuration.
 */
export function createAPIClient(config: APIClientConfig = {}): APIClient {
  const {
    baseURL,
    headers: defaultHeaders = {},
    timeout: defaultTimeout = 30000,
    deduplicate = true,
    retry: defaultRetry = false,
    cache: defaultCache = false,
    interceptors: initialInterceptors = []
  } = config;

  // Interceptors state
  const interceptors: Interceptor[] = [...initialInterceptors];

  /**
   * Core request function that handles the actual fetch call.
   * This is the innermost layer - just fetch, no retry/cache/dedup.
   */
  async function executeFetch<T>(
    method: HTTPMethod,
    url: string,
    config: RequestConfig = {}
  ): Promise<APIResponse<T>> {
    const {
      headers: requestHeaders = {},
      params,
      body,
      signal: externalSignal,
      timeout = defaultTimeout
    } = config;

    // Normalize URL
    const normalizedURL = normalizeURL(baseURL, url);
    const queryString = params ? buildQueryString(params) : '';
    const fullURL = `${normalizedURL}${queryString}`;

    // Merge headers
    let headers = mergeHeaders(defaultHeaders, requestHeaders);

    // Auto-set Content-Type for JSON body
    if (body && typeof body === 'object' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    // Combine external signal with timeout signal
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => abortController.abort());
    }

    try {
      // Run request interceptors
      let interceptedConfig: RequestConfig = { ...config, headers };
      for (let i = 0; i < interceptors.length; i++) {
        const interceptor = interceptors[i];
        if (interceptor.onRequest) {
          interceptedConfig = await interceptor.onRequest(fullURL, interceptedConfig);
          headers = interceptedConfig.headers || headers;
        }
      }

      // Prepare fetch init
      const init: RequestInit = {
        method,
        headers,
        signal: abortController.signal
      };

      // Add body for non-GET/HEAD requests
      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      // Execute fetch
      const response = await fetch(fullURL, init);

      // Parse response
      const responseHeaders = parseHeaders(response.headers);
      const responseBody = await parseResponseBody(response);

      // Handle error responses
      if (!response.ok) {
        // Validation errors (422)
        if (response.status === 422) {
          const error = new ValidationError(
            response.statusText || 'Validation failed',
            response.status,
            responseBody,
            responseHeaders
          );

          // Run error interceptors
          for (let i = 0; i < interceptors.length; i++) {
            const interceptor = interceptors[i];
            if (interceptor.onError) {
              try {
                return await interceptor.onError(error) as APIResponse<T>;
              } catch (e) {
                // Interceptor didn't handle it, continue
              }
            }
          }

          throw error;
        }

        // Generic API error
        const isRetryable = response.status >= 500 || response.status === 408 || response.status === 429;
        const error = new APIError(
          response.statusText || `Request failed with status ${response.status}`,
          response.status,
          responseBody,
          responseHeaders,
          isRetryable
        );

        // Run error interceptors
        for (let i = 0; i < interceptors.length; i++) {
          const interceptor = interceptors[i];
          if (interceptor.onError) {
            try {
              return await interceptor.onError(error) as APIResponse<T>;
            } catch (e) {
              // Interceptor didn't handle it, continue
            }
          }
        }

        throw error;
      }

      // Build successful response
      let apiResponse: APIResponse<T> = {
        status: response.status,
        headers: responseHeaders,
        data: responseBody as T
      };

      // Run response interceptors
      for (let i = 0; i < interceptors.length; i++) {
        const interceptor = interceptors[i];
        if (interceptor.onResponse) {
          apiResponse = await interceptor.onResponse(apiResponse);
        }
      }

      return apiResponse;

    } catch (error: unknown) {
      // Timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new TimeoutError(timeout);

        // Run error interceptors
        for (let i = 0; i < interceptors.length; i++) {
          const interceptor = interceptors[i];
          if (interceptor.onError) {
            try {
              return await interceptor.onError(timeoutError) as APIResponse<T>;
            } catch (e) {
              // Interceptor didn't handle it, continue
            }
          }
        }

        throw timeoutError;
      }

      // Network error
      if (error instanceof Error && !('status' in error)) {
        const networkError = new NetworkError(
          `Network request failed: ${error.message}`,
          error
        );

        // Run error interceptors
        for (let i = 0; i < interceptors.length; i++) {
          const interceptor = interceptors[i];
          if (interceptor.onError) {
            try {
              return await interceptor.onError(networkError) as APIResponse<T>;
            } catch (e) {
              // Interceptor didn't handle it, continue
            }
          }
        }

        throw networkError;
      }

      // Re-throw API errors
      throw error;

    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute request with all layers applied:
   * Cache → Deduplication → Retry → Interceptors → Base Client
   */
  async function executeRequest<T>(
    method: HTTPMethod,
    url: string,
    config: RequestConfig = {}
  ): Promise<APIResponse<T>> {
    // Determine cache/retry config (merge defaults with request config)
    const cacheConfig = config.cache !== undefined ? config.cache : defaultCache;
    const retryConfig = config.retry !== undefined ? config.retry : defaultRetry;

    // Layer 1: Cache (outermost - fastest exit)
    const cached = getCachedResponse<T>(method, url, config, cacheConfig);
    if (cached) {
      return cached;
    }

    // Layer 2: Deduplication
    const response = await deduplicateRequest<T>(
      method,
      url,
      config,
      // Layer 3: Retry
      () => retryRequest<T>(
        method,
        // Layer 4: Base fetch
        () => executeFetch<T>(method, url, config),
        retryConfig
      )
    );

    // Store in cache if applicable
    if (method === 'GET') {
      setCachedResponse(method, url, response, config, cacheConfig);
    }

    // Invalidate cache on mutations
    invalidateCacheOnMutation(method, url, cacheConfig);

    return response;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    get: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeRequest<T>('GET', url, config);
    },

    post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('POST', url, { ...config, body });
    },

    put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('PUT', url, { ...config, body });
    },

    patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('PATCH', url, { ...config, body });
    },

    delete: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeRequest<T>('DELETE', url, config);
    },

    head: (url: string, config?: RequestConfig) => {
      return executeRequest<void>('HEAD', url, config);
    },

    request: <T = unknown>(request: APIRequest<T>) => {
      return executeRequest<T>(request.method, request.url, request.config);
    },

    addInterceptor: (interceptor: Interceptor) => {
      interceptors.push(interceptor);

      // Return cleanup function
      return () => {
        const index = interceptors.indexOf(interceptor);
        if (index !== -1) {
          interceptors.splice(index, 1);
        }
      };
    },

    clearCache: () => {
      clearCacheStorage();
    },

    invalidateCache: (pattern: string) => {
      invalidateCachePattern(pattern);
    }
  };
}
