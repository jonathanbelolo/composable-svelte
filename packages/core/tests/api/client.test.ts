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

	it('A1 (pinned defect): two clients with different default headers share one in-flight GET', async () => {
		// Pinned, not fixed: request deduplication is module-global and its key
		// omits the client's base URL and default headers, so two clients built
		// per request for two users coalesce into one fetch and both receive
		// the first user's body. This asserts the defective behaviour and fails
		// the moment R1.3 keys per client; remove it in that commit.
		// AUDIT-2026-09-03-FINDINGS A1.
		const fetched = scriptFetch([{ match: /\/me$/, body: { who: 'first' }, delayMs: 20 }]);
		const alice = createAPIClient({ baseURL: 'https://a.example', headers: { Authorization: 'Bearer alice' } });
		const bob = createAPIClient({ baseURL: 'https://a.example', headers: { Authorization: 'Bearer bob' } });

		const [a, b] = await Promise.all([alice.get('/me'), bob.get('/me')]);

		expect(fetched.calls).toHaveLength(1);
		expect(a.data).toEqual({ who: 'first' });
		expect(b.data).toEqual({ who: 'first' });
	});
});
