// ============================================================================
// The request pipeline shared by createAPIClient and createMockAPI
// ============================================================================
//
// Internal: not in any barrel. Both clients share request interceptors,
// finalization, identity, cache and response-interceptor primitives. The real
// client additionally resolves paths against its configured base URL; the mock
// accepts caller-supplied route URLs without a base URL (R1-REVIEW 1.7, 1.9).

import { CancelledError, NetworkError } from './errors.js';
import { isPlainData, type RequestIdentity } from './deduplication.js';
import type { ResolvedRetryConfig } from './retry.js';
import type { APIResponse, HTTPMethod, Interceptor, RequestConfig } from './types.js';

// ============================================================================
// Headers
// ============================================================================

/**
 * Header names lower-cased, a later duplicate winning. HTTP header names
 * are case-insensitive and the `Headers` API folds them; the first form
 * compared them case-sensitively, so `Content-Type` and `content-type` were
 * both sent and `Authorization`/`authorization` never merged
 * (R1-REVIEW 1.9, A10).
 */
export function foldHeaders(headers: Record<string, string> | undefined): Record<string, string> {
	const folded: Record<string, string> = {};
	if (!headers) return folded;
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined) folded[name.toLowerCase()] = value;
	}
	return folded;
}

/** Merge header sets, later sets winning, names lower-cased. */
export function mergeHeaders(...sets: (Record<string, string> | undefined)[]): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const set of sets) Object.assign(merged, foldHeaders(set));
	return merged;
}

// ============================================================================
// URLs
// ============================================================================

/**
 * Join a base URL and path, collapsing duplicate slashes in the joined path
 * while preserving the request query and fragment verbatim. An absolute request
 * URL with an explicit scheme://, or any request without a base URL, is returned
 * as given. Leading // retains the existing redundant-path-slash behavior;
 * network-path references are not resolved as a separate host.
 */
export function normalizeURL(baseURL: string | undefined, path: string): string {
	if (!baseURL || /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(path)) return path;
	const splitIndex = path.search(/[?#]/);
	const pathname = splitIndex === -1 ? path : path.slice(0, splitIndex);
	const suffix = splitIndex === -1 ? '' : path.slice(splitIndex);
	const normalizedBase = baseURL.replace(/\/$/, '');
	const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
	const joinedPath = `${normalizedBase}${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1');
	return `${joinedPath}${suffix}`;
}

/** The query string for `params`, `null` and `undefined` values omitted; empty when there is nothing. */
export function buildQueryString(
	params: Record<string, string | number | boolean | null | undefined> | undefined
): string {
	if (!params) return '';
	const entries: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value !== null && value !== undefined) {
			entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	}
	return entries.length > 0 ? `?${entries.join('&')}` : '';
}

// ============================================================================
// Bodies
// ============================================================================

/**
 * A body `fetch` takes as it is: sent untouched, with no content type added
 * (the browser sets one for `FormData` and `Blob`). Everything else is plain
 * data, sent as JSON. The first form JSON-stringified every object, so a
 * `FormData` went out as the text `{}` under `application/json`
 * (AUDIT-2026-09-03-FINDINGS A6).
 */
export function isBodyInit(body: unknown): body is BodyInit {
	if (typeof body === 'string') return true;
	if (typeof body !== 'object' || body === null) return false;
	return (
		(typeof FormData !== 'undefined' && body instanceof FormData) ||
		(typeof Blob !== 'undefined' && body instanceof Blob) ||
		(typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) ||
		(typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
		(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
	);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * A timeout is a positive number of milliseconds, or `Infinity` for no bound.
 * `0`, a negative, `NaN` and a non-number are refused: `timeout: 0` rejected
 * every request at once, and there was no value meaning "none"
 * (R1-REVIEW 1.9, A10). A finite value past what `setTimeout` can hold
 * (2^31 − 1 ms) is treated as `Infinity`, since the timer would fire at once.
 */
export function validateTimeout(value: unknown, site: 'createAPIClient' | 'request'): number {
	if (typeof value === 'number' && (value === Infinity || (Number.isFinite(value) && value > 0))) {
		return value > 2_147_483_647 ? Infinity : value;
	}
	throw new TypeError(
		`[Composable Svelte] ${site}: timeout must be a positive number of milliseconds or Infinity, got ${String(value)}`
	);
}

// ============================================================================
// The prepared request
// ============================================================================

/** What will be sent, and the identity it is keyed by. */
export interface PreparedRequest {
	readonly method: HTTPMethod;
	/** Resolved request URL (base joined for relative paths), with configured params merged over same-named inline query keys. */
	readonly url: string;
	/** Names lower-cased; `content-type: application/json` added for a plain body when absent. */
	readonly headers: Record<string, string>;
	/** A `BodyInit` as given, JSON text for plain data, `undefined` for none. */
	readonly body: BodyInit | undefined;
	readonly identity: RequestIdentity;
}

export function mergeURL(
	url: string,
	params?: Record<string, string | number | boolean | null | undefined>
): { wireURL: string; identityURL: string } {
	const hashIndex = url.indexOf('#');
	const hash = hashIndex !== -1 ? url.slice(hashIndex) : '';
	const beforeHash = hashIndex !== -1 ? url.slice(0, hashIndex) : url;
	const qIndex = beforeHash.indexOf('?');
	const base = qIndex !== -1 ? beforeHash.slice(0, qIndex) : beforeHash;
	const rawQuery = qIndex !== -1 ? beforeHash.slice(qIndex + 1) : '';

	const overrides = new Set(
		params ? Object.entries(params).filter(([, v]) => v != null).map(([k]) => k) : []
	);
	if (overrides.size === 0) return { wireURL: url, identityURL: beforeHash };
	const pairs = rawQuery
		? rawQuery.split('&').filter((pair) => {
				if (!pair) return false;
				const rawKey = pair.split('=')[0]!;
				try {
					return !overrides.has(decodeURIComponent(rawKey.replace(/\+/g, ' ')));
				} catch {
					return !overrides.has(rawKey);
				}
		  })
		: [];
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value != null) pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	}
	const query = pairs.length > 0 ? `?${pairs.join('&')}` : '';
	return { wireURL: `${base}${query}${hash}`, identityURL: `${base}${query}` };
}

/**
 * Serialise once per caller, before the request joins an attempt, so a body
 * that cannot be serialised (a cycle) is this caller's error with no fetch
 * and no retry — the first form threw inside the fetch, wrapped it as a
 * retryable `NetworkError` and retried it (A15).
 */
export function finalizeRequest(
	method: HTTPMethod,
	resolvedURL: string,
	config: RequestConfig,
	retry: ResolvedRetryConfig | null
): PreparedRequest {
	const headers = foldHeaders(config.headers);
	const { params, body } = config;
	let sent: BodyInit | undefined;
	if (body === undefined) {
		sent = undefined;
	} else if (isBodyInit(body)) {
		sent = body;
	} else {
		if (!headers['content-type']) headers['content-type'] = 'application/json';
		sent = JSON.stringify(body);
	}
	const { wireURL } = mergeURL(resolvedURL, params);
	// Match the prior stable params-object identity without reordering inline query pairs.
	const canonicalParams = params ? Object.fromEntries(Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : undefined;
	const { identityURL } = mergeURL(resolvedURL, canonicalParams);
	return {
		method,
		url: wireURL,
		headers,
		body: sent,
		identity: { method, url: identityURL, params: undefined, headers, body, retry }
	};
}

// ============================================================================
// Interceptors
// ============================================================================

/**
 * Request interceptors, once, in order, on the resolved request — before the
 * key is computed, so a header an interceptor adds is part of the request's
 * identity. Only `headers`, `body` and `params` from each result are kept;
 * an interceptor cannot change the URL (its signature receives it and
 * returns a config). The first form ran them inside every retry attempt and
 * after the key, and read back only `headers` (R1-REVIEW 1.7, A8).
 */
export async function runRequestInterceptors(
	interceptors: readonly Interceptor[],
	url: string,
	config: RequestConfig
): Promise<RequestConfig> {
	let current = config;
	for (const interceptor of interceptors) {
		if (!interceptor.onRequest) continue;
		const next = await interceptor.onRequest(url, current);
		current = {
			...current,
			...(next.headers !== undefined ? { headers: mergeHeaders(current.headers, next.headers) } : {}),
			...(next.body !== undefined ? { body: next.body } : {}),
			...(next.params !== undefined ? { params: next.params } : {})
		};
	}
	return current;
}

/** Response interceptors, once, in order, on the settled response. */
export async function runResponseInterceptors<T>(
	interceptors: readonly Interceptor[],
	response: APIResponse<T>
): Promise<APIResponse<T>> {
	let current = response;
	for (const interceptor of interceptors) {
		if (interceptor.onResponse) current = await interceptor.onResponse(current);
	}
	return current;
}

/**
 * Offer an error to each error interceptor in turn: the first response wins;
 * a hook that throws has declined; if none recovers, the original error is
 * rethrown. A caller's own abort and a `CancelledError` are never offered —
 * nothing is being asked of the server.
 */
export async function recoverWithErrorInterceptors<T>(
	interceptors: readonly Interceptor[],
	error: unknown
): Promise<APIResponse<T>> {
	if (error instanceof CancelledError || (error instanceof Error && error.name === 'AbortError')) throw error;
	for (const interceptor of interceptors) {
		if (!interceptor.onError) continue;
		try {
			return (await interceptor.onError(error)) as APIResponse<T>;
		} catch {
			// Declined; the next hook may recover.
		}
	}
	throw error;
}

/** A fetch failure without a status is a network error; the rest pass through. */
export function classifyFetchFailure(error: unknown): unknown {
	if (error instanceof Error && error.name === 'AbortError') {
		return new CancelledError('Request cancelled', error);
	}
	if (error instanceof Error && !('status' in error)) {
		return new NetworkError(`Network request failed: ${error.message}`, error);
	}
	return error;
}

// ============================================================================
// Bounded warn-once
// ============================================================================

export interface WarnOnce {
	/** Warn for `key` once; a present key is a no-op. */
	warn(key: string, message: string): void;
	clear(): void;
	readonly size: number;
}

/**
 * The keys warned about, bounded: past `bound` the oldest is dropped, so a
 * parameterised endpoint cannot grow the set without limit (R1-REVIEW 1.7).
 */
export function createWarnOnce(bound: number): WarnOnce {
	const seen = new Set<string>();
	return {
		warn(key, message) {
			if (seen.has(key)) return;
			if (seen.size >= bound) {
				const oldest = seen.values().next().value;
				if (oldest !== undefined) seen.delete(oldest);
			}
			seen.add(key);
			console.warn(message);
		},
		clear() {
			seen.clear();
		},
		get size() {
			return seen.size;
		}
	};
}

/**
 * `true` when `data` is a class instance a structured clone would flatten to
 * a plain object. The types the clone preserves (`Date`, `RegExp`, `Map`,
 * `Set`, `Error`, `ArrayBuffer` and its views) are not flagged.
 */
export function isInstance(data: unknown): boolean {
	if (typeof data !== 'object' || data === null) return false;
	const proto = Object.getPrototypeOf(data);
	if (proto === null || proto === Object.prototype || proto === Array.prototype) return false;
	return !(
		data instanceof Date ||
		data instanceof RegExp ||
		data instanceof Map ||
		data instanceof Set ||
		data instanceof Error ||
		data instanceof ArrayBuffer ||
		ArrayBuffer.isView(data)
	);
}

/** `isPlainData` re-exported for the clients, so they import one module. */
export { isPlainData };
