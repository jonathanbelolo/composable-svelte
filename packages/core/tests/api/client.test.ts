/**
 * The real API client over a scripted `fetch`.
 *
 * Every other file in this directory tests `createMockAPI`, `createSpyAPI`
 * or the error classes; this is the first to import `client.ts`. R0.3.a
 * lands the harness and a smoke test; the behaviour tests arrive with R1.3.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAPIClient } from '../../src/lib/api/client.js';
import { deferred, scriptFetch } from '../helpers/scripted-fetch.js';
import { expectConsole } from '../helpers/console.js';
import { TimeoutError } from '../../src/lib/api/errors.js';
import type { APIResponse, RequestConfig } from '../../src/lib/api/types.js';


describe('createAPIClient over a scripted fetch', () => {
	it('sends a GET to the joined URL and parses a JSON response', async () => {
		const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 } }]);
		const api = createAPIClient({ baseURL: 'https://a.example' });

		const res = await api.get<{ ok: number }>('/x');

		expect(fetched.calls).toHaveLength(1);
		expect(fetched.calls[0]!.url).toBe('https://a.example/x');
		expect(fetched.calls[0]!.init?.method).toBe('GET');
		expect(res.status).toBe(200);
		expect(res.data).toEqual({ ok: 1 });
	});

	it('A1: two clients with different base URLs and default headers do not share an in-flight GET', async () => {
		// Deduplication was module-global and keyed on the raw path with only the
		// per-request headers, so two clients built for two users coalesced into
		// one fetch and both received the first user's body. Each client now
		// owns its registry, and the key carries the resolved URL and the merged
		// headers (AUDIT-2026-09-03-FINDINGS A1).
		const fetched = scriptFetch([
			{ match: 'a.example/me', body: { who: 'a' }, delayMs: 20 },
			{ match: 'b.example/me', body: { who: 'b' }, delayMs: 20 }
		]);
		const alice = createAPIClient({ baseURL: 'https://a.example', headers: { Authorization: 'Bearer alice' } });
		const bob = createAPIClient({ baseURL: 'https://b.example', headers: { Authorization: 'Bearer bob' } });

		const [a, b] = await Promise.all([alice.get<{ who: string }>('/me'), bob.get<{ who: string }>('/me')]);

		expect(fetched.calls).toHaveLength(2);
		expect(a.data.who).toBe('a');
		expect(b.data.who).toBe('b');
		// Header names are sent lower-cased (C2).
		const sentHeaders = fetched.calls.map((c) => (c.init?.headers as Record<string, string>).authorization);
		expect(new Set(sentHeaders)).toEqual(new Set(['Bearer alice', 'Bearer bob']));
	});

	it('A1: two clients with the same configuration do not share an in-flight GET either', async () => {
		// The map is per client, not per key: with identical base URL and headers
		// the keys are equal, and a module-global map would still coalesce them.
		const fetched = scriptFetch([{ match: /\/me$/, body: { who: 'same' }, delayMs: 20 }]);
		const one = createAPIClient({ baseURL: 'https://a.example' });
		const two = createAPIClient({ baseURL: 'https://a.example' });

		await Promise.all([one.get('/me'), two.get('/me')]);

		expect(fetched.calls).toHaveLength(2);
	});

	it("A1: one client coalesces 'x' and '/x', which resolve to one URL", async () => {
		// The key is the resolved URL, so two spellings of one path are one
		// request; keyed on the raw path they were two.
		const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 }, delayMs: 20 }]);
		const api = createAPIClient({ baseURL: 'https://a.example' });

		await Promise.all([api.get('x'), api.get('/x')]);

		expect(fetched.calls).toHaveLength(1);
	});

	it("A1: the client's deduplicate option is honoured, and a request can override it", async () => {
		// `deduplicate` was destructured from the client config and never read.
		const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 }, delayMs: 20 }]);
		const api = createAPIClient({ baseURL: 'https://a.example', deduplicate: false });

		await Promise.all([api.get('/x'), api.get('/x')]);
		expect(fetched.calls).toHaveLength(2);

		await Promise.all([api.get('/x', { deduplicate: true }), api.get('/x', { deduplicate: true })]);
		expect(fetched.calls).toHaveLength(3);
	});

	it('A11: identical concurrent POSTs are not coalesced unless the request opts in', async () => {
		// Two identical POSTs are two intents; coalescing them by default hid the
		// second. PUT, PATCH and DELETE are the same.
		const fetched = scriptFetch([{ match: /\/things$/, body: { id: 1 }, delayMs: 20 }]);
		const api = createAPIClient({ baseURL: 'https://a.example' });

		await Promise.all([api.post('/things', { a: 1 }), api.post('/things', { a: 1 })]);
		expect(fetched.calls).toHaveLength(2);

		await Promise.all([
			api.post('/things', { a: 1 }, { deduplicate: true }),
			api.post('/things', { a: 1 }, { deduplicate: true })
		]);
		expect(fetched.calls).toHaveLength(3);
	});

	describe('the response cache (A2)', () => {
		it('a hit is not the stored reference, in either direction', async () => {
			// The cache handed out the object it stored, so a caller that edited
			// its response edited the cache for every later caller.
			const fetched = scriptFetch([{ match: /\/n$/, body: { n: 1 } }]);
			const api = createAPIClient({ baseURL: 'https://a.example', cache: true });

			const first = await api.get<{ n: number }>('/n');
			first.data.n = 99;
			const second = await api.get<{ n: number }>('/n');
			expect(second.cached).toBe(true);
			expect(second.data.n).toBe(1);
			expect(second.data).not.toBe(first.data);

			second.data.n = 42;
			const third = await api.get<{ n: number }>('/n');
			expect(third.data.n).toBe(1);
			expect(fetched.calls).toHaveLength(1);
		});

		it('is bounded by maxEntries, least recently used first', async () => {
			const fetched = scriptFetch([{ match: /\/[abc]$/, body: { ok: 1 } }]);
			const api = createAPIClient({ baseURL: 'https://a.example', cache: { maxEntries: 2 } });

			await api.get('/a');
			await api.get('/b');
			await api.get('/a'); // a is now the most recently used
			await api.get('/c'); // evicts b, the least recently used

			expect((await api.get('/a')).cached).toBe(true); // still there
			expect((await api.get('/b')).cached).toBeUndefined(); // refetched
			expect(fetched.calls.map((c) => c.url.at(-1))).toEqual(['a', 'b', 'c', 'b']);
		});

		it('custom-key entries are reachable by path, for invalidateCache and for a mutation', async () => {
			// Invalidation parsed the path out of the key, so an entry stored under
			// a custom key could never be invalidated.
			const fetched = scriptFetch([{ match: /\/products/, body: { ok: 1 } }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });
			const opts = { cache: { key: () => 'products-all' } };

			await api.get('/products', opts);
			expect((await api.get('/products', opts)).cached).toBe(true);
			api.invalidateCache('/products');
			expect((await api.get('/products', opts)).cached).toBeUndefined();

			await api.post('/products', { name: 'x' });
			expect((await api.get('/products', opts)).cached).toBeUndefined();
			expect(fetched.calls).toHaveLength(4);
		});

		it('a response that cannot be cloned is not cached, and says so once per key', async () => {
			expectConsole('warn');
			scriptFetch([{ match: /\/fn$/, body: { ok: 1 } }]);
			const api = createAPIClient({
				baseURL: 'https://a.example',
				cache: true,
				interceptors: [{ onResponse: async (r) => ({ ...r, data: { ...(r.data as object), call: () => 1 } as typeof r.data }) }]
			});

			await api.get('/fn');
			expect((await api.get('/fn')).cached).toBeUndefined();
		});
	});

	describe('shared attempts (A7, A3)', () => {
		// A route resolves when its `until` settles, so each test is ordered by
		// the events it asserts on, not by a delay that had to be long enough
		// (R1-REVIEW 2.3). After a macrotask turn every synchronously issued
		// caller has joined: the join path has no timers.
		const turn = () => new Promise<void>((r) => setTimeout(r, 0));

		it('an aborting caller does not reject the others', async () => {
			// One promise served every caller, so caller A's abort rejected caller
			// B, and B's own signal was never wired to anything.
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/slow$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });
			const ac = new AbortController();

			const a = api.get('/slow', { signal: ac.signal });
			const b = api.get<{ ok: number }>('/slow');
			// The expectation is attached before the abort, so the rejection is
			// never unhandled between the two.
			const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
			await fetched.whenFetched(1);
			await turn();
			ac.abort();
			await aRejected;
			expect(fetched.calls[0]!.init?.signal?.aborted).toBe(false);

			gate.resolve();
			const resolved = await b;
			expect(resolved.data).toEqual({ ok: 1 });
			expect(fetched.calls).toHaveLength(1);
		});

		it('the fetch is aborted only when every caller has aborted', async () => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/slow$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });
			const first = new AbortController();
			const second = new AbortController();

			const a = api.get('/slow', { signal: first.signal });
			const b = api.get('/slow', { signal: second.signal });
			const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
			const bRejected = expect(b).rejects.toMatchObject({ name: 'AbortError' });
			await fetched.whenFetched(1);
			await turn();

			first.abort();
			await aRejected;
			expect(fetched.calls[0]!.init?.signal?.aborted).toBe(false);

			second.abort();
			await bRejected;
			expect(fetched.calls[0]!.init?.signal?.aborted).toBe(true);
			gate.resolve();
		});

		it('each caller has its own timeout', async () => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/slow$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });

			const patient = api.get<{ ok: number }>('/slow', { timeout: 5000 });
			const hasty = api.get('/slow', { timeout: 10 });

			await expect(hasty).rejects.toBeInstanceOf(TimeoutError);
			expect(fetched.calls[0]!.init?.signal?.aborted).toBe(false);
			gate.resolve();
			expect((await patient).data).toEqual({ ok: 1 });
			expect(fetched.calls).toHaveLength(1);
		});

		it('joiners receive their own copy of the response', async () => {
			const gate = deferred();
			scriptFetch([{ match: /\/slow$/, body: { n: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });

			const a = api.get<{ n: number }>('/slow');
			const b = api.get<{ n: number }>('/slow');
			await turn();
			gate.resolve();
			const [ra, rb] = await Promise.all([a, b]);

			expect(ra.data).toEqual(rb.data);
			expect(ra.data).not.toBe(rb.data);
		});

		it('a signal that is already aborted makes no fetch', async () => {
			const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 } }]);
			const api = createAPIClient({ baseURL: 'https://a.example' });
			const ac = new AbortController();
			ac.abort(new Error('gone'));

			await expect(api.get('/x', { signal: ac.signal })).rejects.toThrow('gone');
			expect(fetched.calls).toHaveLength(0);
		});
	});

	describe('the request pipeline', () => {
		// Resolve → request interceptors → finalize → key → cache → the shared
		// attempt (retry, response interceptors) → cache set. Each test pins one
		// consequence of that order (R1-REVIEW 1.2, 1.7, 1.9, 2.3).
		const turn = () => new Promise<void>((r) => setTimeout(r, 0));
		const baseURL = 'https://a.example';
		const sentHeaders = (call: { init: RequestInit | undefined }) => call.init!.headers as Record<string, string>;

		it('a request repeated after its only caller aborted starts a fresh fetch', async () => {
			// The aborted attempt stayed in the map until its rejection settled,
			// so a caller arriving in that window joined a dead attempt and was
			// told "Request cancelled" (R1-REVIEW 1.2).
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL });
			const ac = new AbortController();

			const a = api.get('/x', { signal: ac.signal });
			const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
			await fetched.whenFetched(1);
			await turn();
			ac.abort();
			// Issued synchronously after the abort: the dead attempt is already gone.
			const b = api.get<{ ok: number }>('/x');

			await aRejected;
			gate.resolve();
			expect((await b).data).toEqual({ ok: 1 });
			expect(fetched.calls).toHaveLength(2);
		});

		it('a caller joining during a retry backoff, after the first caller left, gets its own attempt', async () => {
			const fetched = scriptFetch([
				{ match: /\/flaky\?n=1/, status: 503, body: {} },
				{ match: /\/flaky\?n=2/, body: { ok: 1 } }
			]);
			let n = 0;
			const onRequest = vi.fn(async (_url: string, config: RequestConfig) => ({ ...config, params: { n: ++n } }));
			const api = createAPIClient({ baseURL, retry: { maxAttempts: 2, initialDelay: 20 }, interceptors: [{ onRequest }] });
			const ac = new AbortController();

			const a = api.get('/flaky', { signal: ac.signal });
			const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
			await fetched.whenFetched(1);
			await turn();
			ac.abort(); // during the backoff sleep
			await aRejected;

			const b = api.get<{ ok: number }>('/flaky');
			expect((await b).data).toEqual({ ok: 1 });
			// One interceptor run per caller; the first attempt's retry never ran.
			expect(onRequest).toHaveBeenCalledTimes(2);
			expect(fetched.calls.map((c) => c.url.at(-1))).toEqual(['1', '2']);
		});

		it('the backoff sleep ends when the last caller detaches', async () => {
			// The sleep outlived every caller, keeping the attempt and its timer
			// alive for up to maxDelay (the R1.3.f remainder).
			vi.useFakeTimers();
			try {
				const fetched = scriptFetch([{ match: /\/flaky$/, status: 503, body: {} }]);
				const api = createAPIClient({ baseURL, retry: { maxAttempts: 3, initialDelay: 100_000 } });
				const ac = new AbortController();

				const p = api.get('/flaky', { signal: ac.signal, timeout: Infinity });
				const rejected = expect(p).rejects.toMatchObject({ name: 'AbortError' });
				await fetched.whenFetched(1);
				// vi.waitFor advances the fake clock by its interval on each check;
				// the backoff is at least 50 s, so a second of that is harmless.
				await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));

				ac.abort();
				await rejected;
				expect(vi.getTimerCount()).toBe(0);
				expect(fetched.calls).toHaveLength(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('a header added by a request interceptor is part of the identity', async () => {
			// The key was computed before the interceptors ran, so two callers
			// whose interceptor gave them different tokens shared one fetch
			// (R1-REVIEW 1.7).
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/me$/, body: { ok: 1 }, until: gate.promise }]);
			let n = 0;
			const api = createAPIClient({
				baseURL,
				interceptors: [
					{ onRequest: async (_url, config) => ({ ...config, headers: { ...config.headers, authorization: `Bearer ${++n}` } }) }
				]
			});

			const a = api.get('/me');
			const b = api.get('/me');
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(2);
			expect(fetched.calls.map((c) => sentHeaders(c).authorization)).toEqual(['Bearer 1', 'Bearer 2']);
		});

		it('same client, same URL, different request headers: two requests', async () => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/me$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL });

			const a = api.get('/me', { headers: { authorization: 'Bearer a' } });
			const b = api.get('/me', { headers: { authorization: 'Bearer b' } });
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(2);
		});

		it('request interceptors run once per call, not once per retry attempt', async () => {
			const fetched = scriptFetch([{ match: /\/flaky$/, status: 503, body: {} }]);
			const onRequest = vi.fn(async (_url: string, config: RequestConfig) => config);
			const api = createAPIClient({ baseURL, retry: { maxAttempts: 3, initialDelay: 1 }, interceptors: [{ onRequest }] });

			await expect(api.get('/flaky')).rejects.toMatchObject({ status: 503 });

			expect(fetched.calls).toHaveLength(3);
			expect(onRequest).toHaveBeenCalledTimes(1);
		});

		it('a request interceptor can change the body and the params, and what it returns is sent', async () => {
			// Only `headers` was read back from an interceptor's result (A8).
			const fetched = scriptFetch([{ match: /\/things/, body: { ok: 1 } }]);
			const api = createAPIClient({
				baseURL,
				interceptors: [
					{
						onRequest: async (_url, config) => ({
							...config,
							body: { ...(config.body as object), stamped: true },
							params: { ...config.params, v: 2 }
						})
					}
				]
			});

			await api.post('/things', { a: 1 }, { params: { v: 1 } });

			expect(fetched.calls[0]!.url).toBe('https://a.example/things?v=2');
			expect(fetched.calls[0]!.init?.body).toBe(JSON.stringify({ a: 1, stamped: true }));
		});

		it('response interceptors run once per attempt, and every caller receives their result as its own copy', async () => {
			const gate = deferred();
			scriptFetch([{ match: /\/x$/, body: { n: 1 }, until: gate.promise }]);
			let responseRuns = 0;
			const onResponse = async <T,>(r: APIResponse<T>): Promise<APIResponse<T>> => {
				responseRuns++;
				return { ...r, data: { ...(r.data as object), seen: true } as T };
			};
			const api = createAPIClient({ baseURL, interceptors: [{ onResponse }] });

			const a = api.get<{ n: number; seen: boolean }>('/x');
			const b = api.get<{ n: number; seen: boolean }>('/x');
			await turn();
			gate.resolve();
			const [ra, rb] = await Promise.all([a, b]);

			expect(responseRuns).toBe(1);
			expect(ra.data).toEqual({ n: 1, seen: true });
			expect(rb.data).toEqual({ n: 1, seen: true });
			expect(ra.data).not.toBe(rb.data);
		});

		it('error interceptors are offered the failure once, after the retries', async () => {
			const fetched = scriptFetch([{ match: /\/flaky$/, status: 503, body: {} }]);
			const onError = vi.fn(async (error: unknown) => {
				throw error;
			});
			const api = createAPIClient({ baseURL, retry: { maxAttempts: 2, initialDelay: 1 }, interceptors: [{ onError }] });

			await expect(api.get('/flaky')).rejects.toMatchObject({ status: 503 });

			expect(fetched.calls).toHaveLength(2);
			expect(onError).toHaveBeenCalledTimes(1);
		});

		it('a throwing request interceptor rejects the caller with what it threw: no fetch, no retry, no NetworkError', async () => {
			// The throw was caught inside the fetch, wrapped as a retryable
			// NetworkError and retried with backoff, with zero fetches (A8).
			const fetched = scriptFetch([{ match: /./, body: {} }]);
			const boom = new Error('no token');
			const onError = vi.fn(async (error: unknown) => {
				throw error;
			});
			const api = createAPIClient({
				baseURL,
				retry: { maxAttempts: 3, initialDelay: 1 },
				interceptors: [
					{
						onRequest: async () => {
							throw boom;
						},
						onError
					}
				]
			});

			await expect(api.get('/x')).rejects.toBe(boom);
			expect(fetched.calls).toHaveLength(0);
			// It is still a failure of the request, so the error hooks see it.
			expect(onError).toHaveBeenCalledWith(boom);
		});

		it('an AbortError thrown by an interceptor keeps its own message and is not offered to error hooks', async () => {
			scriptFetch([{ match: /./, body: {} }]);
			const onError = vi.fn(async (error: unknown) => {
				throw error;
			});
			const api = createAPIClient({
				baseURL,
				interceptors: [
					{
						onRequest: async () => {
							throw Object.assign(new Error('the interceptor gave up'), { name: 'AbortError' });
						},
						onError
					}
				]
			});

			await expect(api.get('/x')).rejects.toThrow('the interceptor gave up');
			expect(onError).not.toHaveBeenCalled();
		});

		it('header names are case-insensitive: the request wins over the client default, and one header is sent', async () => {
			// Both `Content-Type` and `content-type` were sent (A10).
			const fetched = scriptFetch([{ match: /\/x$/, body: {} }]);
			const api = createAPIClient({ baseURL, headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer default' } });

			await api.post('/x', { a: 1 }, { headers: { 'content-type': 'application/json', authorization: 'Bearer mine' } });

			expect(sentHeaders(fetched.calls[0]!)).toEqual({ 'content-type': 'application/json', authorization: 'Bearer mine' });
		});

		it.each([
			['FormData', () => new FormData()],
			['Blob', () => new Blob(['x'])],
			['URLSearchParams', () => new URLSearchParams({ a: '1' })],
			['ArrayBuffer', () => new ArrayBuffer(4)],
			['Uint8Array', () => new Uint8Array([1, 2])]
		])('a %s body reaches fetch untouched, with no content-type added', async (_name, make) => {
			// Every object body was JSON-stringified, so a FormData went out as
			// the text `{}` under application/json (A6).
			const fetched = scriptFetch([{ match: /\/up$/, body: {} }]);
			const api = createAPIClient({ baseURL });
			const body = make();

			await api.post('/up', body);

			expect(fetched.calls[0]!.init?.body).toBe(body);
			expect(sentHeaders(fetched.calls[0]!)['content-type']).toBeUndefined();
		});

		it('a string body is sent as is, and a plain body as JSON with the content type', async () => {
			const fetched = scriptFetch([{ match: /\/up$/, body: {} }]);
			const api = createAPIClient({ baseURL });

			await api.post('/up', 'raw text');
			await api.post('/up', { a: 1 });

			expect(fetched.calls[0]!.init?.body).toBe('raw text');
			expect(sentHeaders(fetched.calls[0]!)['content-type']).toBeUndefined();
			expect(fetched.calls[1]!.init?.body).toBe('{"a":1}');
			expect(sentHeaders(fetched.calls[1]!)['content-type']).toBe('application/json');
		});

		it('two FormData POSTs never coalesce, even opted in', async () => {
			// Every FormData keyed as `{}`, so two distinct uploads were one (A6).
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/up$/, body: {}, until: gate.promise }]);
			const api = createAPIClient({ baseURL });

			const a = api.post('/up', new FormData(), { deduplicate: true });
			const b = api.post('/up', new FormData(), { deduplicate: true });
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(2);
		});

		it('two bodies differing only by a Date are two requests', async () => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/at$/, body: {}, until: gate.promise }]);
			const api = createAPIClient({ baseURL });

			const a = api.post('/at', { at: new Date(0) }, { deduplicate: true });
			const b = api.post('/at', { at: new Date(1) }, { deduplicate: true });
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(2);
		});

		it("a body with no JSON form is the caller's TypeError, with no fetch and no retry", async () => {
			// JSON.stringify threw inside the fetch: a retryable NetworkError,
			// retried with backoff; keying it first overflowed the stack (A15).
			const fetched = scriptFetch([{ match: /./, body: {} }]);
			const api = createAPIClient({ baseURL, retry: { maxAttempts: 3, initialDelay: 1 } });
			const cyclic: Record<string, unknown> = {};
			cyclic.self = cyclic;

			await expect(api.post('/x', cyclic)).rejects.toBeInstanceOf(TypeError);
			expect(fetched.calls).toHaveLength(0);
		});

		it('callers with different retry policies do not share an attempt; the same policy does', async () => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/x$/, body: { ok: 1 }, until: gate.promise }]);
			const api = createAPIClient({ baseURL });
			const predicate = () => true;

			const requests = [
				api.get('/x', { retry: false }),
				api.get('/x', { retry: { maxAttempts: 3 } }),
				api.get('/x', { retry: { shouldRetry: predicate } }),
				api.get('/x', { retry: { shouldRetry: predicate } }),
				api.get('/x', { retry: { shouldRetry: () => true } })
			];
			await turn();
			gate.resolve();
			await Promise.all(requests);

			// false; maxAttempts 3; the shared predicate (two callers); the other predicate.
			expect(fetched.calls).toHaveLength(4);
		});

		it('shouldRetry is consulted once per failure, with the attempt number', async () => {
			// It was called twice per failure, first with attempt 0 (A12).
			const fetched = scriptFetch([{ match: /\/flaky$/, status: 503, body: {} }]);
			const shouldRetry = vi.fn((_error: unknown, attempt: number) => attempt < 2);
			const api = createAPIClient({ baseURL, retry: { maxAttempts: 5, initialDelay: 1, shouldRetry } });

			await expect(api.get('/flaky')).rejects.toMatchObject({ status: 503 });

			expect(fetched.calls).toHaveLength(2);
			expect(shouldRetry.mock.calls.map((c) => c[1])).toEqual([1, 2]);
		});

		it('a non-Error abort reason is kept as the rejection cause', async () => {
			const gate = deferred();
			scriptFetch([{ match: /\/x$/, body: {}, until: gate.promise }]);
			const api = createAPIClient({ baseURL });
			const ac = new AbortController();

			const p = api.get('/x', { signal: ac.signal });
			const rejected = expect(p).rejects.toMatchObject({ name: 'AbortError', cause: { code: 7 } });
			await turn();
			ac.abort({ code: 7 });
			await rejected;
			gate.resolve();
		});

		it.each(['PUT', 'PATCH', 'DELETE'] as const)('identical concurrent %s requests are two requests', async (method) => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/t$/, body: {}, until: gate.promise }]);
			const api = createAPIClient({ baseURL });

			const a = api.request({ method, url: '/t', config: { body: { a: 1 } } });
			const b = api.request({ method, url: '/t', config: { body: { a: 1 } } });
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(2);
		});

		it.each(['HEAD', 'OPTIONS'] as const)('identical concurrent %s requests are one request', async (method) => {
			const gate = deferred();
			const fetched = scriptFetch([{ match: /\/t$/, until: gate.promise }]);
			const api = createAPIClient({ baseURL });

			const a = api.request({ method, url: '/t' });
			const b = api.request({ method, url: '/t' });
			await turn();
			gate.resolve();
			await Promise.all([a, b]);

			expect(fetched.calls).toHaveLength(1);
		});

		it.each(['products', '/products', '/products?x=1', 'products*', '/products/*'])(
			"invalidateCache(%j) reaches the entries made with get('/products') and get('/products/1')",
			async (pattern) => {
				// Entries were filed under the raw path, so `'products'` and
				// `'/products'` were different paths (R1-REVIEW 1.9).
				const fetched = scriptFetch([{ match: /\/products/, body: {} }]);
				const api = createAPIClient({ baseURL, cache: true });

				await api.get('/products');
				await api.get('/products/1');
				expect((await api.get('/products')).cached).toBe(true);
				expect((await api.get('/products/1')).cached).toBe(true);

				api.invalidateCache(pattern);

				const reachesList = pattern !== '/products/*';
				const reachesItem = pattern.endsWith('*');
				expect((await api.get('/products')).cached).toBe(reachesList ? undefined : true);
				expect((await api.get('/products/1')).cached).toBe(reachesItem ? undefined : true);
				expect(fetched.calls).toHaveLength(2 + (reachesList ? 1 : 0) + (reachesItem ? 1 : 0));
			}
		);

		it('a mutation invalidates by the normalised path', async () => {
			const fetched = scriptFetch([{ match: /\/products/, body: {} }]);
			const api = createAPIClient({ baseURL, cache: true });

			await api.get('products?page=1');
			expect((await api.get('products?page=1')).cached).toBe(true);
			await api.post('/products', { name: 'x' });
			expect((await api.get('products?page=1')).cached).toBeUndefined();
			expect(fetched.calls).toHaveLength(3);
		});

		it('a class instance in a shared or cached response warns once per path, and clearCache resets it', async () => {
			// A structured clone is plain data: the instance loses its prototype
			// on the way to every other caller and to the cache.
			const warns = expectConsole('warn', 2);
			scriptFetch([{ match: /\/inst/, body: { n: 1 } }]);
			class Thing {
				constructor(readonly n: number) {}
			}
			const api = createAPIClient({
				baseURL,
				cache: true,
				interceptors: [{ onResponse: async (r) => ({ ...r, data: new Thing((r.data as { n: number }).n) as typeof r.data }) }]
			});

			await api.get('/inst');
			await api.get('/inst?x=1'); // another key, the same path: no second warning
			expect(warns).toHaveLength(1);
			expect(String(warns[0]![0])).toContain('/inst');

			api.clearCache();
			await api.get('/inst');
			expect(warns).toHaveLength(2);
		});

		it('the set of paths warned about is bounded by maxEntries', async () => {
			const warns = expectConsole('warn', 3);
			scriptFetch([{ match: /\/p/, body: { n: 1 } }]);
			class Thing {
				constructor(readonly n: number) {}
			}
			const api = createAPIClient({
				baseURL,
				cache: { maxEntries: 1 },
				interceptors: [{ onResponse: async (r) => ({ ...r, data: new Thing((r.data as { n: number }).n) as typeof r.data }) }]
			});

			await api.get('/p1'); // warns; the set holds p1
			await api.get('/p2'); // warns; p1 leaves the set (and the cache)
			await api.get('/p1'); // refetched, and warns again: it was forgotten
			expect(warns).toHaveLength(3);
		});

		it('the uncloneable warning is per path and reset by clearCache', async () => {
			const warns = expectConsole('warn', 2);
			scriptFetch([{ match: /\/fn/, body: { ok: 1 } }]);
			const api = createAPIClient({
				baseURL,
				cache: true,
				interceptors: [{ onResponse: async (r) => ({ ...r, data: { ...(r.data as object), call: () => 1 } as typeof r.data }) }]
			});

			await api.get('/fn');
			await api.get('/fn?x=1');
			expect(warns).toHaveLength(1);
			api.clearCache();
			await api.get('/fn');
			expect(warns).toHaveLength(2);
		});

		it.each([0, -1, NaN, '5' as unknown as number])('timeout %s on a request is a TypeError', async (timeout) => {
			// `timeout: 0` rejected every request at once (A10).
			const fetched = scriptFetch([{ match: /./, body: {} }]);
			const api = createAPIClient({ baseURL });

			await expect(api.get('/x', { timeout })).rejects.toBeInstanceOf(TypeError);
			expect(fetched.calls).toHaveLength(0);
		});

		it.each([{ timeout: 0 }, { timeout: -5 }, { cache: { ttl: 0 } }, { cache: { ttl: Infinity } }, { cache: { maxEntries: 0 } }, { cache: { maxEntries: 1.5 } }])(
			'createAPIClient(%j) is a TypeError',
			(config) => {
				expect(() => createAPIClient(config)).toThrow(TypeError);
			}
		);

		it('timeout: Infinity means no bound', async () => {
			vi.useFakeTimers();
			try {
				const gate = deferred();
				scriptFetch([{ match: /\/x$/, body: { ok: 1 }, until: gate.promise }]);
				const api = createAPIClient({ baseURL, timeout: Infinity });

				const p = api.get<{ ok: number }>('/x');
				await vi.advanceTimersByTimeAsync(0);
				expect(vi.getTimerCount()).toBe(0);

				gate.resolve();
				expect((await p).data).toEqual({ ok: 1 });
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
