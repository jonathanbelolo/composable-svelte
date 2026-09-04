/**
 * The cookie, before anything else.
 *
 * This is the file the whole exercise exists for. Every other test in
 * `packages/auth` replaces `globalThis.fetch`, so until now nothing had ever
 * emitted a `Set-Cookie`, carried one, or cleared one.
 *
 * The literal header is asserted here rather than anywhere else, because two of
 * its properties are about attributes that must be **absent** — and an absence
 * is the kind of thing that quietly starts being present.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SEED } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

describe('the session cookie', () => {
	let h: Harness;

	beforeAll(async () => {
		h = await startServer();
	});
	afterAll(async () => {
		await h.stop();
	});

	it('is HttpOnly, Lax, and carries neither Secure nor Domain', async () => {
		await h.deps.fetchLogin(SEED.ada.id);

		const raw = h.jar.seen.at(-1);
		expect(raw, 'signing in emitted no Set-Cookie at all').toBeDefined();

		expect(raw).toContain('cs_session=');
		expect(raw).toContain('Path=/');
		expect(raw).toContain('HttpOnly');
		expect(raw?.toLowerCase()).toContain('samesite=lax');

		// The two absences. `Secure` is off because this fixture is served over
		// plain http and any host that is not `localhost` would silently drop the
		// cookie — browsers exempt localhost, so a browser test cannot catch this
		// and only an assertion on the header itself can. `Domain=localhost` is a
		// domain cookie for a dotless host, which several browsers reject outright.
		expect(raw, 'Secure is set by default, so any non-localhost http host loses the session')
			.not.toContain('Secure');
		expect(raw, 'Domain on a dotless host is rejected by several browsers').not.toContain(
			'Domain'
		);
	});

	it('carries the session across separate calls', async () => {
		// The property no stub can have: the second request knows about the first
		// only because a cookie travelled between them.
		await h.deps.fetchLogin(SEED.ada.id);

		const resolved = await h.deps.fetchSession();
		expect(resolved, 'the session did not survive the round trip').not.toBeNull();
		expect(resolved?.subject_id).toBe(SEED.ada.id);
	});

	it('goes anonymous after a sign-out, and clears the cookie', async () => {
		await h.deps.fetchLogin(SEED.ada.id);
		expect(await h.deps.fetchSession()).not.toBeNull();

		await h.deps.fetchLogout();

		expect(h.jar.header(), 'the cookie outlived the sign-out').not.toContain('cs_session=');
		expect(await h.deps.fetchSession()).toBeNull();
	});

	it('answers a signed-out read without a session', async () => {
		h.jar.clear();
		expect(await h.deps.fetchSession()).toBeNull();
	});
});

describe('the anonymous status', () => {
	// The client treats 401 and 204 as identical. Both are exercised so that
	// "either is fine" is a tested claim rather than a sentence in a doc comment.
	for (const status of [401, 204] as const) {
		it(`reads ${status} as anonymous`, async () => {
			const h = await startServer({ anonymousStatus: status });
			try {
				expect(await h.deps.fetchSession()).toBeNull();
			} finally {
				await h.stop();
			}
		});
	}
});

describe('the Secure attribute', () => {
	it('is added when the server is told it is behind https', async () => {
		// The switch the default's comment promises. Without this test the option
		// could be removed and nothing would notice — and the comment explaining
		// why the default is off would be describing a knob that does not exist.
		const h = await startServer({ secureCookie: true });
		try {
			await h.deps.fetchLogin(SEED.ada.id);
			expect(h.jar.seen.at(-1)).toContain('Secure');
		} finally {
			await h.stop();
		}
	});
});
