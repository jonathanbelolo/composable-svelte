// ============================================================================
// Request Deduplication Layer
// ============================================================================

import type { APIResponse, HTTPMethod } from './types.js';
import { stableStringify } from '../utils/stable-stringify.js';

/**
 * A request's identity for deduplication and caching.
 *
 * Everything that changes what the server would answer: the method, the
 * resolved URL (base URL joined, query excluded), the query parameters, the
 * headers as they will be sent — the client's defaults merged with the
 * request's, before interceptors — and the body. Keys are per client (each
 * `createAPIClient` owns its registry and cache), so the base URL and default
 * headers in the key are defence in depth rather than the boundary.
 *
 * The first form keyed on the raw path with only per-request headers, in one
 * module-global map: two clients built for two users coalesced into one fetch
 * and both received the first user's body (AUDIT-2026-09-03-FINDINGS A1).
 */
export interface RequestIdentity {
	readonly method: HTTPMethod;
	/** Base URL joined and normalised; no query string. */
	readonly url: string;
	readonly params: Record<string, string | number | boolean | null | undefined> | undefined;
	readonly headers: Record<string, string>;
	readonly body: unknown;
}

/** The key two identical requests share. */
export function requestKey(identity: RequestIdentity): string {
	return stableStringify([
		identity.method,
		identity.url,
		identity.params ?? null,
		identity.headers,
		identity.body ?? null
	]);
}

/**
 * Methods coalesced by default. A repeated safe request is one request; a
 * repeated POST is two intents, and coalescing them hid the second (A11).
 * `deduplicate: true` on the request opts a mutation in.
 */
export function isDeduplicableMethod(method: HTTPMethod): boolean {
	return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/**
 * The in-flight requests of one client.
 */
export interface InFlightRegistry {
	/**
	 * Run `execute` for `key`, or join the run already in flight for it. Every
	 * caller receives the same promise; the entry is dropped when it settles.
	 */
	join<T>(key: string, execute: () => Promise<APIResponse<T>>): Promise<APIResponse<T>>;
	/** How many requests are in flight. */
	readonly size: number;
	/** Forget every in-flight request (their promises still settle). */
	clear(): void;
}

/**
 * One registry per client. The map used to be module-global, shared by every
 * client in the process.
 */
export function createInFlightRegistry(): InFlightRegistry {
	const inFlight = new Map<string, Promise<APIResponse<unknown>>>();

	return {
		join<T>(key: string, execute: () => Promise<APIResponse<T>>): Promise<APIResponse<T>> {
			const existing = inFlight.get(key);
			if (existing) return existing as Promise<APIResponse<T>>;

			const promise = execute().finally(() => {
				if (inFlight.get(key) === promise) inFlight.delete(key);
			});
			inFlight.set(key, promise);
			return promise;
		},
		get size() {
			return inFlight.size;
		},
		clear() {
			inFlight.clear();
		}
	};
}
