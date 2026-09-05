// ============================================================================
// Request Deduplication Layer
// ============================================================================

import type { APIResponse, HTTPMethod } from './types.js';
import { TimeoutError } from './errors.js';
import { DEFAULT_SHOULD_RETRY, type ResolvedRetryConfig } from './retry.js';
import { stableStringify } from '../utils/stable-stringify.js';

/**
 * A request's identity for deduplication and caching.
 *
 * Everything that changes what the server would answer: the method, the
 * resolved URL (base URL joined, query excluded), the query parameters, the
 * headers as they will be sent — the client's defaults merged with the
 * request's, names lower-cased, **after** the request interceptors — the
 * body, and the retry policy, since two callers with different policies
 * would otherwise share one attempt under the first caller's. Keys are per
 * client (each `createAPIClient` owns its registry and cache), so the base
 * URL and default headers in the key are defence in depth rather than the
 * boundary.
 *
 * The first form keyed on the raw path with only per-request headers, in one
 * module-global map: two clients built for two users coalesced into one fetch
 * and both received the first user's body (AUDIT-2026-09-03-FINDINGS A1). R1
 * keyed before the interceptors ran, so a token an interceptor added was not
 * part of the identity (R1-REVIEW 1.7).
 */
export interface RequestIdentity {
	readonly method: HTTPMethod;
	/** Base URL joined and normalised; no query string. */
	readonly url: string;
	readonly params: Record<string, string | number | boolean | null | undefined> | undefined;
	/** Names lower-cased, interceptors applied. */
	readonly headers: Record<string, string>;
	readonly body: unknown;
	/** The resolved policy, or null when this caller does not retry. */
	readonly retry: ResolvedRetryConfig | null;
}

/**
 * `true` when `value` has a JSON form that identifies it: `null`,
 * `undefined`, a string, number or boolean, an object with `toJSON` whose
 * result is plain (a `Date`, a `URL`), or an array or plain object of plain
 * values. A `FormData`, `Blob`, `ArrayBuffer`, typed array,
 * `URLSearchParams`, `ReadableStream`, `Map`, `Set`, class instance, bigint,
 * symbol or function is not — nor is a cyclic structure — and a request
 * carrying one is never coalesced or cached, because its key would be a
 * lie: every `FormData` keyed as `{}`, so two distinct uploads were one
 * request (R1-REVIEW 1.7).
 */
export function isPlainData(value: unknown, walking: Set<object> = new Set()): boolean {
	if (value === null || value === undefined) return true;
	switch (typeof value) {
		case 'string':
		case 'number':
		case 'boolean':
			return true;
		case 'object':
			break;
		default:
			return false;
	}
	const object = value as object;
	if (walking.has(object)) return false;
	walking.add(object);
	try {
		const toJSON = (object as { toJSON?: unknown }).toJSON;
		if (typeof toJSON === 'function') return isPlainData((toJSON as () => unknown).call(object), walking);
		if (Array.isArray(object)) return object.every((item) => isPlainData(item, walking));
		const proto = Object.getPrototypeOf(object);
		if (proto !== null && proto !== Object.prototype) return false;
		return Object.values(object).every((item) => isPlainData(item, walking));
	} finally {
		walking.delete(object);
	}
}

/**
 * The key two identical requests share, or `null` when the body has no
 * identifying JSON form (`isPlainData`) — such a request runs alone.
 */
export function requestKey(identity: RequestIdentity): string | null {
	if (!isPlainData(identity.body)) return null;
	return stableStringify([
		identity.method,
		identity.url,
		identity.params ?? null,
		identity.headers,
		identity.body ?? null,
		retryIdentity(identity.retry)
	]);
}

type ShouldRetry = NonNullable<ResolvedRetryConfig['shouldRetry']>;

/**
 * `shouldRetry` is a function, so it contributes an id: the default
 * predicate is 0, and every other function object gets one on first sight.
 * Two callers passing the same function coalesce; two functions never do.
 */
const predicateIds = new WeakMap<ShouldRetry, number>();
let nextPredicateId = 1;

function predicateId(predicate: ShouldRetry): number {
	if (predicate === DEFAULT_SHOULD_RETRY) return 0;
	let id = predicateIds.get(predicate);
	if (id === undefined) {
		id = nextPredicateId++;
		predicateIds.set(predicate, id);
	}
	return id;
}

/** The retry policy's contribution to the key. */
export function retryIdentity(retry: ResolvedRetryConfig | null): unknown {
	if (retry === null) return null;
	return {
		maxAttempts: retry.maxAttempts,
		initialDelay: retry.initialDelay,
		maxDelay: retry.maxDelay,
		backoffMultiplier: retry.backoffMultiplier,
		retryableStatusCodes: retry.retryableStatusCodes,
		shouldRetry: predicateId(retry.shouldRetry)
	};
}

/**
 * Methods coalesced by default. A repeated safe request is one request; a
 * repeated POST is two intents, and coalescing them hid the second (A11).
 * `deduplicate: true` on the request opts a mutation in.
 */
export function isDeduplicableMethod(method: HTTPMethod): boolean {
	return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/** What one caller brings to a shared attempt. */
export interface JoinOptions {
	/** The caller's own cancellation. Detaches this caller; the fetch is aborted only when every caller has gone. */
	readonly signal?: AbortSignal | undefined;
	/** The caller's own bound on the whole request, retries included, in milliseconds; `Infinity` for none. */
	readonly timeout: number;
}

/**
 * The in-flight requests of one client.
 */
export interface InFlightRegistry {
	/**
	 * Run `execute` for `key`, or join the attempt already in flight for it —
	 * and, with a null key, run it unshared. Every caller gets its own promise:
	 * its own `signal` and `timeout` settle that promise alone, and the shared
	 * fetch is aborted only when every caller has detached. Every caller
	 * receives a structured clone of the response (the original when it
	 * cannot be cloned).
	 *
	 * The first form handed every caller one promise, so one caller's abort or
	 * timeout rejected the others and a joiner's own signal and timeout were
	 * ignored (AUDIT-2026-09-03-FINDINGS A7, A3). R1's form left an aborted
	 * attempt in the map until its rejection settled, so a caller arriving in
	 * that window joined a dead attempt and was told "Request cancelled"
	 * (R1-REVIEW 1.2).
	 */
	join<T>(
		key: string | null,
		execute: (signal: AbortSignal) => Promise<APIResponse<T>>,
		options: JoinOptions
	): Promise<APIResponse<T>>;
	/** How many attempts are in flight. */
	readonly size: number;
	/** Forget every in-flight attempt (they still settle for their callers). */
	clear(): void;
}

interface Attempt {
	readonly controller: AbortController;
	subscribers: number;
	/** Set once the result has settled; an abort after that would be noise. */
	settled: boolean;
	readonly result: Promise<APIResponse<unknown>>;
}

/**
 * The rejection for a caller whose signal aborted: the signal's reason when
 * it is an `Error`, else an `AbortError` carrying the reason as `cause` —
 * the first form dropped a non-Error reason (R1-REVIEW 1.9).
 */
function abortError(reason: unknown): Error {
	if (reason instanceof Error) return reason;
	const error = new Error(typeof reason === 'string' ? reason : 'The operation was aborted');
	error.name = 'AbortError';
	if (reason !== undefined) Object.assign(error, { cause: reason });
	return error;
}

/**
 * One registry per client. The map used to be module-global, shared by every
 * client in the process.
 */
export function createInFlightRegistry(): InFlightRegistry {
	const inFlight = new Map<string, Attempt>();

	function attempt<T>(key: string | null, execute: (signal: AbortSignal) => Promise<APIResponse<T>>): Attempt {
		const existing = key === null ? undefined : inFlight.get(key);
		// An aborted attempt is dead: its fetch is gone and its rejection is on
		// its way. `finish` removes it in the same step that aborts it; the
		// check is defence in depth for a key re-inserted by a later attempt.
		if (existing && !existing.controller.signal.aborted) return existing;

		const controller = new AbortController();
		const entry: Attempt = {
			controller,
			subscribers: 0,
			settled: false,
			result: execute(controller.signal).finally(() => {
				entry.settled = true;
				if (key !== null && inFlight.get(key) === entry) inFlight.delete(key);
			})
		};
		// Nobody may be left listening by the time it settles (every caller can
		// detach); the callers below attach their own handlers.
		entry.result.catch(() => {});
		if (key !== null) inFlight.set(key, entry);
		return entry;
	}

	return {
		join<T>(
			key: string | null,
			execute: (signal: AbortSignal) => Promise<APIResponse<T>>,
			options: JoinOptions
		): Promise<APIResponse<T>> {
			const { signal, timeout } = options;
			return new Promise<APIResponse<T>>((resolve, reject) => {
				if (signal?.aborted) {
					reject(abortError(signal.reason));
					return;
				}

				const entry = attempt(key, execute);
				entry.subscribers += 1;
				let settled = false;

				const onAbort = () => finish(() => reject(abortError(signal?.reason)));
				// A finite bound arms a timer; `Infinity` means no bound, and a
				// timer for it would fire at once.
				const timer = Number.isFinite(timeout)
					? setTimeout(() => finish(() => reject(new TimeoutError(timeout))), timeout)
					: undefined;

				const finish = (outcome: () => void): void => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener('abort', onAbort);
					if (timer !== undefined) clearTimeout(timer);
					entry.subscribers -= 1;
					// The last caller to leave takes the fetch with it — while it is
					// still running; after it settled there is nothing to abort — and
					// the attempt leaves the map in the same step, so the next caller
					// for this key starts its own (R1-REVIEW 1.2).
					if (entry.subscribers === 0 && !entry.settled) {
						entry.controller.abort();
						if (key !== null && inFlight.get(key) === entry) inFlight.delete(key);
					}
					outcome();
				};

				signal?.addEventListener('abort', onAbort, { once: true });
				entry.result.then(
					(response) => finish(() => resolve(cloneOrSame(response as APIResponse<T>))),
					(error: unknown) => finish(() => reject(error))
				);
			});
		},
		get size() {
			return inFlight.size;
		},
		clear() {
			inFlight.clear();
		}
	};
}

/**
 * A caller's own copy; the original if the response cannot be cloned.
 * A clone is plain data: a class instance in `data` loses its prototype.
 */
function cloneOrSame<T>(response: APIResponse<T>): APIResponse<T> {
	try {
		return structuredClone(response);
	} catch {
		return response;
	}
}
