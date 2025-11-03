// ============================================================================
// Spy API Client for Testing
// ============================================================================

import type { APIClient, APIRequest, APIResponse, HTTPMethod, RequestConfig } from '../types.js';
import { createMockAPI } from './mock-client.js';

// ============================================================================
// Types
// ============================================================================

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
export function createSpyAPI(
  baseClient: APIClient = createMockAPI({})
): SpyAPIClient {
  const calls: RecordedCall[] = [];
  const responses: APIResponse<any>[] = [];
  const errors: Error[] = [];

  function recordCall(method: HTTPMethod, url: string, config?: RequestConfig): void {
    calls.push({
      method,
      url,
      config,
      timestamp: Date.now()
    });
  }

  async function executeAndTrack<T>(
    method: HTTPMethod,
    url: string,
    config: RequestConfig | undefined,
    executor: () => Promise<APIResponse<T>>
  ): Promise<APIResponse<T>> {
    recordCall(method, url, config);

    try {
      const response = await executor();
      responses.push(response);
      return response;
    } catch (error) {
      errors.push(error as Error);
      throw error;
    }
  }

  return {
    calls,
    responses,
    errors,

    callsTo(method: HTTPMethod, url: string): RecordedCall[] {
      return calls.filter(c => c.method === method && c.url === url);
    },

    callsMatching(methodPattern: string, urlPattern: string | RegExp): RecordedCall[] {
      const urlRegex = typeof urlPattern === 'string'
        ? new RegExp('^' + urlPattern.replace(/\*/g, '.*') + '$')
        : urlPattern;

      return calls.filter(c => {
        const methodMatch = methodPattern === '*' || c.method === methodPattern;
        const urlMatch = urlRegex.test(c.url);
        return methodMatch && urlMatch;
      });
    },

    reset(): void {
      calls.length = 0;
      responses.length = 0;
      errors.length = 0;
    },

    lastCall(): RecordedCall | undefined {
      return calls[calls.length - 1];
    },

    lastResponse(): APIResponse<any> | undefined {
      return responses[responses.length - 1];
    },

    lastError(): Error | undefined {
      return errors[errors.length - 1];
    },

    get: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeAndTrack('GET', url, config, () => baseClient.get<T>(url, config));
    },

    post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeAndTrack('POST', url, { ...config, body }, () =>
        baseClient.post<T>(url, body, config)
      );
    },

    put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeAndTrack('PUT', url, { ...config, body }, () =>
        baseClient.put<T>(url, body, config)
      );
    },

    patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeAndTrack('PATCH', url, { ...config, body }, () =>
        baseClient.patch<T>(url, body, config)
      );
    },

    delete: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeAndTrack('DELETE', url, config, () => baseClient.delete<T>(url, config));
    },

    head: (url: string, config?: RequestConfig) => {
      return executeAndTrack('HEAD', url, config, () => baseClient.head(url, config));
    },

    request: <T = unknown>(request: APIRequest<T>) => {
      return executeAndTrack(request.method, request.url, request.config, () =>
        baseClient.request<T>(request)
      );
    },

    addInterceptor: (interceptor) => {
      return baseClient.addInterceptor(interceptor);
    },

    clearCache: () => {
      baseClient.clearCache();
    },

    invalidateCache: (pattern: string) => {
      baseClient.invalidateCache(pattern);
    }
  };
}
