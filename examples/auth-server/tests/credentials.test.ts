/**
 * Signing up, confirming an address, signing in, and getting back in.
 *
 * These are journeys rather than single calls, because a journey is what the
 * stub suite in `packages/auth` structurally cannot do: every step here depends
 * on state the previous step left on a real server, and on a cookie that
 * travelled between them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

/** A fresh address per test, so nothing here depends on test order. */
let counter = 0;
const freshEmail = (): string => `new-${Date.now()}-${counter++}@example.com`;

const NEW_PASSWORD = 'a-different-correct-horse';

describe('credentials', () => {
	let h: Harness;

	beforeAll(async () => {
		h = await startServer();
	});
	afterAll(async () => {
		await h.stop();
	});

	/** The token this server would have emailed to `address`, newest first. */
	const linkFor = (address: string, kind: string): string | undefined =>
		[...h.store.outbox].reverse().find((s) => s.to === address && s.kind === kind)?.token;

	it('signs up, confirms, and only then signs in', async () => {
		const email = freshEmail();

		const outcome = await h.deps.signup({ email, password: SEED_PASSWORD });
		expect(outcome.kind, 'a 202 was not read as "verification required"').toBe(
			'verificationRequired'
		);

		// Signing in before confirmation is refused with a code no HTTP status can
		// produce — the client needs `email_unverified` specifically, to offer
		// another email rather than a generic failure.
		await expect(h.deps.login({ email, password: SEED_PASSWORD })).rejects.toMatchObject({
			code: 'email_unverified',
			email
		});

		const token = linkFor(email, 'verify-email');
		expect(token, 'signing up sent no confirmation link').toBeDefined();

		// `204` means verified but *not* signed in — a success with no session.
		expect(await h.deps.verifyEmail(token!)).toBeNull();

		const session = await h.deps.login({ email, password: SEED_PASSWORD });
		expect(session.subject_id).toBeTruthy();
	});

	it('refuses a second account on the same address', async () => {
		const email = freshEmail();
		await h.deps.signup({ email, password: SEED_PASSWORD });

		await expect(h.deps.signup({ email, password: SEED_PASSWORD })).rejects.toMatchObject({
			code: 'email_taken',
			email
		});
	});

	it('rejects a wrong password without saying which half was wrong', async () => {
		await expect(
			h.deps.login({ email: SEED.ada.email, password: 'not-the-password' })
		).rejects.toMatchObject({ code: 'invalid_credentials' });

		await expect(
			h.deps.login({ email: 'nobody@example.com', password: 'not-the-password' })
		).rejects.toMatchObject({ code: 'invalid_credentials' });
	});

	it('locks an account, and keeps it locked against the right password', async () => {
		// The second half is the point. A lockout checked *after* the password is
		// verified lets the right password through, which makes it not a lockout
		// but a hint about which password was right.
		const email = freshEmail();
		await h.deps.signup({ email, password: SEED_PASSWORD });
		const token = linkFor(email, 'verify-email');
		await h.deps.verifyEmail(token!);

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(h.deps.login({ email, password: 'wrong' })).rejects.toMatchObject({
				code: 'invalid_credentials'
			});
		}

		const locked = await h.deps
			.login({ email, password: 'wrong' })
			.then(() => null)
			.catch((error: unknown) => error);
		expect(locked).toMatchObject({ code: 'account_locked' });
		expect(
			(locked as { until?: string }).until,
			'a lockout with no `until` leaves the surface unable to say when to come back'
		).toEqual(expect.any(String));

		await expect(
			h.deps.login({ email, password: SEED_PASSWORD }),
			'the right password unlocked a locked account'
		).rejects.toMatchObject({ code: 'account_locked' });
	});

	it('sends a reset link, and says nothing about whether the address exists', async () => {
		const unknown = 'nobody-at-all@example.com';
		const before = h.store.outbox.length;

		// Resolves. A rejection here would make the form an account checker, which
		// is the whole reason this flow is shaped the way it is.
		await expect(h.deps.requestPasswordReset(unknown)).resolves.toBeUndefined();
		expect(h.store.outbox.length, 'a link was sent to an address with no account').toBe(before);

		await h.deps.requestPasswordReset(SEED.ada.email);
		expect(linkFor(SEED.ada.email, 'reset-password')).toBeDefined();
	});

	it('resets a password, and the new one works', async () => {
		const email = freshEmail();
		await h.deps.signup({ email, password: SEED_PASSWORD });
		await h.deps.verifyEmail(linkFor(email, 'verify-email')!);

		await h.deps.requestPasswordReset(email);
		const token = linkFor(email, 'reset-password')!;

		// `204` — changed, now sign in.
		expect(await h.deps.resetPassword(token, NEW_PASSWORD)).toBeNull();

		await expect(h.deps.login({ email, password: SEED_PASSWORD })).rejects.toMatchObject({
			code: 'invalid_credentials'
		});
		await expect(h.deps.login({ email, password: NEW_PASSWORD })).resolves.toMatchObject({
			subject_id: expect.any(String)
		});
	});

	it('spends a reset link exactly once', async () => {
		const email = freshEmail();
		await h.deps.signup({ email, password: SEED_PASSWORD });
		await h.deps.verifyEmail(linkFor(email, 'verify-email')!);
		await h.deps.requestPasswordReset(email);
		const token = linkFor(email, 'reset-password')!;

		await h.deps.resetPassword(token, NEW_PASSWORD);
		await expect(h.deps.resetPassword(token, 'another-one-entirely')).rejects.toMatchObject({
			code: 'token_expired'
		});
	});

	it('signs in through a magic link', async () => {
		const email = freshEmail();
		await h.deps.signup({ email, password: SEED_PASSWORD });

		await h.deps.requestMagicLink(email);
		const token = linkFor(email, 'magic-link');
		expect(token).toBeDefined();

		const session = await h.deps.signInWithMagicLink(token!);
		expect(session.subject_id).toBeTruthy();

		// Following the link proves the address is reachable, so it confirms it.
		const account = await h.deps.fetchAccount();
		expect(account.emailVerified).toBe(true);
	});

	it('rate-limits repeated link requests, and prefers the header over the body', async () => {
		// Deterministic because the limit is keyed by address: with a fresh one the
		// first call always passes and the second always fails. No sleeping, no
		// fake timers, no interference between tests.
		const email = freshEmail();
		await h.deps.requestMagicLink(email);

		const error = await h.deps
			.requestMagicLink(email)
			.then(() => null)
			.catch((e: unknown) => e);

		expect(error).toMatchObject({ code: 'rate_limited' });

		// The server sends `Retry-After: n` and `retry_after_seconds: n + 900`, on
		// purpose. The client is documented to prefer the header, and sending the
		// same number twice would make that claim untestable.
		const seconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
		expect(seconds, 'the rate limit carried no delay at all').toBeDefined();
		expect(seconds!, 'the body value won, so the header is not being read').toBeLessThan(900);
	});
});
