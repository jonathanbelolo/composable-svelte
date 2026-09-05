/**
 * A scripted `fetch` for testing the real API client.
 *
 * `createAPIClient` reads `globalThis.fetch` at call time (`client.ts`), so
 * replacing it per test drives the real URL building, header assembly,
 * response decoding, retry, deduplication and cache paths — none of which
 * `createMockAPI` reaches, because it replaces the whole client. Until this
 * file, nothing in `tests/api/` imported `client.ts` at all
 * (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, STRUCTURAL).
 *
 * `scriptFetch` registers its own `onTestFinished` to restore `fetch`, so a
 * file that forgets an `afterEach` cannot leak the scripted fetch into the
 * next test. Called twice in one test, the restores unwind in reverse order,
 * back to the native `fetch`. Each client owns its in-flight map and cache
 * (R1.3), so there is nothing else to clear.
 *
 * A route resolves on demand with `until` — a promise the test settles when
 * it has done what it wanted to do mid-flight — so a test that interleaves
 * an abort with a fetch is ordered by events, not by a delay that must be
 * long enough (R1-REVIEW 2.3). `whenFetched(n)` resolves when the n-th call
 * has been made.
 */

import { onTestFinished } from 'vitest';

export interface ScriptedRoute {
	/** A substring of the URL, or a pattern over it. First match wins. */
	match: string | RegExp;
	status?: number;
	headers?: Record<string, string>;
	/** An object is sent as JSON with `content-type: application/json`; a string as-is. */
	body?: unknown;
	/** Resolve after this many ms; honours `init.signal` in the meantime. */
	delayMs?: number;
	/** Resolve when this settles; honours `init.signal` in the meantime. A rejection is the fetch's. */
	until?: Promise<unknown>;
}

export interface RecordedFetch {
	url: string;
	init: RequestInit | undefined;
}

export interface ScriptedFetch {
	calls: RecordedFetch[];
	/** Resolves once at least `count` calls have been made. */
	whenFetched: (count: number) => Promise<void>;
	restore: () => void;
}

/** A promise with its settlers in hand. */
export interface Deferred<T = void> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function abortError(): Error {
	return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

/** `promise`, or an AbortError as soon as `signal` aborts. */
function untilOrAbort(promise: Promise<unknown>, signal: AbortSignal | null | undefined): Promise<unknown> {
	if (!signal) return promise;
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(abortError());
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}

/** Replace `globalThis.fetch` for the current test. */
export function scriptFetch(routes: ScriptedRoute[]): ScriptedFetch {
	const original = globalThis.fetch;
	const calls: RecordedFetch[] = [];
	const waiters: { count: number; resolve: () => void }[] = [];

	const notify = () => {
		for (const waiter of waiters.splice(0)) {
			if (calls.length >= waiter.count) waiter.resolve();
			else waiters.push(waiter);
		}
	};

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		calls.push({ url, init });
		notify();

		const route = routes.find((r) => (typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)));
		if (!route) throw new TypeError(`scripted fetch: no route matches ${url}`);

		if (init?.signal?.aborted) throw abortError();
		if (route.delayMs) {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(resolve, route.delayMs);
				init?.signal?.addEventListener('abort', () => {
					clearTimeout(timer);
					reject(abortError());
				});
			});
		}
		if (route.until) await untilOrAbort(route.until, init?.signal);

		const isJson = route.body !== undefined && typeof route.body !== 'string';
		const headers = {
			...(isJson ? { 'content-type': 'application/json' } : {}),
			...(route.headers ?? {})
		};
		const body = isJson ? JSON.stringify(route.body) : ((route.body as string | undefined) ?? '');
		return new Response(body, { status: route.status ?? 200, headers });
	}) as typeof fetch;

	const scripted: ScriptedFetch = {
		calls,
		whenFetched: (count) =>
			calls.length >= count ? Promise.resolve() : new Promise<void>((resolve) => waiters.push({ count, resolve })),
		restore: () => {
			globalThis.fetch = original;
		}
	};
	onTestFinished(() => {
		scripted.restore();
	});
	return scripted;
}
