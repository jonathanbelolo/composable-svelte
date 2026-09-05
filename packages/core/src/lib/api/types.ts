// ============================================================================
// Core API Types
// ============================================================================

/**
 * HTTP methods supported by the API client.
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Safe HTTP methods (idempotent, can be safely retried).
 */
export type SafeHTTPMethod = 'GET' | 'HEAD' | 'OPTIONS' | 'PUT' | 'DELETE';

/**
 * Request configuration for API calls.
 */
export interface RequestConfig {
  /**
   * This caller's bound on the whole request, retries included, in
   * milliseconds; rejects with `TimeoutError`. `Infinity` sets no bound;
   * `0`, a negative or `NaN` is a `TypeError`. Another caller sharing the
   * same in-flight request keeps its own bound.
   * @default the client's `timeout`, itself 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Request headers. Names are case-insensitive: they are lower-cased when
   * merged with the client's defaults (a later duplicate wins), and reach
   * interceptors, the request key and mock handlers lower-cased —
   * `config.headers.authorization`.
   */
  headers?: Record<string, string>;

  /**
   * Query parameters (will be appended to URL).
   */
  params?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Request body (for POST, PUT, PATCH). Plain data — `null`, primitives,
   * arrays and plain objects, `toJSON` honoured — is sent as JSON with
   * `content-type: application/json` unless a content type is set. A
   * `BodyInit` (a string, `FormData`, `Blob`, `ArrayBuffer`, typed array,
   * `URLSearchParams` or `ReadableStream`) is passed to `fetch` untouched,
   * with no content type added. A body with no JSON form is never coalesced
   * or cached; a body with no JSON form at all (a cycle) is a `TypeError`.
   */
  body?: unknown;

  /**
   * AbortSignal for manual cancellation.
   */
  signal?: AbortSignal;

  /**
   * Coalesce this request with an identical one already in flight on this
   * client. `true` opts in regardless of method — the only way a POST, PUT,
   * PATCH or DELETE is coalesced; `false` opts out; unset follows the client's
   * `deduplicate` for GET, HEAD and OPTIONS.
   * @default the client's setting, for safe methods
   */
  deduplicate?: boolean;

  /**
   * This request's retry policy, replacing the client's. `true` retries
   * under the defaults — any method; a partial policy is merged with them;
   * `false` never retries. The resolved policy is part of the request's
   * identity: two concurrent callers with different policies do not share
   * an attempt.
   * @default the client's `retry`, itself `false`
   */
  retry?: boolean | RetryConfig;

  /**
   * Enable response caching.
   * Only applies to GET requests.
   * @default false
   */
  cache?: boolean | CacheConfig;
}

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts.
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay before first retry (milliseconds).
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay between retries (milliseconds).
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Backoff multiplier (exponential backoff).
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Status codes that should trigger a retry.
   * @default [408, 429, 500, 502, 503, 504]
   */
  retryableStatusCodes?: number[];

  /**
   * Consulted once per retryable failure, after the status check, with the
   * attempt just made (1 for the first); it can veto a retry, not add one.
   * The same function object shared by two callers is one policy; two
   * functions are two.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Cache configuration for GET requests.
 */
export interface CacheConfig {
  /**
   * Time-to-live for cached responses (milliseconds); a positive finite
   * number, else a `TypeError`.
   * @default 300000 (5 minutes)
   */
  ttl?: number;

  /**
   * Custom cache key generator, replacing the request key (method, resolved
   * URL, query parameters, the headers after the request interceptors, body,
   * retry policy). The entry still remembers the path it was requested with,
   * so `invalidateCache('/path')` reaches it.
   */
  key?: (url: string, config: RequestConfig) => string;

  /**
   * Whether to invalidate cache on mutation (POST/PUT/PATCH/DELETE).
   * @default true
   */
  invalidateOnMutation?: boolean;

  /**
   * URL patterns to invalidate when this request completes.
   * Supports exact matches and prefix matching (ending with *).
   */
  invalidates?: string[];
}

/**
 * Cache configuration for a client: everything a request can set, plus the
 * bound on the client's cache. `maxEntries` is not a per-request option, so
 * it is not on `CacheConfig` — a request that set it would be silently
 * ignored, and the type says so instead.
 */
export interface ClientCacheConfig extends CacheConfig {
  /**
   * Entries the client's cache holds before the least recently used is
   * dropped; a positive integer, else a `TypeError`.
   * @default 100
   */
  maxEntries?: number | undefined;
}

/**
 * API request builder with type-safe response.
 */
export interface APIRequest<Response = unknown> {
  /**
   * HTTP method.
   */
  readonly method: HTTPMethod;

  /**
   * Request URL (relative or absolute).
   */
  readonly url: string;

  /**
   * Request configuration.
   */
  readonly config?: RequestConfig;

  /**
   * Response type (phantom type for type safety).
   * Not used at runtime - only for TypeScript inference.
   */
  readonly _response?: Response;
}

/**
 * API response with metadata.
 */
export interface APIResponse<T = unknown> {
  /**
   * HTTP status code.
   */
  status: number;

  /**
   * Response headers.
   */
  headers: Record<string, string>;

  /**
   * Parsed response body.
   */
  data: T;

  /**
   * Whether response was served from cache.
   */
  cached?: boolean;
}

/**
 * Request interceptor (runs before request is sent).
 */
export interface RequestInterceptor {
  /**
   * Intercept and optionally modify the request.
   * Return modified config or throw to cancel request.
   */
  onRequest: (url: string, config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
}

/**
 * Response interceptor (runs after response is received).
 */
export interface ResponseInterceptor {
  /**
   * Intercept and optionally modify the response.
   * Return modified response or throw to reject.
   */
  onResponse: <T>(response: APIResponse<T>) => APIResponse<T> | Promise<APIResponse<T>>;
}

/**
 * Error interceptor (runs when request fails).
 */
export interface ErrorInterceptor {
  /**
   * Intercept errors and optionally recover.
   * Return a response to recover, or throw to propagate error.
   */
  onError: (error: unknown) => never | APIResponse<unknown> | Promise<never | APIResponse<unknown>>;
}

/**
 * Combined interceptor (all hooks optional).
 */
export interface Interceptor {
  /**
   * Request interceptor hook.
   */
  onRequest?: (url: string, config: RequestConfig) => RequestConfig | Promise<RequestConfig>;

  /**
   * Response interceptor hook.
   */
  onResponse?: <T>(response: APIResponse<T>) => APIResponse<T> | Promise<APIResponse<T>>;

  /**
   * Error interceptor hook.
   */
  onError?: (error: unknown) => never | APIResponse<unknown> | Promise<never | APIResponse<unknown>>;
}

/**
 * API client interface.
 */
export interface APIClient {
  /**
   * Perform a GET request.
   */
  get: <T = unknown>(url: string, config?: RequestConfig) => Promise<APIResponse<T>>;

  /**
   * Perform a POST request.
   */
  post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => Promise<APIResponse<T>>;

  /**
   * Perform a PUT request.
   */
  put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => Promise<APIResponse<T>>;

  /**
   * Perform a PATCH request.
   */
  patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => Promise<APIResponse<T>>;

  /**
   * Perform a DELETE request.
   */
  delete: <T = unknown>(url: string, config?: RequestConfig) => Promise<APIResponse<T>>;

  /**
   * Perform a HEAD request.
   */
  head: (url: string, config?: RequestConfig) => Promise<APIResponse<void>>;

  /**
   * Perform a request with custom method.
   */
  request: <T = unknown>(request: APIRequest<T>) => Promise<APIResponse<T>>;

  /**
   * Add an interceptor.
   * Returns a function to remove the interceptor.
   */
  addInterceptor: (interceptor: Interceptor) => () => void;

  /**
   * Clear all caches.
   */
  clearCache: () => void;

  /**
   * Invalidate cache entries matching pattern.
   * Supports exact matches and prefix matching (ending with *).
   */
  invalidateCache: (pattern: string) => void;
}

/**
 * API client configuration.
 */
export interface APIClientConfig {
  /**
   * Base URL for all requests.
   * Will be prepended to relative URLs.
   */
  baseURL?: string;

  /**
   * Default headers for all requests. Names are lower-cased when merged; a
   * request's header of the same name, in any case, wins.
   */
  headers?: Record<string, string>;

  /**
   * Default timeout for all requests (milliseconds); `Infinity` for none.
   * `0`, a negative or `NaN` is a `TypeError`.
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Default retry policy. `false` never retries; `true` or a partial policy
   * retries **any** method under the defaults merged with it — a
   * client-level `retry: true` retries POST and PATCH too
   * (AUDIT-2026-09-03-FINDINGS A5, open for R3.1); set `retry` per request
   * for mutations. A request's `retry` replaces this.
   * @default false
   */
  retry?: boolean | RetryConfig;

  /**
   * Default cache configuration, and the bound on this client's cache.
   */
  cache?: boolean | ClientCacheConfig;

  /**
   * Coalesce identical concurrent safe requests (GET, HEAD, OPTIONS) into one
   * fetch by default. A request's own `deduplicate` overrides this.
   * @default true
   */
  deduplicate?: boolean;

  /**
   * Interceptors to apply to all requests.
   */
  interceptors?: Interceptor[];
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Extract response type from APIRequest.
 */
export type InferResponse<T> = T extends APIRequest<infer R> ? R : never;

/**
 * Type-safe request builder.
 */
export const Request = {
  /**
   * Create a GET request.
   */
  get: <T = unknown>(url: string, config?: RequestConfig): APIRequest<T> => ({
    method: 'GET',
    url,
    ...(config !== undefined && { config })
  }),

  /**
   * Create a POST request.
   */
  post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig): APIRequest<T> => ({
    method: 'POST',
    url,
    config: { ...config, body }
  }),

  /**
   * Create a PUT request.
   */
  put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig): APIRequest<T> => ({
    method: 'PUT',
    url,
    config: { ...config, body }
  }),

  /**
   * Create a PATCH request.
   */
  patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig): APIRequest<T> => ({
    method: 'PATCH',
    url,
    config: { ...config, body }
  }),

  /**
   * Create a DELETE request.
   */
  delete: <T = unknown>(url: string, config?: RequestConfig): APIRequest<T> => ({
    method: 'DELETE',
    url,
    ...(config !== undefined && { config })
  }),

  /**
   * Create a HEAD request.
   */
  head: (url: string, config?: RequestConfig): APIRequest<void> => ({
    method: 'HEAD',
    url,
    ...(config !== undefined && { config })
  })
};
