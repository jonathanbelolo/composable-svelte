// ============================================================================
// Response Caching Layer
// ============================================================================

import type { APIResponse, CacheConfig, HTTPMethod, RequestConfig } from './types.js';

/** Entries a client's cache holds before the least recently used is dropped. */
export const DEFAULT_MAX_CACHE_ENTRIES = 100;

export interface ResponseCacheOptions {
	/** @default DEFAULT_MAX_CACHE_ENTRIES */
	readonly maxEntries?: number | undefined;
}

interface CacheEntry {
	/** The path the caller passed, for invalidation by pattern. */
	readonly url: string;
	readonly response: APIResponse<unknown>;
	readonly timestamp: number;
	readonly ttl: number;
}

/**
 * Default TTL (5 minutes).
 */
const DEFAULT_TTL = 300000;

/**
 * The key an entry is stored under: the request key, unless the caller's
 * `cache.key` generator says otherwise. The entry remembers the path it was
 * stored for either way, so a custom-key entry is still reachable by
 * `invalidateCache('/path')` (AUDIT-2026-09-03-FINDINGS A2).
 */
export function cacheKeyFor(
	requestKey: string,
	url: string,
	config: RequestConfig | undefined,
	cacheConfig: boolean | CacheConfig | undefined
): string {
	if (typeof cacheConfig === 'object' && cacheConfig.key) {
		return cacheConfig.key(url, config ?? {});
	}
	return requestKey;
}

/**
 * The response cache of one client.
 */
export interface ResponseCache {
	/** A valid entry for `key`, flagged `cached`, or null. GET only. */
	get<T>(method: HTTPMethod, key: string, cacheConfig: boolean | CacheConfig | undefined): APIResponse<T> | null;
	/** Store a GET response under `key`, remembering the path it answers. */
	set<T>(
		method: HTTPMethod,
		key: string,
		url: string,
		response: APIResponse<T>,
		cacheConfig: boolean | CacheConfig | undefined
	): void;
	/**
	 * Drop entries whose path matches: exact (`/api/users/123`) or prefix
	 * (`/api/users/*`). Matches the path the request was made with, not the key.
	 */
	invalidate(pattern: string): void;
	/** After a mutation: the configured `invalidates`, or the path's prefix. */
	invalidateOnMutation(method: HTTPMethod, url: string, cacheConfig: boolean | CacheConfig | undefined): void;
	clear(): void;
	readonly size: number;
}

/**
 * One cache per client. The store used to be module-global: every client in
 * the process, and `createMockAPI`, read and wrote one map, keyed by the raw
 * path with no headers, so two hosts or two users could share a body. It
 * also handed out the stored object itself, so a caller that edited its
 * response edited the cache, and it was unbounded within the TTL
 * (AUDIT-2026-09-03-FINDINGS A2).
 *
 * Responses are stored and returned as structured clones, so no caller can
 * reach another's copy. The map is a least-recently-used bound: a hit moves
 * the entry to the back, and an insert past `maxEntries` drops expired
 * entries first, then the front. A response `structuredClone` refuses (a
 * response interceptor attached a function, say) is not cached, and says so
 * once with `console.warn` — silently skipping it would look like a cache
 * that never hits.
 */
export function createResponseCache(options: ResponseCacheOptions = {}): ResponseCache {
	const entries = new Map<string, CacheEntry>();
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
	/** Keys whose response could not be cloned; warned about once each. */
	const uncloneable = new Set<string>();

	const isValid = (entry: CacheEntry) => Date.now() - entry.timestamp < entry.ttl;

	const evict = (): void => {
		if (entries.size <= maxEntries) return;
		for (const [key, entry] of entries) if (!isValid(entry)) entries.delete(key);
		while (entries.size > maxEntries) {
			const oldest = entries.keys().next().value;
			if (oldest === undefined) break;
			entries.delete(oldest);
		}
	};

	const invalidate = (pattern: string): void => {
		const isPrefix = pattern.endsWith('*');
		const prefix = isPrefix ? pattern.slice(0, -1) : pattern;
		for (const [key, entry] of entries) {
			if (isPrefix ? entry.url.startsWith(prefix) : entry.url === prefix) entries.delete(key);
		}
	};

	return {
		get<T>(method: HTTPMethod, key: string, cacheConfig: boolean | CacheConfig | undefined): APIResponse<T> | null {
			if (method !== 'GET' || cacheConfig === false || cacheConfig === undefined) return null;
			const entry = entries.get(key);
			if (!entry) return null;
			if (!isValid(entry)) {
				entries.delete(key);
				return null;
			}
			// Most recently used goes to the back.
			entries.delete(key);
			entries.set(key, entry);
			return { ...structuredClone(entry.response as APIResponse<T>), cached: true };
		},

		set<T>(
			method: HTTPMethod,
			key: string,
			url: string,
			response: APIResponse<T>,
			cacheConfig: boolean | CacheConfig | undefined
		): void {
			if (method !== 'GET' || cacheConfig === false || cacheConfig === undefined) return;
			const ttl = typeof cacheConfig === 'object' && cacheConfig.ttl !== undefined ? cacheConfig.ttl : DEFAULT_TTL;
			let stored: APIResponse<unknown>;
			try {
				stored = structuredClone(response);
			} catch (error) {
				if (!uncloneable.has(key)) {
					uncloneable.add(key);
					console.warn(
						`[Composable Svelte] Response for ${url} was not cached: it cannot be cloned (${(error as Error).message})`
					);
				}
				return;
			}
			entries.delete(key);
			entries.set(key, { url, response: stored, timestamp: Date.now(), ttl });
			evict();
		},

		invalidate,

		invalidateOnMutation(method: HTTPMethod, url: string, cacheConfig: boolean | CacheConfig | undefined): void {
			if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
			if (typeof cacheConfig === 'object' && cacheConfig.invalidateOnMutation === false) return;
			if (typeof cacheConfig === 'object' && cacheConfig.invalidates) {
				for (const pattern of cacheConfig.invalidates) invalidate(pattern);
				return;
			}
			// Default: everything under the path. POST /api/users -> /api/users*
			invalidate(`${url.split('?')[0]}*`);
		},

		clear() {
			entries.clear();
		},

		get size() {
			return entries.size;
		}
	};
}
