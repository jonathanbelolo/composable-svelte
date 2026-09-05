/**
 * The real API client over a scripted `fetch`.
 *
 * Every other file in this directory tests `createMockAPI`, `createSpyAPI`
 * or the error classes; this is the first to import `client.ts`. R0.3.a
 * lands the harness and a smoke test; the behaviour tests arrive with R1.3.
 */

import { describe, it, expect } from 'vitest';
import { createAPIClient } from '../../src/lib/api/client.js';
import { deferred, scriptFetch } from '../helpers/scripted-fetch.js';
import { expectConsole } from '../helpers/console.js';
import { TimeoutError } from '../../src/lib/api/errors.js';


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
		const sentHeaders = fetched.calls.map((c) => (c.init?.headers as Record<string, string>).Authorization);
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
});
