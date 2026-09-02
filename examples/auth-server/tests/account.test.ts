/**
 * The settings read model, and the demand for proof that had no counterparty.
 *
 * `reauthentication_required` was designed and shipped on the client without
 * anything ever emitting it. Everything below the first two tests exists to
 * make it real — and to check the part the client cannot: that `methods` is
 * *computed from the account*, so a surface prompting for a password is only
 * ever shown to an account that has one.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

const NEW_PASSWORD = 'a-completely-different-passphrase';

describe('the account read model', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	it('carries what the session deliberately does not', async () => {
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		const account = await h.deps.fetchAccount();

		// All four are required by the client's decoder, which refuses rather than
		// defaults: a surface defaulting `hasPassword` would offer to *change* a
		// password that does not exist.
		expect(account).toMatchObject({
			email: SEED.ada.email,
			emailVerified: true,
			hasPassword: true,
			mfaEnabled: false
		});
		expect(account.providers).toEqual(expect.arrayContaining(['github', 'google']));
	});

	it('refuses to answer without a session', async () => {
		await expect(h.deps.fetchAccount()).rejects.toMatchObject({
			code: 'invalid_credentials'
		});
	});
});

describe('changing a password', () => {
	let h: Harness;
	afterEach(async () => {
		await h.stop();
	});

	it('rotates the session, and hands the new one back', async () => {
		h = await startServer({ rotateSessionOnPasswordChange: true });
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

		const rotated = await h.deps.changePassword(NEW_PASSWORD);
		expect(rotated, 'a rotating backend returned no session to hand over').not.toBeNull();
		expect(rotated?.subject_id).toBe(SEED.ada.id);

		// The rotated cookie still works — a rotation that stranded the device
		// would be worse than not rotating.
		expect(await h.deps.fetchSession()).not.toBeNull();
	});

	it('answers 204 when the backend keeps the session', async () => {
		// The other legal branch. `null` with a success is not a failure — the
		// password changed and this device kept what it had.
		h = await startServer({ rotateSessionOnPasswordChange: false });
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

		expect(await h.deps.changePassword(NEW_PASSWORD)).toBeNull();
		expect(await h.deps.fetchSession()).not.toBeNull();
	});
});

describe('demanding proof it is still you', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	/**
	 * Sign in the way that produces a **stale** session.
	 *
	 * No configuration and no test-only switch: a magic link proves control of a
	 * mailbox, not knowledge of a credential on this account, so the session it
	 * mints has never had one proven. That is a real policy — GitHub's sudo mode
	 * behaves the same way — and it is what makes this branch reachable at all.
	 */
	async function signInByLink(email: string): Promise<void> {
		await h.deps.requestMagicLink(email);
		const sent = [...h.store.outbox].reverse().find((s) => s.to === email && s.kind === 'magic-link');
		if (sent === undefined) throw new Error(`no magic link was sent to ${email}`);
		await h.deps.signInWithMagicLink(sent.token);
	}

	it('refuses a sensitive change on a session that never proved a credential', async () => {
		await signInByLink(SEED.ada.email);

		const error = await h.deps
			.changePassword(NEW_PASSWORD)
			.then(() => null)
			.catch((e: unknown) => e);

		expect(error, 'a link-only session changed a password unchallenged').toMatchObject({
			code: 'reauthentication_required'
		});
		// Computed from the account, not fixed. Ada has a password and no
		// authenticator, so a password is the only thing worth prompting for.
		expect((error as { methods: string[] }).methods).toEqual(['password']);
	});

	it('offers the second factor too, when the account has one', async () => {
		// The same demand against a different account produces a different list —
		// which is the whole reason the client carries `methods` rather than
		// assuming.
		await signInByLink(SEED.turing.email);

		const error = await h.deps
			.disableMfa()
			.then(() => null)
			.catch((e: unknown) => e);

		expect(error).toMatchObject({ code: 'reauthentication_required' });
		expect((error as { methods: string[] }).methods).toEqual([
			'password',
			'totp',
			'recovery_code'
		]);
	});

	it('lets the user satisfy the demand and retry', async () => {
		// The recovery loop, closed without a twenty-third endpoint: signing in
		// again as the account already in the cookie refreshes that session rather
		// than minting a second one.
		await signInByLink(SEED.ada.email);
		await expect(h.deps.changePassword(NEW_PASSWORD)).rejects.toMatchObject({
			code: 'reauthentication_required'
		});

		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

		await expect(
			h.deps.changePassword(NEW_PASSWORD),
			'proving the password did not clear the demand'
		).resolves.not.toThrow();
	});

	it('does not demand proof an account cannot give', async () => {
		// Grace has no password and no authenticator, so there is nothing to
		// prompt for. Demanding proof here would strand her on a screen with
		// nothing to answer — which is exactly what the client's
		// `ReauthenticationRequiredError` warns about.
		await signInByLink(SEED.grace.email);

		const account = await h.deps.fetchAccount();
		expect(account.hasPassword).toBe(false);
		expect(account.mfaEnabled).toBe(false);

		await expect(
			h.deps.changePassword(NEW_PASSWORD),
			'demanded proof from an account with no credential to prove'
		).resolves.not.toThrow();
	});

	it('lets a freshly proven password session through', async () => {
		await h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
		await expect(h.deps.changePassword(NEW_PASSWORD)).resolves.not.toThrow();
	});

	it('demands proof again once the window has passed', async () => {
		// The window is a boot-time option. Nothing in a *request* can change it —
		// that is the line between configuration and a backdoor, and it is why
		// this is set at construction rather than sent as a header.
		const stale = await startServer({ freshnessMs: 0 });
		try {
			await stale.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });
			await expect(stale.deps.changePassword(NEW_PASSWORD)).rejects.toMatchObject({
				code: 'reauthentication_required'
			});
		} finally {
			await stale.stop();
		}
	});
});
