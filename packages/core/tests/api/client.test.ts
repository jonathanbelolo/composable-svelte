/**
 * The real API client over a scripted `fetch`.
 *
 * Every other file in this directory tests `createMockAPI`, `createSpyAPI`
 * or the error classes; this is the first to import `client.ts`. R0.3.a
 * lands the harness and a smoke test; the behaviour tests arrive with R1.3.
 */

import { describe, it, expect } from 'vitest';
import { createAPIClient } from '../../src/lib/api/client.js';
import { scriptFetch } from '../helpers/scripted-fetch.js';


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
});
