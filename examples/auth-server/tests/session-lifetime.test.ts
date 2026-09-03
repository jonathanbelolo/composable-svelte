/**
 * A session's lifetime, and the field it must never touch.
 *
 * Two windows: an idle one that slides on every authenticated request, and an
 * absolute cap fixed at sign-in that never moves. Without the cap, a session
 * used often enough never expires at all — an idle window alone is not an
 * expiry policy.
 *
 * **The pin in this file is the reason `refresh()` was renamed.** Sliding a
 * session must not touch `authenticatedAt`, which is the *sudo-mode* window
 * `requireFresh` reads. If it did, a session kept alive by ordinary use would
 * hold sudo mode open forever and all six sensitive operations would silently
 * stop demanding proof. That is privilege escalation, not a UX regression, and
 * it is the sort of thing that is obvious only once it is written down.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COOKIE } from '../src/session.js';
import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

/** A clock the test drives. One instance reaches the store and the session. */
function mockClock(start = Date.parse('2026-01-01T12:00:00.000Z')) {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		}
	};
}

describe('session lifetime', () => {
	let h: Harness;
	let clock: ReturnType<typeof mockClock>;

	/** The session id the jar would send. It exposes the header, not the value. */
	const idFrom = (harness: Harness): string => {
		const match = new RegExp(`${COOKIE}=([^;]+)`).exec(harness.jar.header());
		if (match?.[1] === undefined) throw new Error('no session cookie in the jar');
		return match[1];
	};
	const live = () => h.store.sessions.get(idFrom(h))!;

	/**
	 * Sign in by a magic link, so `authenticatedAt` is exactly `0`.
	 *
	 * Exact rather than approximate, which is what makes the pin below immune to
	 * the same-millisecond flake `demandReauthentication`'s own comment records.
	 */
	async function signInByLink(email: string): Promise<void> {
		await h.deps.requestMagicLink(email);
		const sent = [...h.store.outbox]
			.reverse()
			.find((s) => s.to === email && s.kind === 'magic-link');
		if (sent === undefined) throw new Error(`no magic link was sent to ${email}`);
		await h.deps.signInWithMagicLink(sent.token);
	}

	beforeEach(async () => {
		clock = mockClock();
		h = await startServer({ now: clock.now });
	});
	afterEach(async () => {
		await h.stop();
	});

	it('slides the idle window on an ordinary authenticated request', async () => {
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		const before = live().idleExpiresAt;

		clock.advance(60_000);
		await h.deps.fetchAccount();

		expect(live().idleExpiresAt).toBe(before + 60_000);
	});

	it('does not touch authenticatedAt while sliding — the pin', async () => {
		await signInByLink(SEED.ada.email);
		expect(live().authenticatedAt, 'a link sign-in proves no credential').toBe(0);

		clock.advance(60_000);
		await h.deps.fetchAccount();

		// The positive control: the request really did slide the window, so a
		// green assertion below cannot mean "nothing happened at all".
		expect(live().idleExpiresAt).toBeGreaterThan(0);
		expect(live().authenticatedAt, 'sliding the session opened sudo mode').toBe(0);
	});

	it('and so a slid session is still stale for requireFresh', async () => {
		// The same property one layer up, in the terms a user would notice.
		await signInByLink(SEED.ada.email);

		clock.advance(60_000);
		await h.deps.fetchAccount();

		await expect(h.deps.changePassword('a-completely-different-passphrase')).rejects.toMatchObject(
			{ code: 'reauthentication_required' }
		);
	});

	it('never slides past the absolute cap', async () => {
		const capped = await startServer({ now: clock.now, idleMs: 60_000, absoluteMs: 5_000 });
		try {
			await capped.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			const sid = idFrom(capped);
			const session = capped.store.sessions.get(sid)!;

			// The idle window is twelve times the cap, so it must have been clamped
			// at sign-in rather than at the first slide.
			expect(session.idleExpiresAt).toBe(session.absoluteExpiresAt);

			clock.advance(1_000);
			await capped.deps.fetchAccount();
			expect(capped.store.sessions.get(sid)!.idleExpiresAt).toBe(session.absoluteExpiresAt);
		} finally {
			await capped.stop();
		}
	});

	it('is anonymous once the idle window lapses, and forgets the session', async () => {
		const brief = await startServer({ now: clock.now, idleMs: 1_000 });
		try {
			await brief.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			const sid = idFrom(brief);

			clock.advance(1_001);

			await expect(brief.deps.fetchSession()).resolves.toBeNull();
			// Deleted, not merely refused: this fixture expires things when they are
			// read, because nothing here may use `setInterval`.
			expect(brief.store.sessions.has(sid), 'the lapsed session was kept').toBe(false);
		} finally {
			await brief.stop();
		}
	});

	it('is anonymous once the absolute cap is reached, however active', async () => {
		const capped = await startServer({ now: clock.now, idleMs: 10_000, absoluteMs: 25_000 });
		try {
			await capped.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

			// Used every 9s against a 10s idle window, so the idle window never
			// lapses — at t=9s and t=18s the session is very much alive, and the
			// second of those is already past two idle windows' worth of time.
			for (const _ of [0, 1]) {
				clock.advance(9_000);
				await expect(capped.deps.fetchAccount()).resolves.toBeDefined();
			}

			// t=27s, past the 25s cap. Activity bought nothing.
			clock.advance(9_000);

			await expect(capped.deps.fetchSession()).resolves.toBeNull();
		} finally {
			await capped.stop();
		}
	});

	it('gives a rotated session a new absolute cap', async () => {
		// Rotation on a password change is an authentication event, so the cap
		// counts from the new sign-in rather than the old one.
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		const first = live().absoluteExpiresAt;

		clock.advance(60_000);
		await h.deps.changePassword('a-completely-different-passphrase');

		expect(live().absoluteExpiresAt).toBe(first + 60_000);
	});
});
