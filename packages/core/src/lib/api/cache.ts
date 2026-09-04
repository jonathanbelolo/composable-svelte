// ============================================================================
// Response Caching Layer
// ============================================================================

import type { APIResponse, CacheConfig, HTTPMethod, RequestConfig } from './types.js';

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
 * path with no headers, so two hosts or two users could share a body
 * (AUDIT-2026-09-03-FINDINGS A2).
 */
export function createResponseCache(): ResponseCache {
	const entries = new Map<string, CacheEntry>();

	const isValid = (entry: CacheEntry) => Date.now() - entry.timestamp < entry.ttl;

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
			return { ...(entry.response as APIResponse<T>), cached: true };
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
			entries.set(key, { url, response, timestamp: Date.now(), ttl });
			if (entries.size > 1000) {
				for (const [k, entry] of entries) if (!isValid(entry)) entries.delete(k);
			}
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
