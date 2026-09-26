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
import { createStore } from '@composable-svelte/core';
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
	type MfaChallengeAction,
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
		const observed: string[] = [];
		const store = createTestStore({
			initialState: createInitialMfaChallengeState(null),
			reducer: (state: MfaChallengeState, action: MfaChallengeAction, dependencies: MfaChallengeDependencies) => {
				observed.push(action.type === 'form' ? action.action.type : action.type);
				return mfaChallengeReducer(state, action, dependencies);
			},
			dependencies: { verifyMfaChallenge } as unknown as MfaChallengeDependencies
		});

		await submitCode(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' }, (state) => {
			expect(state.error?.code).toBe('token_expired');
			expect(state.status).toBe('idle');
		});

		expect(verifyMfaChallenge).not.toHaveBeenCalled();
		await store.finish();
		store.assertNoPendingActions();
		// Match opaque validation metadata through the supported top-level API;
		// independently pin the semantic action sequence, including both terminals.
		expect(observed).toEqual([
			'fieldChanged', 'submitTriggered', 'formValidationStarted', 'formValidationCompleted',
			'submissionStarted', 'submissionSucceeded'
		]);
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
		const pending = deferred<SessionSnapshot>();
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => pending.promise
		);
		const store = challengeStore({ verifyMfaChallenge });

		await submitCode(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		store.assertNoPendingActions();
		expect(store.state.form.isSubmitting).toBe(false);
		expect(store.state.form.isValidating).toBe(false);

		pending.resolve(session);

		await store.receive({ type: 'challengeSucceeded' }, (state) => {
			expect(state.session?.subject_id).toBe(session.subject_id);
		});
		expect(verifyMfaChallenge).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('ignores submit after success and preserves session', async () => {
		const verifyMfaChallenge = vi.fn(async () => session);
		const store = challengeStore({ verifyMfaChallenge }, { status: 'succeeded', session });

		await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		store.assertNoPendingActions();
		expect(store.state.form.isSubmitting).toBe(false);
		expect(store.state.form.isValidating).toBe(false);

		expect(store.state.status).toBe('succeeded');
		expect(store.state.session).toEqual(session);
		expect(verifyMfaChallenge).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('a new challenge resets previous success, session, errors, and input', async () => {
		const store = challengeStore(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{
				status: 'succeeded',
				session,
				error: WRONG
			}
		);

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'code', value: '123456' }
		});

		await store.send(
			{ type: 'challengeProvided', challengeId: 'chal_2', methods: ['totp'] },
			(state) => {
				expect(state.challengeId).toBe('chal_2');
				expect(state.status).toBe('idle');
				expect(state.session).toBeNull();
				expect(state.error).toBeNull();
				expect(state.form.data.code).toBe('');
			}
		);
	});

	it('replaces a pending verification when a new challenge is provided', async () => {
		const first = deferred<SessionSnapshot>();
		const second = deferred<SessionSnapshot>();
		let calls = 0;
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(async () => {
			calls += 1;
			return calls === 1 ? first.promise : second.promise;
		});
		const store = challengeStore({ verifyMfaChallenge });

		await submitCode(store, '111111');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await store.send(
			{ type: 'challengeProvided', challengeId: 'chal_2', methods: ['totp'] },
			(state) => {
				expect(state.status).toBe('idle');
				expect(state.session).toBeNull();
				expect(state.challengeId).toBe('chal_2');
				expect(state.form.data.code).toBe('');
			}
		);

		first.resolve({ subject_id: 'stale_user', display_name: 'Stale', roles: [] });

		await submitCode(store, '222222');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		second.resolve(session);

		await store.receive({ type: 'challengeSucceeded' }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session?.subject_id).toBe(session.subject_id);
			expect(state.challengeId).toBe('chal_2');
		});
		expect(verifyMfaChallenge).toHaveBeenCalledTimes(2);
		expect(verifyMfaChallenge).toHaveBeenNthCalledWith(1, 'chal_1', '111111', 'totp', expect.anything());
		expect(verifyMfaChallenge).toHaveBeenNthCalledWith(2, 'chal_2', '222222', 'totp', expect.anything());
		store.assertNoPendingActions();
	});

	it('replaces a pending verification when the same challenge is provided again', async () => {
		const first = deferred<SessionSnapshot>();
		const second = deferred<SessionSnapshot>();
		let calls = 0;
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(async () => {
			calls += 1;
			return calls === 1 ? first.promise : second.promise;
		});
		const store = challengeStore({ verifyMfaChallenge });

		await submitCode(store, '111111');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await store.send(
			{ type: 'challengeProvided', challengeId: 'chal_1', methods: ['totp'] },
			(state) => {
				expect(state.status).toBe('idle');
				expect(state.session).toBeNull();
				expect(state.challengeId).toBe('chal_1');
				expect(state.form.data.code).toBe('');
			}
		);

		first.resolve({ subject_id: 'stale_user', display_name: 'Stale', roles: [] });

		await submitCode(store, '222222');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		second.resolve(session);

		await store.receive({ type: 'challengeSucceeded' }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session?.subject_id).toBe(session.subject_id);
			expect(state.challengeId).toBe('chal_1');
		});
		expect(verifyMfaChallenge).toHaveBeenCalledTimes(2);
		expect(verifyMfaChallenge).toHaveBeenNthCalledWith(1, 'chal_1', '111111', 'totp', expect.anything());
		expect(verifyMfaChallenge).toHaveBeenNthCalledWith(2, 'chal_1', '222222', 'totp', expect.anything());
		store.assertNoPendingActions();
	});

	it('does not let queued child-form work verify a replacement challenge', async () => {
		const verifyMfaChallenge = vi.fn(async () => session);
		const deps = { verifyMfaChallenge };
		const initial = createInitialMfaChallengeState('old');
		const [ready] = mfaChallengeReducer(
			initial,
			{ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '111111' } },
			deps
		);
		const [replacement] = mfaChallengeReducer(
			ready,
			{ type: 'challengeProvided', challengeId: 'new', methods: ['totp'] },
			deps
		);
		const staleSubmission: MfaChallengeAction = {
			type: 'form',
			action: { type: 'submissionSucceeded' },
			attempt: 0
		};
		const [after, next] = mfaChallengeReducer(replacement, staleSubmission, deps);
		expect(after).toBe(replacement);
		expect(next._tag).toBe('None');
		expect(verifyMfaChallenge).not.toHaveBeenCalled();
		expect(after.form.data.code).toBe('');
	});

	it('changing factor cancels verification and rejects its late result', async () => {
		const pending = deferred<SessionSnapshot>();
		const signals: AbortSignal[] = [];
		const store = challengeStore({
			verifyMfaChallenge: async (_id, _code, _method, signal) => {
				if (!signal) throw new Error('Expected cancellation signal');
				signals.push(signal);
				return pending.promise;
			}
		});
		await submitCode(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.send({ type: 'methodChosen', method: 'recovery_code' });
		expect(signals[0]!.aborted).toBe(true);
		pending.resolve(session);
		await store.finish();
		expect(store.state.status).toBe('idle');
		expect(store.state.session).toBeNull();
		expect(store.state.method).toBe('recovery_code');
	});

	it('accepts hand-dispatched legacy challengeSucceeded and challengeFailed while idle', async () => {
		const store = challengeStore(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{ status: 'idle' }
		);
		await store.send({ type: 'challengeSucceeded', session }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session).toEqual(session);
		});
		await store.send({ type: 'challengeFailed', error: WRONG }, (state) => {
			expect(state.status).toBe('idle');
			expect(state.error).toEqual(WRONG);
			expect(state.session).toBeNull();
		});
	});

	it('rejects correlated results with mismatched attempt or when not submitting', async () => {
		const store = challengeStore(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{ status: 'submitting', attempt: 2 }
		);
		await store.send({ type: 'challengeSucceeded', session, attempt: 1 }, (state) => {
			expect(state.session).toBeNull();
			expect(state.status).toBe('submitting');
		});
		await store.send({ type: 'challengeFailed', error: WRONG, attempt: 1 }, (state) => {
			expect(state.error).toBeNull();
			expect(state.status).toBe('submitting');
		});
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


// A replacement retires the queued child completion. The unreplaced control
// proves the same pipeline reaches the real verification dependency.
describe('production MFA child lifetime', () => {
	for (const replacement of ['challenge', 'factor', 'none'] as const) {
		it(`handles actual queued submissionSucceeded after ${replacement} replacement`, async () => {
			const verified = deferred<void>();
			const verifyMfaChallenge = vi.fn(async () => {
				verified.resolve();
				return session;
			});
			const store = createStore({
				initialState: createInitialMfaChallengeState('old', ['totp', 'recovery_code']),
				reducer: mfaChallengeReducer,
				dependencies: { verifyMfaChallenge },
				ssr: { deferEffects: false }
			});
			const delivered = deferred<void>();
			let replaced = false;
			// The public store notifies action subscribers after reducing, before
			// executing that action's effect. Replace at that exact handoff.
			const unsubscribe = store.subscribeToActions!(action => {
				if (action.type !== 'form') return;
				if (action.action.type === 'submissionStarted' && !replaced) {
					replaced = true;
					if (replacement === 'challenge') {
						store.dispatch({ type: 'challengeProvided', challengeId: 'new', methods: ['totp'] });
					}
					if (replacement === 'factor') {
						store.dispatch({ type: 'methodChosen', method: 'recovery_code' });
					}
				}
				if (action.action.type === 'submissionSucceeded') delivered.resolve();
			});
			try {
				store.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
				store.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
				await delivered.promise;
				expect(replaced).toBe(true);
				if (replacement === 'none') {
					await verified.promise;
					expect(verifyMfaChallenge).toHaveBeenCalledTimes(1);
					expect(verifyMfaChallenge).toHaveBeenCalledWith('old', '123456', 'totp', expect.anything());
				} else {
					expect(verifyMfaChallenge).not.toHaveBeenCalled();
					expect(store.state.status).toBe('idle');
					expect(store.state.session).toBeNull();
					expect(store.state.form.data.code).toBe('');
				}
			} finally {
				unsubscribe();
				store.destroy();
			}
		});
	}
});

for (const schedule of ['reentrant', 'microtask'] as const) {
	it(`overlapping child submits settle under ${schedule} scheduling`, async () => {
		const verifyMfaChallenge = vi.fn(async () => session);
		const store = createStore({
			initialState: createInitialMfaChallengeState('challenge'),
			reducer: mfaChallengeReducer,
			dependencies: { verifyMfaChallenge },
			ssr: { deferEffects: false }
		});
		let overlapped = false;
		const unsubscribe = store.subscribeToActions!(action => {
			if (action.type === 'form' && action.action.type === 'submissionStarted' && !overlapped) {
				overlapped = true;
				const submit = () => store.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
				if (schedule === 'microtask') queueMicrotask(submit);
				else submit();
			}
		});
		try {
			store.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
			store.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(overlapped).toBe(true);
			expect(verifyMfaChallenge).toHaveBeenCalledTimes(1);
			expect(store.state.form.isSubmitting).toBe(false);
			expect(store.state.form.isValidating).toBe(false);
		} finally {
			unsubscribe();
			store.destroy();
		}
	});
}

it('choosing another factor clears a succeeded local result and starts a fresh attempt', () => {
	const initial = { ...createInitialMfaChallengeState('challenge', ['totp', 'recovery_code']), status: 'succeeded' as const, session };
	initial.form = { ...initial.form, data: { code: '123456' } };
	const [next, effect] = mfaChallengeReducer(initial, { type: 'methodChosen', method: 'recovery_code' }, { verifyMfaChallenge: vi.fn() });
	expect(next.status).toBe('idle');
	expect(next.session).toBeNull();
	expect(next.form.data.code).toBe('');
	expect(next.attempt).toBe((initial.attempt ?? 0) + 1);
	expect(effect).toMatchObject({ _tag: 'Batch', effects: expect.arrayContaining([expect.objectContaining({ _tag: 'Cancellable', cancelOnly: true, id: 'auth/flows/mfa-challenge' })]) });
});

for (const status of ['idle', 'succeeded'] as const) {
	it(`matching generation cannot deliver a terminal result while ${status}`, () => {
		const initial = { ...createInitialMfaChallengeState('challenge'), status, attempt: 2, session: status === 'succeeded' ? session : null };
		const action: MfaChallengeAction = status === 'idle'
			? { type: 'challengeFailed', error: WRONG, attempt: 2 }
			: { type: 'challengeSucceeded', session: { ...session, display_name: 'stale' }, attempt: 2 };
		const [next, effect] = mfaChallengeReducer(initial, action, { verifyMfaChallenge: vi.fn() });
		expect(next).toBe(initial);
		expect(effect._tag).toBe('None');
	});
}

it('errorDismissed clears only the error and is a same-reference no-op when already clear', () => {
	const initial = { ...createInitialMfaChallengeState('challenge'), error: WRONG };
	const deps = { verifyMfaChallenge: vi.fn() };
	const [cleared] = mfaChallengeReducer(initial, { type: 'errorDismissed' }, deps);
	expect(cleared.error).toBeNull();
	expect(cleared.form).toBe(initial.form);
	const [unchanged, effect] = mfaChallengeReducer(cleared, { type: 'errorDismissed' }, deps);
	expect(unchanged).toBe(cleared);
	expect(effect._tag).toBe('None');
});

it('cancelling one challenge store leaves another store verification live', async () => {
	const first = deferred<SessionSnapshot>();
	const second = deferred<SessionSnapshot>();
	const signals: AbortSignal[] = [];
	const make = (result: Promise<SessionSnapshot>) => createStore({
		initialState: createInitialMfaChallengeState('challenge', ['totp', 'recovery_code']),
		reducer: mfaChallengeReducer,
		dependencies: { verifyMfaChallenge: vi.fn(async (_id: string, _code: string, _method: string, signal?: AbortSignal) => {
			if (!signal) throw new Error('Missing verification cancellation signal');
			signals.push(signal);
			return result;
		}) },
		ssr: { deferEffects: false }
	});
	const a = make(first.promise);
	const b = make(second.promise);
	try {
		for (const store of [a, b]) {
			store.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '123456' } });
			store.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
		}
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(signals).toHaveLength(2);
		a.dispatch({ type: 'methodChosen', method: 'recovery_code' });
		expect(signals[0]!.aborted).toBe(true);
		expect(signals[1]!.aborted).toBe(false);
		second.resolve(session);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(b.state.status).toBe('succeeded');
	} finally {
		a.destroy();
		b.destroy();
	}
});

it('the MFA form hands off completion without outstanding validation or post-submit effects', async () => {
	const { createFormReducer } = await import('@composable-svelte/core/components/form');
	const { mfaChallengeFormConfig } = await import('../src/lib/flows/mfa-challenge/reducer.js');
	expect(mfaChallengeFormConfig.asyncValidators).toBeUndefined();
	const form = createInitialMfaChallengeState('challenge').form;
	const [next, effect] = createFormReducer(mfaChallengeFormConfig)(
		{ ...form, isSubmitting: true }, { type: 'submissionSucceeded' }, {}
	);
	expect(next.isSubmitting).toBe(false);
	expect(effect._tag).toBe('None');
});

it('verification handoff does not retire current-lifetime field work before its effect starts', async () => {
  const pending = deferred<SessionSnapshot>();
  const verifyMfaChallenge = vi.fn(() => pending.promise);
  const initial = createInitialMfaChallengeState('challenge');
  initial.form = {
    ...initial.form,
    isSubmitting: true,
    data: { code: '123456' },
    fields: { code: { error: null, warnings: [], touched: true, dirty: true, isValidating: false } }
  };
  const store = createStore({ initialState: initial, reducer: mfaChallengeReducer, dependencies: { verifyMfaChallenge }, ssr: { deferEffects: false } });
  let handedOff = false;
  const unsubscribe = store.subscribeToActions!(action => {
    if (action.type === 'form' && action.action.type === 'fieldValidationStarted' && !handedOff) {
      handedOff = true;
      store.dispatch({ type: 'form', action: { type: 'submissionSucceeded' } });
    }
  });
  try {
    store.dispatch({ type: 'form', action: { type: 'fieldValidationStarted', field: 'code' } });
    expect(handedOff).toBe(true);
    expect(store.state.status).toBe('submitting');
    await expect.poll(() => store.state.form.fields.code!.isValidating).toBe(false);
    expect(verifyMfaChallenge).toHaveBeenCalledTimes(1);
    pending.resolve(session);
    await expect.poll(() => store.state.status).toBe('succeeded');
  } finally { unsubscribe(); store.destroy(); }
});

it('does not verify a child submission terminal that the form reducer rejected', () => {
  const initial = createInitialMfaChallengeState('challenge');
  initial.form = { ...initial.form, isSubmitting: true, submissionId: 2, data: { code: '123456' } };
  const verifyMfaChallenge = vi.fn(async () => session);
  const [next, effect] = mfaChallengeReducer(initial, {
    type: 'form', generation: 0, action: { type: 'submissionSucceeded', submissionId: 1 }
  }, { verifyMfaChallenge });
  expect(next.form).toBe(initial.form);
  expect(next.status).toBe('idle');
  expect(effect._tag).toBe('None');
  expect(verifyMfaChallenge).not.toHaveBeenCalled();
});

it('does not start verification on hand-authored submissionSucceeded when child form is not submitting', () => {
  const verifyMfaChallenge = vi.fn(async () => session);
  const initial = createInitialMfaChallengeState('challenge');
  initial.form = { ...initial.form, data: { code: '123456' }, isSubmitting: false };
  const [next, effect] = mfaChallengeReducer(
    initial,
    { type: 'form', action: { type: 'submissionSucceeded' } },
    { verifyMfaChallenge }
  );
  expect(next.status).toBe('idle');
  expect(effect._tag).toBe('None');
  expect(verifyMfaChallenge).not.toHaveBeenCalled();
});

it('replacing a challenge drops a captured new-generation form completion', async () => {
  const deps = { verifyMfaChallenge: vi.fn(async () => session) };
  const [started, effect] = mfaChallengeReducer(createInitialMfaChallengeState('old'), {
    type: 'form', action: { type: 'fieldValidationStarted', field: 'code' }
  }, deps);
  const queued: MfaChallengeAction[] = [];
  if (effect._tag !== 'Cancellable') throw new Error('Expected field validation');
  await effect.execute(action => queued.push(action), new AbortController().signal);
  expect(queued[0]).toMatchObject({ type: 'form', generation: 0 });
  const [replaced] = mfaChallengeReducer(started, { type: 'challengeProvided', challengeId: 'new', methods: ['totp'] }, deps);
  const [next, ignored] = mfaChallengeReducer(replaced, queued[0]!, deps);
  expect(next).toBe(replaced);
  expect(ignored._tag).toBe('None');
  expect(replaced.formGeneration).toBe(1);
});

it('G13 empty challenge is represented as absent and cannot start verification', () => {
  const deps = { verifyMfaChallenge: vi.fn(async () => session) };
  const initial = createInitialMfaChallengeState('');
  expect(initial.challengeId).toBeNull();
  const [provided] = mfaChallengeReducer(createInitialMfaChallengeState('old'), { type: 'challengeProvided', challengeId: '', methods: ['totp'] }, deps);
  expect(provided.challengeId).toBeNull();
  provided.form = { ...provided.form, isSubmitting: true, data: { code: '123456' } };
  const [next, effect] = mfaChallengeReducer(provided, { type: 'form', action: { type: 'submissionSucceeded' } }, deps);
  expect(next.error?.code).toBe('token_expired');
  expect(next.status).toBe('idle');
  expect(effect._tag).toBe('None');
  expect(deps.verifyMfaChallenge).not.toHaveBeenCalled();
});

it('G13 empty method lists use the same explicit TOTP fallback as the HTTP adapter', () => {
  const initial = createInitialMfaChallengeState('challenge', []);
  expect(initial.methods).toEqual(['totp']);
  expect(initial.method).toBe('totp');
  const [next] = mfaChallengeReducer(initial, { type: 'challengeProvided', challengeId: 'new', methods: [] }, { verifyMfaChallenge: vi.fn() });
  expect(next.methods).toEqual(['totp']);
  expect(next.methods).toContain(next.method);
});

it('G13 selecting an unadvertised factor does not replace or cancel the live attempt', () => {
  const initial = { ...createInitialMfaChallengeState('challenge', ['totp']), status: 'submitting' as const, attempt: 4 };
  const [next, effect] = mfaChallengeReducer(initial, { type: 'methodChosen', method: 'recovery_code' }, { verifyMfaChallenge: vi.fn() });
  expect(next).toBe(initial);
  expect(effect._tag).toBe('None');
});

describe('Opus3 MFA lifetime and terminal boundaries', () => {
  it('keeps legacy form correlation tied to form lifetime across request handoff', () => {
    const initial = createInitialMfaChallengeState('challenge');
    initial.attempt = 8;
    initial.formGeneration = 3;
    initial.form = { ...initial.form, fields: { code: { error: null, warnings: [], touched: false, dirty: false, isValidating: true } } };
    const [next] = mfaChallengeReducer(initial, { type: 'form', attempt: 3, action: { type: 'fieldValidationCompleted', field: 'code', error: null } }, { verifyMfaChallenge: vi.fn() });
    expect(next.form.fields.code!.isValidating).toBe(false);
  });
  for (const status of ['submitting', 'succeeded'] as const) {
    it(`settles a legacy child terminal without another request while ${status}`, () => {
      const initial = { ...createInitialMfaChallengeState('challenge'), status, attempt: 7, session };
      initial.form = { ...initial.form, isSubmitting: true, data: { code: '123456' } };
      const [next, effect] = mfaChallengeReducer(initial, { type: 'form', action: { type: 'submissionSucceeded' } }, { verifyMfaChallenge: vi.fn() });
      expect(next.attempt).toBe(7);
      expect(next.session).toBe(session);
      expect(next.form.isSubmitting).toBe(false);
      expect(effect._tag).toBe('None');
    });
  }
  it('rejects empty challenge in manually supplied public state', () => {
    const initial = { ...createInitialMfaChallengeState('challenge'), challengeId: '' };
    initial.form = { ...initial.form, isSubmitting: true, data: { code: '123456' } };
    const [next, effect] = mfaChallengeReducer(initial, { type: 'form', action: { type: 'submissionSucceeded' } }, { verifyMfaChallenge: vi.fn() });
    expect(next.error?.code).toBe('token_expired');
    expect(effect._tag).toBe('None');
  });
  for (const action of [{ type: 'challengeProvided', challengeId: 'new', methods: ['totp'] }, { type: 'methodChosen', method: 'recovery_code' }] as const) {
    it(`uses child reset contract for ${action.type}`, () => {
      const initial = createInitialMfaChallengeState('challenge', ['totp', 'recovery_code']);
      initial.form = { ...initial.form, validationId: 6, submissionId: 9, fieldValidationSequence: 12, fields: { code: { error: null, warnings: [], touched: false, dirty: false, isValidating: true } } };
      const [next, effect] = mfaChallengeReducer(initial, action, { verifyMfaChallenge: vi.fn() });
      expect(next.form.validationId).toBe(7);
      expect(next.form.submissionId).toBe(10);
      expect(next.form.fieldValidationSequence).toBe(12);
      const ids: string[] = [];
      const collect = (e: typeof effect): void => { if (e._tag === 'Cancellable' && e.cancelOnly) ids.push(e.id); if (e._tag === 'Batch') e.effects.forEach(collect); };
      collect(effect);
      expect(ids).toEqual(expect.arrayContaining(['validate-form', 'submit-form', 'validate-code', 'auth/flows/mfa-challenge']));
    });
  }
});
