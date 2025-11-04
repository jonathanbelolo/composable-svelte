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
     * Request timeout in milliseconds.
     * @default 30000 (30 seconds)
     */
    timeout?: number;
    /**
     * Request headers.
     */
    headers?: Record<string, string>;
    /**
     * Query parameters (will be appended to URL).
     */
    params?: Record<string, string | number | boolean | null | undefined>;
    /**
     * Request body (for POST, PUT, PATCH).
     * Will be JSON-stringified if object/array.
     */
    body?: unknown;
    /**
     * AbortSignal for manual cancellation.
     */
    signal?: AbortSignal;
    /**
     * Enable request deduplication.
     * If true, duplicate in-flight requests will be coalesced.
     * @default true
     */
    deduplicate?: boolean;
    /**
     * Enable retry logic for failed requests.
     * @default true for GET/HEAD/OPTIONS, false for POST/PUT/PATCH/DELETE
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
     * Predicate function to determine if error should be retried.
     * Takes precedence over retryableStatusCodes.
     */
    shouldRetry?: (error: unknown, attempt: number) => boolean;
}
/**
 * Cache configuration for GET requests.
 */
export interface CacheConfig {
    /**
     * Time-to-live for cached responses (milliseconds).
     * @default 300000 (5 minutes)
     */
    ttl?: number;
    /**
     * Custom cache key generator.
     * If not provided, uses normalized URL + params.
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
     * Default headers for all requests.
     */
    headers?: Record<string, string>;
    /**
     * Default timeout for all requests (milliseconds).
     * @default 30000 (30 seconds)
     */
    timeout?: number;
    /**
     * Default retry configuration.
     */
    retry?: boolean | RetryConfig;
    /**
     * Default cache configuration.
     */
    cache?: boolean | CacheConfig;
    /**
     * Enable request deduplication by default.
     * @default true
     */
    deduplicate?: boolean;
    /**
     * Interceptors to apply to all requests.
     */
    interceptors?: Interceptor[];
}
/**
 * Extract response type from APIRequest.
 */
export type InferResponse<T> = T extends APIRequest<infer R> ? R : never;
/**
 * Type-safe request builder.
 */
export declare const Request: {
    /**
     * Create a GET request.
     */
    get: <T = unknown>(url: string, config?: RequestConfig) => APIRequest<T>;
    /**
     * Create a POST request.
     */
    post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => APIRequest<T>;
    /**
     * Create a PUT request.
     */
    put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => APIRequest<T>;
    /**
     * Create a PATCH request.
     */
    patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => APIRequest<T>;
    /**
     * Create a DELETE request.
     */
    delete: <T = unknown>(url: string, config?: RequestConfig) => APIRequest<T>;
    /**
     * Create a HEAD request.
     */
    head: (url: string, config?: RequestConfig) => APIRequest<void>;
};
//# sourceMappingURL=types.d.ts.map