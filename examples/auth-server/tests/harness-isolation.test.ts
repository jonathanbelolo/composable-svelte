import { describe, expect, it } from 'vitest';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

describe('harness isolation', () => {
	it.each(['creation', 'reverse'] as const)('isolates simultaneous clients stopped in %s order', async (order) => {
		const initialFetch = globalThis.fetch;

		const h1: Harness = await startServer();
		const h2: Harness = await startServer();

		try {
			// Global fetch must remain unmutated while harnesses are active
			expect(globalThis.fetch).toBe(initialFetch);

			// Log in as different accounts on h1 and h2
			await Promise.all([
				h1.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD }),
				h2.deps.fetchLogin(SEED.grace.id)
			]);

			// Verify accounts resolve independently without cookie contamination
			const [account1, account2] = await Promise.all([h1.deps.fetchAccount(), h2.deps.fetchAccount()]);
			expect(account1.email).toBe(SEED.ada.email);
			expect(account2.email).toBe(SEED.grace.email);

			// Verify session snapshots are isolated
			const [session1, session2] = await Promise.all([h1.deps.fetchSession(), h2.deps.fetchSession()]);
			expect(session1?.subject_id).toBe(SEED.ada.id);
			expect(session2?.subject_id).toBe(SEED.grace.id);

			// Logout on h1 does not affect h2
			await h1.deps.fetchLogout();
			expect(await h1.deps.fetchSession()).toBeNull();

			const session2AfterH1Logout = await h2.deps.fetchSession();
			expect(session2AfterH1Logout?.subject_id).toBe(SEED.grace.id);
			expect((await h2.deps.fetchAccount()).email).toBe(SEED.grace.email);

			// Exercise both teardown orders while the other client remains usable
			const [first, second] = order === 'creation' ? [h1, h2] : [h2, h1];
			await first.stop();
			expect(globalThis.fetch).toBe(initialFetch);
			await second.deps.fetchSession();
			await second.stop();

			// Verify idempotent stop
			await expect(h1.stop()).resolves.toBeUndefined();
			await expect(h2.stop()).resolves.toBeUndefined();

			// Global fetch remains strictly unmutated
			expect(globalThis.fetch).toBe(initialFetch);
		} finally {
			await h1.stop().catch(() => {});
			await h2.stop().catch(() => {});
		}
	});
});
