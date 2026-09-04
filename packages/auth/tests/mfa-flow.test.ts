/**
 * The two MFA flows.
 *
 * The arm this file exists for is `carries the challenge id from the failed
 * login into the request`. `mfa_required` has held a `challengeId` since the
 * `AuthError` union was created — described in its own doc comment as "the
 * reason this union exists at all" — and until now **nothing read it**. It was
 * validated on arrival, carried through the login reducer, and rendered as a
 * sentence. That test is the first thing anywhere to prove the id survives the
 * journey it was added for.
 *
 * The other one worth naming: enrolment refuses a second start. A repeat does
 * not merely waste a request, it issues a new secret and silently invalidates
 * the one the user is at that moment typing into their phone.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	mfaChallengeReducer,
	createInitialMfaChallengeState,
	mfaEnrolmentReducer,
	createInitialMfaEnrolmentState,
	mfaCodeSchema,
	loginReducer,
	createInitialLoginState,
	type MfaChallengeDependencies,
	type MfaChallengeState,
	type MfaEnrolmentDependencies,
	type MfaEnrolmentState,
	type LoginDependencies
} from '../src/lib/flows/index.js';
import { isMfaRequired } from '../src/lib/errors/index.js';
import type { AuthError } from '../src/lib/errors/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';

const session: SessionSnapshot = {
	subject_id: '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
	display_name: 'Ada',
	roles: ['member']
};

const EXPIRED: AuthError = { code: 'token_expired', message: 'That attempt has expired.' };
const WRONG: AuthError = { code: 'invalid_credentials', message: 'That code is not right.' };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// ============================================================
// Challenge
// ============================================================

function challengeStore(
	deps: MfaChallengeDependencies,
	initial?: Partial<MfaChallengeState>
) {
	return createTestStore({
		initialState: {
			...createInitialMfaChallengeState('chal_1', ['totp', 'recovery_code']),
			...initial
		},
		reducer: mfaChallengeReducer,
		dependencies: deps
	});
}

async function submitCode(store: ReturnType<typeof challengeStore>, code = '123456') {
	await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: code } });
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
}

describe('satisfying a challenge', () => {
	it('carries the challenge id from the failed login into the request', async () => {
		// The whole point of the union, finally exercised end to end. A login
		// fails with `mfa_required`; the id it carried has to reach the verify
		// call unchanged. Nothing has ever asserted this — the id was validated
		// on arrival and then only ever displayed.
		const login: LoginDependencies['login'] = vi.fn(async () => {
			throw {
				code: 'mfa_required',
				message: 'Enter the code from your authenticator app.',
				challengeId: 'chal_from_login',
				methods: ['totp', 'recovery_code']
			} satisfies AuthError;
		});
		const loginStore = createTestStore({
			initialState: createInitialLoginState(),
			reducer: loginReducer,
			dependencies: { login }
		});

		for (const [field, value] of [
			['email', 'ada@example.com'],
			['password', 'hunter2']
		] as const) {
			await loginStore.send({ type: 'form', action: { type: 'fieldChanged', field, value } });
		}
		await loginStore.send({ type: 'form', action: { type: 'submitTriggered' } });
		await loginStore.receive({ type: 'form' });
		await loginStore.receive({ type: 'form' });
		await loginStore.receive({ type: 'form' });
		await loginStore.receive({ type: 'form' });

		let carried: { challengeId: string; methods: readonly ('totp' | 'recovery_code')[] } | null =
			null;
		await loginStore.receive({ type: 'loginFailed' }, (state) => {
			// `isMfaRequired` gets its first production-shaped use here: it is what
			// a surface narrows with before it can read `challengeId` at all.
			const error = state.error;
			expect(isMfaRequired(error)).toBe(true);
			if (isMfaRequired(error)) {
				carried = { challengeId: error.challengeId, methods: error.methods };
			}
		});

		expect(carried, 'the login never surfaced a usable challenge').not.toBeNull();

		// Hand it over exactly as `LoginForm`'s `onMfaRequired` does.
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => session
		);
		const store = challengeStore({ verifyMfaChallenge }, { challengeId: null, methods: ['totp'] });

		await store.send({
			type: 'challengeProvided',
			challengeId: carried!.challengeId,
			methods: carried!.methods
		});
		await submitCode(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'challengeSucceeded' }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session).toEqual(session);
		});

		expect(verifyMfaChallenge).toHaveBeenCalledWith(
			'chal_from_login',
			'123456',
			'totp',
			expect.anything()
		);
		store.assertNoPendingActions();
	});

	it('trims a pasted code', async () => {
		// Codes arrive from mail clients and password managers with whitespace far
		// more often than not, and "that code is not right" for a trailing space is
		// a miserable thing to debug.
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => session
		);
		const store = challengeStore({ verifyMfaChallenge });

		await submitCode(store, '  123456 ');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'challengeSucceeded' });

		expect(verifyMfaChallenge).toHaveBeenCalledWith(
			'chal_1',
			'123456',
			'totp',
			expect.anything()
		);
	});

	it('accepts any shape of code the backend might use', async () => {
		// Deliberately lax. TOTP is usually six digits and sometimes eight;
		// recovery codes are a different shape entirely. A `/^\\d{6}$/` rule would
		// reject valid backends, so only the backend judges.
		for (const code of ['123456', '12345678', 'abcd-efgh-ijkl', 'X7']) {
			expect(mfaCodeSchema.safeParse({ code }).success, `refused ${code}`).toBe(true);
		}
		expect(mfaCodeSchema.safeParse({ code: '   ' }).success, 'accepted whitespace').toBe(false);
	});

	it('switching to a recovery code changes the method, not just the field', async () => {
		// It is a different request, not a differently-labelled box.
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => session
		);
		const store = challengeStore({ verifyMfaChallenge });

		await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '999' } });
		await store.send({ type: 'methodChosen', method: 'recovery_code' }, (state) => {
			expect(state.method).toBe('recovery_code');
			expect(state.form.data.code, 'a half-typed authenticator code was left behind').toBe('');
		});

		await submitCode(store, 'abcd-efgh-ijkl');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'challengeSucceeded' });

		expect(verifyMfaChallenge).toHaveBeenCalledWith(
			'chal_1',
			'abcd-efgh-ijkl',
			'recovery_code',
			expect.anything()
		);
	});

	it('choosing the method already in use changes nothing', async () => {
		const store = challengeStore({
			verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge']
		});
		const before = store.state;

		await store.send({ type: 'methodChosen', method: 'totp' });

		expect(store.state, 'a no-op notified every subscriber').toBe(before);
	});

	it('prefers the authenticator when the account has both', () => {
		expect(createInitialMfaChallengeState('c', ['recovery_code', 'totp']).method).toBe('totp');
		expect(createInitialMfaChallengeState('c', ['recovery_code']).method).toBe('recovery_code');
	});

	it('refuses to verify with no challenge', async () => {
		// Reached directly, or after a reload that lost it. Sending an empty id
		// would come back as a confusing failure from the server rather than a
		// clear one from here.
		const verifyMfaChallenge = vi.fn();
		const store = challengeStore(
			{ verifyMfaChallenge } as unknown as MfaChallengeDependencies,
			{ challengeId: null }
		);

		await submitCode(store);
		await store.receive({ type: 'form' }, (state) => {
			expect(state.error?.code).toBe('token_expired');
			expect(state.status).toBe('idle');
		});

		expect(verifyMfaChallenge).not.toHaveBeenCalled();
	});

	it('keeps a wrong code and an expired challenge apart', async () => {
		// The two differ in what a surface should do: retry, or start over. That
		// is the entire reason no new union arm was added — `invalid_credentials`
		// and `token_expired` already carry the distinction.
		const wrong = challengeStore({
			verifyMfaChallenge: vi.fn(async () => {
				throw WRONG;
			})
		});
		await submitCode(wrong);
		await wrong.receive({ type: 'form' });
		await wrong.receive({ type: 'form' });
		await wrong.receive({ type: 'challengeFailed' }, (state) => {
			expect(state.error?.code).toBe('invalid_credentials');
			expect(state.status, 'a retryable failure left the form unusable').toBe('idle');
		});

		const expired = challengeStore({
			verifyMfaChallenge: vi.fn(async () => {
				throw EXPIRED;
			})
		});
		await submitCode(expired);
		await expired.receive({ type: 'form' });
		await expired.receive({ type: 'form' });
		await expired.receive({ type: 'challengeFailed' }, (state) => {
			expect(state.error?.code).toBe('token_expired');
		});
	});

	it('a new challenge clears the last one’s failure', async () => {
		// A fresh sign-in attempt is not answerable for the previous one.
		const store = challengeStore(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{ error: WRONG }
		);

		await store.send(
			{ type: 'challengeProvided', challengeId: 'chal_2', methods: ['totp'] },
			(state) => {
				expect(state.challengeId).toBe('chal_2');
				expect(state.error, 'a stale failure survived a new challenge').toBeNull();
			}
		);
	});

	it('spends the code once when submitted twice', async () => {
		const first = deferred<SessionSnapshot>();
		const second = deferred<SessionSnapshot>();
		let calls = 0;
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(async () => {
			calls += 1;
			return calls === 1 ? first.promise : second.promise;
		});
		const store = challengeStore({ verifyMfaChallenge });

		await submitCode(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		for (let i = 0; i < 4; i++) await store.receive({ type: 'form' });

		first.resolve({ subject_id: 'superseded' });
		second.resolve(session);

		await store.receive({ type: 'challengeSucceeded' }, (state) => {
			expect(state.session?.subject_id, 'the superseded attempt landed').toBe(session.subject_id);
		});
		store.assertNoPendingActions();
	});
});

// ============================================================
// Enrolment
// ============================================================

function enrolmentStore(
	deps: Partial<MfaEnrolmentDependencies> = {},
	initial?: Partial<MfaEnrolmentState>
) {
	return createTestStore({
		initialState: { ...createInitialMfaEnrolmentState(), ...initial },
		reducer: mfaEnrolmentReducer,
		dependencies: {
			beginMfaEnrolment: vi.fn(async () => ({
				enrolmentId: 'enr_1',
				secret: 'JBSWY3DPEHPK3PXP',
				otpauthUri: 'otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP'
			})),
			confirmMfaEnrolment: vi.fn(async () => ({ recoveryCodes: ['aaa-111', 'bbb-222'] })),
			...deps
		}
	});
}

describe('enrolling an authenticator', () => {
	it('fetches a secret and offers it for manual entry', async () => {
		const store = enrolmentStore();

		await store.send({ type: 'enrolmentRequested' }, (state) => {
			expect(state.status).toBe('starting');
		});
		await store.receive({ type: 'enrolmentStarted' }, (state) => {
			expect(state.status).toBe('confirming');
			expect(state.secret).toBe('JBSWY3DPEHPK3PXP');
			expect(state.otpauthUri, 'nothing for an authenticator to scan').toContain('otpauth://');
			expect(state.enrolmentId).toBe('enr_1');
		});

		store.assertNoPendingActions();
	});

	it('refuses a second start, which would invalidate the secret on screen', async () => {
		// The guard `reset-password` deliberately does not have, and this flow
		// deliberately does. A repeat issues a new secret — silently breaking the
		// one the user is halfway through typing into their phone.
		const beginMfaEnrolment = vi.fn(async () => ({
			enrolmentId: 'enr_1',
			secret: 'JBSWY3DPEHPK3PXP',
			otpauthUri: 'otpauth://totp/x'
		}));
		const store = enrolmentStore({ beginMfaEnrolment });

		await store.send({ type: 'enrolmentRequested' });
		await store.receive({ type: 'enrolmentStarted' });

		await store.send({ type: 'enrolmentRequested' }, (state) => {
			expect(state.status, 'a second start was accepted').toBe('confirming');
		});

		expect(beginMfaEnrolment).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('allows a retry after the start fails', async () => {
		const beginMfaEnrolment = vi
			.fn<MfaEnrolmentDependencies['beginMfaEnrolment']>()
			.mockRejectedValueOnce({ code: 'rate_limited', message: 'Slow down.' })
			.mockResolvedValueOnce({
				enrolmentId: 'enr_2',
				secret: 'S',
				otpauthUri: 'otpauth://totp/x'
			});
		const store = enrolmentStore({ beginMfaEnrolment });

		await store.send({ type: 'enrolmentRequested' });
		await store.receive({ type: 'enrolmentStartFailed' }, (state) => {
			expect(state.status, 'a failed start left the flow unable to try again').toBe('idle');
			expect(state.error?.code).toBe('rate_limited');
		});

		await store.send({ type: 'enrolmentRequested' });
		await store.receive({ type: 'enrolmentStarted' }, (state) => {
			expect(state.enrolmentId).toBe('enr_2');
			expect(state.error).toBeNull();
		});
	});

	it('hands back recovery codes exactly once', async () => {
		const store = enrolmentStore();

		await store.send({ type: 'enrolmentRequested' });
		await store.receive({ type: 'enrolmentStarted' });

		await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'enrolmentConfirmed' }, (state) => {
			expect(state.status).toBe('enrolled');
			expect(state.recoveryCodes).toEqual(['aaa-111', 'bbb-222']);
		});

		store.assertNoPendingActions();
	});

	it('a mistyped confirmation keeps the secret rather than starting over', async () => {
		// Returning to `idle` would offer to start again and throw away an
		// enrolment that is one correct code from finishing — along with the
		// secret already sitting in the user's authenticator app.
		const store = enrolmentStore({
			confirmMfaEnrolment: vi.fn(async () => {
				throw WRONG;
			})
		});

		await store.send({ type: 'enrolmentRequested' });
		await store.receive({ type: 'enrolmentStarted' });

		await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '000000' } });
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		for (let i = 0; i < 4; i++) await store.receive({ type: 'form' });
		await store.receive({ type: 'enrolmentConfirmFailed' }, (state) => {
			expect(state.status, 'the secret was thrown away on a typo').toBe('confirming');
			expect(state.secret).toBe('JBSWY3DPEHPK3PXP');
			expect(state.error?.code).toBe('invalid_credentials');
			expect(state.recoveryCodes).toBeNull();
		});
	});

	it('does not confirm before there is an enrolment to confirm', async () => {
		// Unreachable through the component, which renders no form until
		// `confirming`. Guarded because the reducer is exported.
		const confirmMfaEnrolment = vi.fn();
		const store = enrolmentStore({
			confirmMfaEnrolment: confirmMfaEnrolment as unknown as MfaEnrolmentDependencies['confirmMfaEnrolment']
		});

		await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		expect(confirmMfaEnrolment).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});
});
