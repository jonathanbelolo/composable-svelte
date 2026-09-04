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
 * Deduplication and the response cache are module-global, so every test that
 * uses this must run under `scriptedFetchAfterEach()`, which clears both and
 * restores `fetch` — otherwise one test's in-flight request or cached body
 * answers the next test's call.
 */

import { afterEach } from 'vitest';
import { clearCache } from '../../src/lib/api/cache.js';
import { clearInFlightRequests } from '../../src/lib/api/deduplication.js';

export interface ScriptedRoute {
	/** A substring of the URL, or a pattern over it. First match wins. */
	match: string | RegExp;
	status?: number;
	headers?: Record<string, string>;
	/** An object is sent as JSON with `content-type: application/json`; a string as-is. */
	body?: unknown;
	/** Resolve after this many ms; honours `init.signal` in the meantime. */
	delayMs?: number;
}

export interface RecordedFetch {
	url: string;
	init: RequestInit | undefined;
}

export interface ScriptedFetch {
	calls: RecordedFetch[];
	restore: () => void;
}

let active: ScriptedFetch | null = null;

function abortError(): Error {
	return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

/** Replace `globalThis.fetch` for the current test. */
export function scriptFetch(routes: ScriptedRoute[]): ScriptedFetch {
	const original = globalThis.fetch;
	const calls: RecordedFetch[] = [];

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		calls.push({ url, init });

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
		restore: () => {
			globalThis.fetch = original;
		}
	};
	active = scripted;
	return scripted;
}

/** Call once at file scope. */
export function scriptedFetchAfterEach(): void {
	afterEach(() => {
		active?.restore();
		active = null;
		clearInFlightRequests();
		clearCache();
	});
}
