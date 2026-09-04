/**
 * The authenticator, end to end.
 *
 * The arm worth the whole file: **nothing has ever checked that the `secret`
 * and `otpauth_uri` the client decodes would actually work in an
 * authenticator.** `createMockAuthDeps` compares codes against a hardcoded
 * list, so a server returning a malformed secret, the wrong algorithm or the
 * wrong period would have passed every existing test and failed on a real
 * phone.
 *
 * Here the test derives a code from the secret the server just handed it, and
 * the server verifies it independently. `tests/totp.test.ts` is what stops that
 * being a tautology.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { generateTotp } from '../src/totp.js';
import { startServer, type Harness } from './harness.js';

describe('multi-factor authentication', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	/** Sign in as the seeded account that has a password and no authenticator. */
	const signInAsAda = () => h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD });

	it('enrols with a code derived from the secret it just issued', async () => {
		await signInAsAda();

		const start = await h.deps.beginMfaEnrolment();
		expect(start.enrolmentId).toBeTruthy();
		expect(start.secret).toBeTruthy();

		// The URI is what a QR code encodes. If it does not parse, or does not
		// carry the same secret, manual entry and scanning disagree — and nothing
		// before this ever looked.
		const uri = new URL(start.otpauthUri);
		expect(uri.protocol).toBe('otpauth:');
		expect(uri.searchParams.get('secret')).toBe(start.secret);

		const result = await h.deps.confirmMfaEnrolment(
			start.enrolmentId,
			generateTotp(start.secret, SEED.ada.email)
		);

		expect(result.recoveryCodes.length, 'an empty set is refused by the decoder').toBeGreaterThan(
			0
		);

		const account = await h.deps.fetchAccount();
		expect(account.mfaEnabled).toBe(true);
	});

	it('refuses a wrong confirmation code without attaching the secret', async () => {
		await signInAsAda();
		const start = await h.deps.beginMfaEnrolment();

		await expect(
			h.deps.confirmMfaEnrolment(start.enrolmentId, '000000')
		).rejects.toMatchObject({ code: 'invalid_credentials' });

		const account = await h.deps.fetchAccount();
		expect(account.mfaEnabled, 'a rejected code still turned the authenticator on').toBe(false);
	});

	it('asks for a second factor at the next sign-in, and carries a challenge id', async () => {
		// `challenge_id` is mandatory: without it the client degrades the whole
		// thing to `unknown`, silently, and the second-factor step becomes
		// unreachable in a way that looks like a UI bug three layers away.
		const error = await h.deps
			.login({ email: SEED.turing.email, password: SEED_PASSWORD })
			.then(() => null)
			.catch((e: unknown) => e);

		expect(error).toMatchObject({ code: 'mfa_required' });
		expect((error as { challengeId?: string }).challengeId).toEqual(expect.any(String));
		expect((error as { methods?: string[] }).methods).toContain('totp');
	});

	it('completes the sign-in with a real code from the authenticator', async () => {
		const error = await h.deps
			.login({ email: SEED.turing.email, password: SEED_PASSWORD })
			.catch((e: unknown) => e);
		const challengeId = (error as { challengeId: string }).challengeId;

		const session = await h.deps.verifyMfaChallenge(
			challengeId,
			generateTotp(SEED.turing.mfaSecret, SEED.turing.email),
			'totp'
		);

		expect(session.subject_id).toBe(SEED.turing.id);
		expect(await h.deps.fetchSession()).not.toBeNull();
	});

	it('keeps the challenge alive after a mistyped code', async () => {
		// Six digits get mistyped constantly. Burning the challenge would send the
		// user back to the password screen for a typo.
		const error = await h.deps
			.login({ email: SEED.turing.email, password: SEED_PASSWORD })
			.catch((e: unknown) => e);
		const challengeId = (error as { challengeId: string }).challengeId;

		await expect(
			h.deps.verifyMfaChallenge(challengeId, '000000', 'totp')
		).rejects.toMatchObject({ code: 'invalid_credentials' });

		await expect(
			h.deps.verifyMfaChallenge(
				challengeId,
				generateTotp(SEED.turing.mfaSecret, SEED.turing.email),
				'totp'
			)
		).resolves.toMatchObject({ subject_id: SEED.turing.id });
	});

	it('accepts a recovery code, once', async () => {
		// The way back in after a lost phone, and the reason recovery codes exist.
		await signInAsAda();
		const start = await h.deps.beginMfaEnrolment();
		const { recoveryCodes } = await h.deps.confirmMfaEnrolment(
			start.enrolmentId,
			generateTotp(start.secret, SEED.ada.email)
		);
		await h.deps.fetchLogout();

		const first = recoveryCodes[0]!;
		const error = await h.deps
			.login({ email: SEED.ada.email, password: SEED_PASSWORD })
			.catch((e: unknown) => e);
		const challengeId = (error as { challengeId: string }).challengeId;

		await expect(
			h.deps.verifyMfaChallenge(challengeId, first, 'recovery_code')
		).resolves.toMatchObject({ subject_id: SEED.ada.id });

		// Spent. A recovery code that worked twice would be a password.
		await h.deps.fetchLogout();
		const second = await h.deps
			.login({ email: SEED.ada.email, password: SEED_PASSWORD })
			.catch((e: unknown) => e);
		await expect(
			h.deps.verifyMfaChallenge(
				(second as { challengeId: string }).challengeId,
				first,
				'recovery_code'
			)
		).rejects.toMatchObject({ code: 'invalid_credentials' });
	});

	it('reissues recovery codes, replacing the old set', async () => {
		await signInAsAda();
		const start = await h.deps.beginMfaEnrolment();
		const first = await h.deps.confirmMfaEnrolment(
			start.enrolmentId,
			generateTotp(start.secret, SEED.ada.email)
		);

		const second = await h.deps.regenerateRecoveryCodes();

		expect(second.recoveryCodes.length).toBeGreaterThan(0);
		expect(second.recoveryCodes, 'reissuing returned the same codes').not.toEqual(
			first.recoveryCodes
		);
	});

	it('turns the authenticator off, and drops the codes with it', async () => {
		await signInAsAda();
		const start = await h.deps.beginMfaEnrolment();
		await h.deps.confirmMfaEnrolment(
			start.enrolmentId,
			generateTotp(start.secret, SEED.ada.email)
		);

		await h.deps.disableMfa();

		const account = await h.deps.fetchAccount();
		expect(account.mfaEnabled).toBe(false);

		// Signing in no longer asks for a factor that no longer exists.
		await h.deps.fetchLogout();
		await expect(
			h.deps.login({ email: SEED.ada.email, password: SEED_PASSWORD })
		).resolves.toMatchObject({ subject_id: SEED.ada.id });
	});
});
