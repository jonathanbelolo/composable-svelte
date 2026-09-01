/**
 * Forgot-password and reset-password.
 *
 * Two assertions carry this file.
 *
 * **The oracle.** `requestPasswordReset` resolves whether or not the address
 * has an account, and the flow reaches the same state either way. That is not a
 * nicety: a version that distinguished them would be an account checker with a
 * friendly face, and it is the kind of thing a well-meaning change adds back
 * ("surely we should tell them the address is wrong?"). The arm below is what
 * makes that change fail.
 *
 * **The absent guard.** Reset deliberately does *not* copy email verification's
 * two single-use-token guards, because it exchanges on submit rather than on
 * mount — there is no effect to re-fire. What it needs instead is the fixed
 * cancellation id every form flow has, so a double-click supersedes rather than
 * spending the token twice.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	forgotPasswordReducer,
	createInitialForgotPasswordState,
	resetPasswordReducer,
	createInitialResetPasswordState,
	resetPasswordSchema,
	meetsPasswordCriteria,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH,
	type ForgotPasswordDependencies,
	type ForgotPasswordState,
	type ResetPasswordDependencies,
	type ResetPasswordState
} from '../src/lib/flows/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/index.js';

const session: SessionSnapshot = {
	subject_id: '44444444-5555-6666-7777-888888888888',
	display_name: 'Ada',
	roles: ['member']
};

const GOOD = 'correct-horse-battery';
const EXPIRED: AuthError = { code: 'token_expired', message: 'That link is no longer valid.' };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// ============================================================
// Forgot password
// ============================================================

function forgotStore(deps: ForgotPasswordDependencies, initial?: Partial<ForgotPasswordState>) {
	return createTestStore({
		initialState: { ...createInitialForgotPasswordState(), ...initial },
		reducer: forgotPasswordReducer,
		dependencies: deps
	});
}

async function requestFor(store: ReturnType<typeof forgotStore>, email: string) {
	await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
}

describe('asking for a reset link', () => {
	it('says the same thing for an address that exists and one that does not', async () => {
		// The oracle arm. The dependency cannot distinguish them — that is the
		// contract — and the flow must not invent a distinction either. If this
		// ever fails, the form has become an account checker.
		const requestPasswordReset = vi.fn(async () => undefined);

		for (const email of ['real@example.com', 'nobody@example.com']) {
			const store = forgotStore({ requestPasswordReset });

			await requestFor(store, email);
			await store.receive({ type: 'form' }); // submissionStarted
			await store.receive({ type: 'form' }); // submissionSucceeded
			await store.receive({ type: 'requestSent' }, (state) => {
				expect(state.status, `differed for ${email}`).toBe('sent');
				expect(state.error).toBeNull();
				expect(state.requestedFor).toBe(email);
			});

			store.assertNoPendingActions();
		}

		expect(requestPasswordReset).toHaveBeenCalledTimes(2);
	});

	it('leaves the form usable, because success is not terminal', async () => {
		// Signup replaces itself with a panel; this cannot. The message is
		// conditional — "if that address has an account" — so a user who mistyped
		// needs the form still there to try another.
		const store = forgotStore({ requestPasswordReset: vi.fn(async () => undefined) });

		await requestFor(store, 'typo@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'requestSent' }, (state) => {
			expect(state.status).toBe('sent');
			expect(state.form.data.email, 'the field was cleared out from under them').toBe(
				'typo@example.com'
			);
		});

		// Correcting it and asking again works, and names the new address.
		await requestFor(store, 'right@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'requestSent' }, (state) => {
			expect(state.requestedFor).toBe('right@example.com');
		});
	});

	it('never names an address from a previous attempt', async () => {
		// A confirmation that repeats back a stale address sends someone to check
		// the wrong inbox.
		const gate = deferred<void>();
		const store = forgotStore({
			requestPasswordReset: vi
				.fn<ForgotPasswordDependencies['requestPasswordReset']>()
				.mockResolvedValueOnce(undefined)
				.mockImplementationOnce(async () => gate.promise)
		});

		await requestFor(store, 'first@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'requestSent' });

		await requestFor(store, 'second@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' }, (state) => {
			expect(state.status).toBe('submitting');
			expect(state.requestedFor, 'a stale address survived into a new attempt').toBeNull();
		});

		gate.resolve();
		await store.receive({ type: 'requestSent' }, (state) => {
			expect(state.requestedFor).toBe('second@example.com');
		});
		store.assertNoPendingActions();
	});

	it('does not reach the network for an address that is not one', async () => {
		const requestPasswordReset = vi.fn();
		const store = forgotStore({ requestPasswordReset } as unknown as ForgotPasswordDependencies);

		await requestFor(store, 'not-an-address');

		expect(requestPasswordReset).not.toHaveBeenCalled();
		expect(store.state.form.fields.email.error).toBe('Enter a valid email address');
		store.assertNoPendingActions();
	});

	it('surfaces a rate limit rather than claiming the mail was sent', async () => {
		// The one failure this endpoint reliably produces, and the one case where
		// "we sent a link" would be a lie.
		const store = forgotStore({
			requestPasswordReset: vi.fn(async () => {
				throw { code: 'rate_limited', message: 'Too many requests.' } satisfies AuthError;
			})
		});

		await requestFor(store, 'ada@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'requestFailed' }, (state) => {
			expect(state.status, 'a failed request was reported as sent').toBe('idle');
			expect(state.error?.code).toBe('rate_limited');
			expect(state.requestedFor).toBeNull();
		});
	});
});

// ============================================================
// Reset password
// ============================================================

function resetStore(deps: ResetPasswordDependencies, initial?: Partial<ResetPasswordState>) {
	return createTestStore({
		initialState: { ...createInitialResetPasswordState('tok_1'), ...initial },
		reducer: resetPasswordReducer,
		dependencies: deps
	});
}

async function submitReset(
	store: ReturnType<typeof resetStore>,
	password = GOOD,
	confirmPassword = password
) {
	for (const [field, value] of [
		['password', password],
		['confirmPassword', confirmPassword]
	] as const) {
		await store.send({ type: 'form', action: { type: 'fieldChanged', field, value } });
	}
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' });
	await store.receive({ type: 'form' });
}

describe('setting a new password', () => {
	it('signs in when the backend issues a session', async () => {
		const resetPassword: ResetPasswordDependencies['resetPassword'] = vi.fn(async () => session);
		const store = resetStore({ resetPassword });

		await submitReset(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'resetSucceeded' }, (state) => {
			expect(state.status).toBe('reset');
			expect(state.session).toEqual(session);
		});

		expect(resetPassword).toHaveBeenCalledWith('tok_1', GOOD, expect.anything());
		store.assertNoPendingActions();
	});

	it('is still a success when it issues none', async () => {
		// The password is changed either way; the user just signs in with it.
		// Treating a null session as a failure would leave them staring at a form
		// whose job is done.
		const store = resetStore({ resetPassword: vi.fn(async () => null) });

		await submitReset(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'resetSucceeded' }, (state) => {
			expect(state.status).toBe('reset');
			expect(state.session).toBeNull();
			expect(state.error).toBeNull();
		});
	});

	it('refuses to call the backend with no token', async () => {
		// Valid fields and no token is not the user's mistake and not fixable
		// from this form. Sending "" would come back as a confusing
		// `token_expired` from the server instead of a clear one from here.
		const resetPassword = vi.fn();
		const store = createTestStore({
			initialState: createInitialResetPasswordState(null),
			reducer: resetPasswordReducer,
			dependencies: { resetPassword } as unknown as ResetPasswordDependencies
		});

		await submitReset(store);
		await store.receive({ type: 'form' }, (state) => {
			expect(state.error?.code).toBe('token_expired');
			expect(state.status, 'it went on as if it had a token').toBe('idle');
		});

		expect(resetPassword).not.toHaveBeenCalled();
	});

	it('accepts a token provided after the store was built', async () => {
		const resetPassword: ResetPasswordDependencies['resetPassword'] = vi.fn(async () => null);
		const store = createTestStore({
			initialState: createInitialResetPasswordState(null),
			reducer: resetPasswordReducer,
			dependencies: { resetPassword }
		});

		await store.send({ type: 'tokenProvided', token: 'late' }, (state) => {
			expect(state.token).toBe('late');
		});

		await submitReset(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'resetSucceeded' });

		expect(resetPassword).toHaveBeenCalledWith('late', GOOD, expect.anything());
	});

	it('does not reach the network when the passwords differ', async () => {
		const resetPassword = vi.fn();
		const store = resetStore({ resetPassword } as unknown as ResetPasswordDependencies);

		await submitReset(store, GOOD, 'something-else-entirely');

		expect(resetPassword).not.toHaveBeenCalled();
		expect(store.state.form.fields.confirmPassword.error).toBe('Passwords do not match');
	});

	it('spends the token once when submitted twice', async () => {
		// The fixed cancellation id, which is the whole of the single-use
		// protection this flow needs — there is no mount effect to re-fire, so
		// verification's extra guards would be answering a question nobody asked.
		const first = deferred<SessionSnapshot | null>();
		const second = deferred<SessionSnapshot | null>();
		let calls = 0;
		const resetPassword: ResetPasswordDependencies['resetPassword'] = vi.fn(async () => {
			calls += 1;
			return calls === 1 ? first.promise : second.promise;
		});
		const store = resetStore({ resetPassword });

		await submitReset(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		// The superseded one resolves late and must not land.
		first.resolve({ subject_id: 'superseded' });
		second.resolve(session);

		await store.receive({ type: 'resetSucceeded' }, (state) => {
			expect(state.session?.subject_id, 'the superseded reset landed').toBe(session.subject_id);
		});
		store.assertNoPendingActions();
	});

	it('keeps `token_expired` branchable, because the recovery differs', async () => {
		// A retry cannot fix it; only a new link can. That is why the code
		// survives rather than being flattened to a sentence.
		const store = resetStore({
			resetPassword: vi.fn(async () => {
				throw EXPIRED;
			})
		});

		await submitReset(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'resetFailed' }, (state) => {
			expect(state.error?.code).toBe('token_expired');
			expect(state.status).toBe('idle');
		});
	});
});

describe('the password policy, shared', () => {
	it('is the same one signup enforces', async () => {
		// Both schemas build their password field from `passwordField()`, so a
		// user cannot be told one thing creating an account and another
		// recovering it. This asserts the reset schema and the one checklist
		// agree on every sample, exactly as the signup test does.
		const samples = [
			'',
			'short',
			'a'.repeat(PASSWORD_MIN_LENGTH - 1),
			'a'.repeat(PASSWORD_MIN_LENGTH),
			'a'.repeat(PASSWORD_MAX_LENGTH),
			'a'.repeat(PASSWORD_MAX_LENGTH + 1),
			GOOD
		];

		for (const password of samples) {
			const accepted = resetPasswordSchema.safeParse({
				password,
				confirmPassword: password
			}).success;

			expect(meetsPasswordCriteria(password), `disagreed on ${JSON.stringify(password)}`).toBe(
				accepted
			);
		}
	});
});
