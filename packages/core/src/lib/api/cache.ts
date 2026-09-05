// ============================================================================
// Response Caching Layer
// ============================================================================

import { createWarnOnce } from './pipeline.js';
import type { APIResponse, CacheConfig, ClientCacheConfig, HTTPMethod, RequestConfig } from './types.js';

/** Entries a client's cache holds before the least recently used is dropped. */
export const DEFAULT_MAX_CACHE_ENTRIES = 100;

export interface ResponseCacheOptions {
	/** @default DEFAULT_MAX_CACHE_ENTRIES */
	readonly maxEntries?: number | undefined;
}

interface CacheEntry {
	/** The normalised path the entry answers, for invalidation by pattern. */
	readonly path: string;
	readonly response: APIResponse<unknown>;
	readonly timestamp: number;
	readonly ttl: number;
}

/**
 * Default TTL (5 minutes).
 */
const DEFAULT_TTL = 300000;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The path an entry is filed under and a pattern is matched against: the
 * query and fragment stripped, a leading slash, duplicate slashes collapsed;
 * an absolute URL keeps its scheme and host. The base URL is never joined —
 * a pattern names the path the caller passed. `'products'`, `'/products'`
 * and `'/products?page=2'` are one path. Entries were filed under the raw
 * path, so `invalidateCache('/products')` missed an entry made with
 * `get('products')` (R1-REVIEW 1.9).
 */
export function normalizePath(url: string): string {
	const end = url.search(/[?#]/);
	const path = end === -1 ? url : url.slice(0, end);
	const scheme = SCHEME.exec(path);
	if (scheme) return scheme[0] + path.slice(scheme[0].length).replace(/\/{2,}/g, '/');
	return (path.startsWith('/') ? path : `/${path}`).replace(/\/{2,}/g, '/');
}

/**
 * The key an entry is stored under: the request key, unless the caller's
 * `cache.key` generator says otherwise; null when the request has no key
 * (a body with no JSON form) and no generator, so it is never cached. The
 * entry remembers the path it was stored for either way, so a custom-key
 * entry is still reachable by `invalidateCache('/path')`
 * (AUDIT-2026-09-03-FINDINGS A2).
 */
export function cacheKeyFor(
	requestKey: string | null,
	url: string,
	config: RequestConfig | undefined,
	cacheConfig: boolean | CacheConfig | undefined
): string | null {
	if (typeof cacheConfig === 'object' && cacheConfig.key) {
		return cacheConfig.key(url, config ?? {});
	}
	return requestKey;
}

/**
 * `ttl` is a positive finite number of milliseconds; `maxEntries` a positive
 * integer. Anything else is a `TypeError` at the call, not a cache that
 * never hits or never evicts (R1-REVIEW 1.9).
 */
export function validateCacheConfig(
	config: boolean | ClientCacheConfig | undefined,
	site: 'createAPIClient' | 'request'
): void {
	if (typeof config !== 'object' || config === null) return;
	const { ttl, maxEntries } = config;
	if (ttl !== undefined && !(typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0)) {
		throw new TypeError(
			`[Composable Svelte] ${site}: cache.ttl must be a positive finite number of milliseconds, got ${String(ttl)}`
		);
	}
	if (maxEntries !== undefined && !(Number.isInteger(maxEntries) && maxEntries > 0)) {
		throw new TypeError(`[Composable Svelte] ${site}: cache.maxEntries must be a positive integer, got ${String(maxEntries)}`);
	}
}

/**
 * The response cache of one client.
 */
export interface ResponseCache {
	/** Whether a response to this request would be stored: GET, caching on, a key. */
	stores(method: HTTPMethod, key: string | null, cacheConfig: boolean | CacheConfig | undefined): boolean;
	/** A valid entry for `key`, flagged `cached`, or null. GET only. */
	get<T>(method: HTTPMethod, key: string | null, cacheConfig: boolean | CacheConfig | undefined): APIResponse<T> | null;
	/** Store a GET response under `key`, filed under the normalised `path`. */
	set<T>(
		method: HTTPMethod,
		key: string | null,
		path: string,
		response: APIResponse<T>,
		cacheConfig: boolean | CacheConfig | undefined
	): void;
	/**
	 * Drop entries whose path matches: exact (`/api/users/123`) or prefix
	 * (`/api/users/*`). The pattern is normalised as the entries were, so
	 * `'products'`, `'/products'` and `'/products?x=1'` name one path.
	 */
	invalidate(pattern: string): void;
	/** After a mutation: the configured `invalidates`, or the path's prefix. */
	invalidateOnMutation(method: HTTPMethod, path: string, cacheConfig: boolean | CacheConfig | undefined): void;
	/** `console.warn` once per key, the set bounded by `maxEntries` and emptied by `clear()`. */
	warnOnce(key: string, message: string): void;
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
 * reach another's copy — and a clone is plain data: a class instance in
 * `data` comes back as a plain object. The map is a least-recently-used
 * bound: a hit moves the entry to the back, and an insert past `maxEntries`
 * drops expired entries first, then the front. A response `structuredClone`
 * refuses (a response interceptor attached a function, say) is not cached,
 * and says so once per path with `console.warn` — silently skipping it would
 * look like a cache that never hits. The set of paths warned about is bounded
 * by `maxEntries` too; R1's grew without limit (R1-REVIEW 1.9).
 */
export function createResponseCache(options: ResponseCacheOptions = {}): ResponseCache {
	const entries = new Map<string, CacheEntry>();
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
	const warnings = createWarnOnce(maxEntries);

	const isValid = (entry: CacheEntry) => Date.now() - entry.timestamp < entry.ttl;

	const isOn = (method: HTTPMethod, cacheConfig: boolean | CacheConfig | undefined) =>
		method === 'GET' && cacheConfig !== false && cacheConfig !== undefined;

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
		const prefix = normalizePath(isPrefix ? pattern.slice(0, -1) : pattern);
		for (const [key, entry] of entries) {
			if (isPrefix ? entry.path.startsWith(prefix) : entry.path === prefix) entries.delete(key);
		}
	};

	return {
		stores(method, key, cacheConfig) {
			return isOn(method, cacheConfig) && key !== null;
		},

		get<T>(method: HTTPMethod, key: string | null, cacheConfig: boolean | CacheConfig | undefined): APIResponse<T> | null {
			if (!isOn(method, cacheConfig) || key === null) return null;
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
			key: string | null,
			path: string,
			response: APIResponse<T>,
			cacheConfig: boolean | CacheConfig | undefined
		): void {
			if (!isOn(method, cacheConfig) || key === null) return;
			const filed = normalizePath(path);
			const ttl = typeof cacheConfig === 'object' && cacheConfig.ttl !== undefined ? cacheConfig.ttl : DEFAULT_TTL;
			let stored: APIResponse<unknown>;
			try {
				stored = structuredClone(response);
			} catch (error) {
				warnings.warn(
					`uncloneable:${filed}`,
					`[Composable Svelte] Response for ${filed} was not cached: it cannot be cloned (${(error as Error).message})`
				);
				return;
			}
			entries.delete(key);
			entries.set(key, { path: filed, response: stored, timestamp: Date.now(), ttl });
			evict();
		},

		invalidate,

		invalidateOnMutation(method: HTTPMethod, path: string, cacheConfig: boolean | CacheConfig | undefined): void {
			if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
			if (typeof cacheConfig === 'object' && cacheConfig.invalidateOnMutation === false) return;
			if (typeof cacheConfig === 'object' && cacheConfig.invalidates) {
				for (const pattern of cacheConfig.invalidates) invalidate(pattern);
				return;
			}
			// Default: everything under the path. POST /api/users -> /api/users*
			invalidate(`${normalizePath(path)}*`);
		},

		warnOnce(key, message) {
			warnings.warn(key, message);
		},

		clear() {
			entries.clear();
			warnings.clear();
		},

		get size() {
			return entries.size;
		}
	};
}
