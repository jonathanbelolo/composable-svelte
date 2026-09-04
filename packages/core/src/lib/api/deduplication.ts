// ============================================================================
// Request Deduplication Layer
// ============================================================================

import type { APIResponse, HTTPMethod } from './types.js';
import { TimeoutError } from './errors.js';
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

/** What one caller brings to a shared attempt. */
export interface JoinOptions {
	/** The caller's own cancellation. Detaches this caller; the fetch is aborted only when every caller has gone. */
	readonly signal?: AbortSignal | undefined;
	/** The caller's own bound on the whole request, retries included, in milliseconds. */
	readonly timeout?: number | undefined;
}

/**
 * The in-flight requests of one client.
 */
export interface InFlightRegistry {
	/**
	 * Run `execute` for `key`, or join the attempt already in flight for it —
	 * and, with a null key, run it unshared. Every caller gets its own promise:
	 * its own `signal` and `timeout` settle that promise alone, and the shared
	 * fetch is aborted only when every caller has detached. Joiners receive a
	 * structured clone of the response; the caller that started the attempt
	 * receives the original.
	 *
	 * The first form handed every caller one promise, so one caller's abort or
	 * timeout rejected the others and a joiner's own signal and timeout were
	 * ignored (AUDIT-2026-09-03-FINDINGS A7, A3).
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

function abortError(reason: unknown): Error {
	if (reason instanceof Error) return reason;
	const error = new Error(typeof reason === 'string' ? reason : 'The operation was aborted');
	error.name = 'AbortError';
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
		if (existing) return existing;

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
				const creator = entry.subscribers === 0;
				entry.subscribers += 1;
				let settled = false;

				const onAbort = () => finish(() => reject(abortError(signal?.reason)));
				const timer =
					timeout !== undefined ? setTimeout(() => finish(() => reject(new TimeoutError(timeout))), timeout) : undefined;

				const finish = (outcome: () => void): void => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener('abort', onAbort);
					if (timer !== undefined) clearTimeout(timer);
					entry.subscribers -= 1;
					// The last caller to leave takes the fetch with it — while it is
					// still running; after it settled there is nothing to abort.
					if (entry.subscribers === 0 && !entry.settled) entry.controller.abort();
					outcome();
				};

				signal?.addEventListener('abort', onAbort, { once: true });
				entry.result.then(
					(response) => finish(() => resolve(creator ? (response as APIResponse<T>) : cloneOrSame(response as APIResponse<T>))),
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

/** A joiner's own copy; the original if the response cannot be cloned. */
function cloneOrSame<T>(response: APIResponse<T>): APIResponse<T> {
	try {
		return structuredClone(response);
	} catch {
		return response;
	}
}
