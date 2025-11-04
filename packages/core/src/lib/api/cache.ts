// ============================================================================
// Response Caching Layer
// ============================================================================

import type { APIResponse, CacheConfig, HTTPMethod, RequestConfig } from './types.js';

// ============================================================================
// Cache Entry
// ============================================================================

interface CacheEntry<T> {
  response: APIResponse<T>;
  timestamp: number;
  ttl: number;
}

// ============================================================================
// Cache State
// ============================================================================

/**
 * In-memory cache storage.
 */
const cache = new Map<string, CacheEntry<any>>();

/**
 * Default TTL (5 minutes).
 */
const DEFAULT_TTL = 300000;

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Stable stringify for cache keys (same as deduplication).
 */
function stableStringify(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (obj === undefined) {
    return 'undefined';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items: string[] = [];
    for (let i = 0; i < obj.length; i++) {
      items.push(stableStringify(obj[i]));
    }
    return '[' + items.join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== undefined) {
      const value = (obj as Record<string, unknown>)[key];
      pairs.push('"' + key + '":' + stableStringify(value));
    }
  }

  return '{' + pairs.join(',') + '}';
}

/**
 * Generate cache key from request parameters.
 */
function generateCacheKey(
  method: HTTPMethod,
  url: string,
  config?: RequestConfig,
  cacheConfig?: CacheConfig
): string {
  // Use custom key generator if provided
  if (cacheConfig && typeof cacheConfig === 'object' && cacheConfig.key) {
    return cacheConfig.key(url, config || {});
  }

  // Default: method + url + params
  const parts = [
    method,
    url,
    config?.params ? stableStringify(config.params) : ''
  ];

  return parts.join('::');
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Check if cache entry is still valid (not expired).
 */
function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  const now = Date.now();
  return now - entry.timestamp < entry.ttl;
}

/**
 * Get cached response if available and valid.
 */
export function getCachedResponse<T>(
  method: HTTPMethod,
  url: string,
  config?: RequestConfig,
  cacheConfig?: boolean | CacheConfig
): APIResponse<T> | null {
  // Only cache GET requests
  if (method !== 'GET') {
    return null;
  }

  // Check if caching is disabled
  if (cacheConfig === false) {
    return null;
  }

  // Generate cache key
  const key = generateCacheKey(
    method,
    url,
    config,
    typeof cacheConfig === 'object' ? cacheConfig : undefined
  );

  // Check cache
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  // Check if valid
  if (!isCacheValid(entry)) {
    cache.delete(key);
    return null;
  }

  // Return cached response with cached flag
  return {
    ...entry.response,
    cached: true
  };
}

/**
 * Store response in cache.
 */
export function setCachedResponse<T>(
  method: HTTPMethod,
  url: string,
  response: APIResponse<T>,
  config?: RequestConfig,
  cacheConfig?: boolean | CacheConfig
): void {
  // Only cache GET requests
  if (method !== 'GET') {
    return;
  }

  // Check if caching is disabled
  if (cacheConfig === false) {
    return;
  }

  // Determine TTL
  let ttl = DEFAULT_TTL;
  if (typeof cacheConfig === 'object' && cacheConfig.ttl !== undefined) {
    ttl = cacheConfig.ttl;
  }

  // Generate cache key
  const key = generateCacheKey(
    method,
    url,
    config,
    typeof cacheConfig === 'object' ? cacheConfig : undefined
  );

  // Store in cache
  cache.set(key, {
    response,
    timestamp: Date.now(),
    ttl
  });

  // Cleanup old entries if cache is getting large
  if (cache.size > 1000) {
    cleanupExpiredEntries();
  }
}

/**
 * Invalidate cache entries matching a pattern.
 *
 * Patterns:
 * - Exact match: "/api/users/123"
 * - Prefix match: "/api/users/*"
 */
export function invalidateCache(pattern: string): void {
  const isPrefix = pattern.endsWith('*');
  const prefix = isPrefix ? pattern.slice(0, -1) : pattern;

  const keysToDelete: string[] = [];

  cache.forEach((_, key) => {
    // Extract URL from cache key (format: "METHOD::URL::params")
    const parts = key.split('::');
    const url = parts[1] || '';

    if (isPrefix) {
      if (url.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    } else {
      if (url === prefix) {
        keysToDelete.push(key);
      }
    }
  });

  for (let i = 0; i < keysToDelete.length; i++) {
    const key = keysToDelete[i];
    if (key !== undefined) {
      cache.delete(key);
    }
  }
}

/**
 * Invalidate cache based on mutation.
 * This is called after POST/PUT/PATCH/DELETE requests.
 */
export function invalidateCacheOnMutation(
  method: HTTPMethod,
  url: string,
  cacheConfig?: boolean | CacheConfig
): void {
  // Only invalidate for mutation methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }

  // Check if invalidation is disabled
  if (typeof cacheConfig === 'object' && cacheConfig.invalidateOnMutation === false) {
    return;
  }

  // Invalidate specific patterns if configured
  if (typeof cacheConfig === 'object' && cacheConfig.invalidates) {
    for (let i = 0; i < cacheConfig.invalidates.length; i++) {
      const pattern = cacheConfig.invalidates[i];
      if (pattern !== undefined) {
        invalidateCache(pattern);
      }
    }
    return;
  }

  // Default: invalidate all cache entries with matching URL prefix
  // Example: POST /api/users -> invalidates /api/users/*
  const urlWithoutQuery = url.split('?')[0];
  invalidateCache(`${urlWithoutQuery}*`);
}

/**
 * Clear all cached responses.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Remove expired cache entries.
 */
function cleanupExpiredEntries(): void {
  const keysToDelete: string[] = [];

  cache.forEach((entry, key) => {
    if (!isCacheValid(entry)) {
      keysToDelete.push(key);
    }
  });

  for (let i = 0; i < keysToDelete.length; i++) {
    const key = keysToDelete[i];
    if (key !== undefined) {
      cache.delete(key);
    }
  }
}

/**
 * Get cache size (for debugging/testing).
 */
export function getCacheSize(): number {
  return cache.size;
}
