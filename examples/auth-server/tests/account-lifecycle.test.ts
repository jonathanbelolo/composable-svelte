/**
 * Changing an address and deleting an account, against the real server.
 *
 * Three things here cannot be reached with a `fetch` stub, which is why the
 * fixture exists:
 *
 * - **the confirmation link goes to the *new* address.** That is the whole
 *   proof — following it demonstrates control of the mailbox being moved to —
 *   and a stub asserting "requestEmailChange was called" says nothing about it.
 * - **a superseded link must not apply the newer address.** Requesting twice
 *   overwrites the pending record while the first token is still live.
 * - **`email_taken` is re-checked at confirmation**, because the address can be
 *   claimed in between.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

const MOVING_TO = 'ada.new@example.com';

describe('changing an email address', () => {
	let h: Harness;

	const linkFor = (to: string): string => {
		const sent = [...h.store.outbox].reverse().find((s) => s.to === to && s.kind === 'change-email');
		if (sent === undefined) throw new Error(`no change-email link was sent to ${to}`);
		return sent.token;
	};

	beforeEach(async () => {
		h = await startServer();
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
	});
	afterEach(async () => {
		await h.stop();
	});

	it('sends the link to the new address, not the current one', async () => {
		await h.deps.requestEmailChange(MOVING_TO);

		const recipients = h.store.outbox.filter((s) => s.kind === 'change-email').map((s) => s.to);
		expect(recipients).toEqual([MOVING_TO]);
		expect(recipients, 'the link went to the address they already control').not.toContain(
			SEED.ada.email
		);
	});

	it('changes nothing until the link is followed', async () => {
		await h.deps.requestEmailChange(MOVING_TO);

		const account = await h.deps.fetchAccount();
		expect(account.email).toBe(SEED.ada.email);
		expect(account.pendingEmail).toBe(MOVING_TO);
	});

	it('applies the change on confirmation, and reports the new address', async () => {
		await h.deps.requestEmailChange(MOVING_TO);
		await expect(h.deps.confirmEmailChange(linkFor(MOVING_TO))).resolves.toBe(MOVING_TO);

		const account = await h.deps.fetchAccount();
		expect(account.email).toBe(MOVING_TO);
		expect(account.pendingEmail).toBeNull();
		// Confirmed by construction: the link went there and was followed.
		expect(account.emailVerified).toBe(true);
	});

	it('refuses an address that already has an account, and names it', async () => {
		await expect(h.deps.requestEmailChange(SEED.grace.email)).rejects.toMatchObject({
			code: 'email_taken',
			email: SEED.grace.email
		});
	});

	it('refuses the address the account already has', async () => {
		// True but useless as `email_taken` — the account it is taken by is this
		// one — so it is `unknown` with a message that says which.
		await expect(h.deps.requestEmailChange(SEED.ada.email)).rejects.toMatchObject({
			code: 'unknown'
		});
	});

	it('does not let a superseded link apply the newer address', async () => {
		await h.deps.requestEmailChange(MOVING_TO);
		const first = linkFor(MOVING_TO);

		const second = 'ada.later@example.com';
		await h.deps.requestEmailChange(second);

		await expect(h.deps.confirmEmailChange(first)).rejects.toMatchObject({
			code: 'token_expired'
		});
		// And the account is untouched — not moved to either address.
		expect((await h.deps.fetchAccount()).email).toBe(SEED.ada.email);
	});

	it('re-checks the address at confirmation, not only at request', async () => {
		await h.deps.requestEmailChange(MOVING_TO);
		const token = linkFor(MOVING_TO);

		// Someone signs up for it in between. That race is the reason to re-check.
		await h.deps.signup({ email: MOVING_TO, password: SEED_PASSWORD });

		await expect(h.deps.confirmEmailChange(token)).rejects.toMatchObject({
			code: 'email_taken'
		});
	});

	it('spends the link on success', async () => {
		await h.deps.requestEmailChange(MOVING_TO);
		const token = linkFor(MOVING_TO);

		await h.deps.confirmEmailChange(token);

		// **Asserted on the store, not through a second call.** Re-confirming
		// fails whether or not the token was spent, because the *pending record*
		// is gone either way — so the behavioural check alone passed happily
		// while the token sat in memory for an hour, unspent.
		expect(h.store.tokens.peek(token), 'a single-use token outlived its use').toBeNull();

		await expect(h.deps.confirmEmailChange(token)).rejects.toMatchObject({
			code: 'token_expired'
		});
	});

	it('does not spend a token of another kind posted to this endpoint', async () => {
		// `take` consumed the token *before* checking its kind, so posting a
		// verification link here destroyed it and then answered 410 — someone's
		// link dead for pasting it into the wrong page. It is `peek`, validate,
		// then spend.
		await h.deps.resendVerification(SEED.hopper.email);
		const sent = [...h.store.outbox]
			.reverse()
			.find((s) => s.to === SEED.hopper.email && s.kind === 'verify-email');
		if (sent === undefined) throw new Error('no verification link was sent');

		await expect(h.deps.confirmEmailChange(sent.token)).rejects.toMatchObject({
			code: 'token_expired'
		});

		// Still good. It was never this endpoint's to spend.
		await expect(h.deps.verifyEmail(sent.token)).resolves.toBeDefined();
	});

	it('resends to the pending address without being told what it is', async () => {
		await h.deps.requestEmailChange(MOVING_TO);
		await h.deps.resendEmailChange();

		const links = h.store.outbox.filter((s) => s.kind === 'change-email');
		expect(links).toHaveLength(2);
		expect(links.every((s) => s.to === MOVING_TO)).toBe(true);
		// The resent link works; the superseded one does not.
		await expect(h.deps.confirmEmailChange(links[1]!.token)).resolves.toBe(MOVING_TO);
	});

	it('refuses a resend when nothing is pending', async () => {
		await expect(h.deps.resendEmailChange()).rejects.toMatchObject({ code: 'unknown' });
	});

	it('demands proof on a session that never proved a credential', async () => {
		const stale = await startServer({ freshnessMs: 0 });
		try {
			await stale.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			await expect(stale.deps.requestEmailChange(MOVING_TO)).rejects.toMatchObject({
				code: 'reauthentication_required'
			});
		} finally {
			await stale.stop();
		}
	});
});

describe('deleting an account', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	it('ends the account and the session', async () => {
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		await h.deps.deleteAccount();

		expect(h.store.accounts.has(SEED.ada.id)).toBe(false);
		await expect(h.deps.fetchSession()).resolves.toBeNull();
	});

	it('ends every session, not only the one that asked', async () => {
		const mine = () => [...h.store.sessions.values()].filter((s) => s.accountId === SEED.ada.id);

		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		// A second device: same account, no cookie. Signing in *with* the cookie
		// would prove a credential on the existing session rather than mint a
		// second one, which is `password-login`'s documented behaviour — and is
		// why the first version of this test had only one session to delete.
		h.jar.clear();
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

		expect(mine().length, 'needs more than one session to be a real test').toBeGreaterThan(1);

		await h.deps.deleteAccount();

		expect(mine(), 'a forgotten device kept a session for a deleted account').toHaveLength(0);
	});

	it('demands proof on a stale session', async () => {
		const stale = await startServer({ freshnessMs: 0 });
		try {
			await stale.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			await expect(stale.deps.deleteAccount()).rejects.toMatchObject({
				code: 'reauthentication_required'
			});
			expect(stale.store.accounts.has(SEED.ada.id), 'refused and still deleted').toBe(true);
		} finally {
			await stale.stop();
		}
	});

	it('lets an account with nothing to prove with through', async () => {
		// `grace` has no password and no authenticator, so `proofMethods` is empty
		// and demanding proof would strand her on a prompt with nothing to answer.
		// This proves the rule extends to the endpoints added here.
		const open = await startServer({ freshnessMs: 0 });
		try {
			await open.deps.fetchLogin(SEED.grace.id);
			await expect(open.deps.deleteAccount()).resolves.toBeUndefined();
		} finally {
			await open.stop();
		}
	});
});

describe('refreshing a session', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	it('reports the advertised expiry', async () => {
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		const { expiresAt } = await h.deps.refreshSession();

		expect(typeof expiresAt, 'ISO 8601 string, never a number or Date').toBe('string');
		expect(Number.isNaN(Date.parse(expiresAt!))).toBe(false);
	});

	it('succeeds on a session that never proved a credential', async () => {
		// The "no requireFresh" decision. An endpoint that demanded proof to
		// extend a session could only extend the session that least needs it.
		const stale = await startServer({ freshnessMs: 0 });
		try {
			await stale.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			await expect(stale.deps.changePassword('x-y-z-a-b-c-d')).rejects.toMatchObject({
				code: 'reauthentication_required'
			});
			// Same session, same staleness — and this one goes through.
			await expect(stale.deps.refreshSession()).resolves.toBeDefined();
		} finally {
			await stale.stop();
		}
	});

	it('does not rotate the session id', async () => {
		// Two tabs refreshing concurrently would otherwise race, and the loser
		// would hold a cookie the server has forgotten.
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		const before = h.jar.header();

		await h.deps.refreshSession();

		expect(h.jar.header()).toBe(before);
	});

	it('rejects when there is no session', async () => {
		await expect(h.deps.refreshSession()).rejects.toMatchObject({
			code: 'invalid_credentials'
		});
	});
});
