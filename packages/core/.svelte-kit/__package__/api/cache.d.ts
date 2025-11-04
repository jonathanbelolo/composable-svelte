import type { APIResponse, CacheConfig, HTTPMethod, RequestConfig } from './types.js';
/**
 * Get cached response if available and valid.
 */
export declare function getCachedResponse<T>(method: HTTPMethod, url: string, config?: RequestConfig, cacheConfig?: boolean | CacheConfig): APIResponse<T> | null;
/**
 * Store response in cache.
 */
export declare function setCachedResponse<T>(method: HTTPMethod, url: string, response: APIResponse<T>, config?: RequestConfig, cacheConfig?: boolean | CacheConfig): void;
/**
 * Invalidate cache entries matching a pattern.
 *
 * Patterns:
 * - Exact match: "/api/users/123"
 * - Prefix match: "/api/users/*"
 */
export declare function invalidateCache(pattern: string): void;
/**
 * Invalidate cache based on mutation.
 * This is called after POST/PUT/PATCH/DELETE requests.
 */
export declare function invalidateCacheOnMutation(method: HTTPMethod, url: string, cacheConfig?: boolean | CacheConfig): void;
/**
 * Clear all cached responses.
 */
export declare function clearCache(): void;
/**
 * Get cache size (for debugging/testing).
 */
export declare function getCacheSize(): number;
//# sourceMappingURL=cache.d.ts.map