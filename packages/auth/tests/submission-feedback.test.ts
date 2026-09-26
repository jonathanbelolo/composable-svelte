/**
 * The seven form-backed siblings of the sign-in flow act only on a submission
 * result that completes a submission in flight.
 *
 * Each of these flows starts its dependency request on the form's
 * `submissionSucceeded`. Independent review 2 reproduced, for every one of
 * them, a stamped `submissionSucceeded` that core's form reducer refused —
 * nothing was submitting — still starting the request with whatever the fields
 * held. `login-flow.test.ts` and `mfa-flow.test.ts` pin the same rule for the
 * two flows that already had it.
 *
 * One contract, run per flow, plus what differs:
 * - reset-password refuses a missing token only for a submission it accepted;
 * - MFA enrolment also refuses outside `confirming`/`submitting`, because a
 *   second confirmation after `enrolled` could take the recovery codes — shown
 *   once — off the screen.
 *
 * Every negative has a positive control through the same store or state.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { createStore, type Effect, type Reducer } from '@composable-svelte/core';
import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import {
	signupReducer,
	createInitialSignupState,
	forgotPasswordReducer,
	createInitialForgotPasswordState,
	resetPasswordReducer,
	createInitialResetPasswordState,
	changeEmailReducer,
	createInitialChangeEmailState,
	magicLinkRequestReducer,
	createInitialMagicLinkRequestState,
	mfaEnrolmentReducer,
	createInitialMfaEnrolmentState,
	changePasswordReducer,
	createInitialChangePasswordState,
	type SignupAction,
	type SignupDependencies,
	type SignupFields,
	type SignupState,
	type ForgotPasswordAction,
	type ForgotPasswordDependencies,
	type ForgotPasswordFields,
	type ForgotPasswordState,
	type ResetPasswordAction,
	type ResetPasswordDependencies,
	type ResetPasswordFields,
	type ResetPasswordState,
	type ChangeEmailAction,
	type ChangeEmailDependencies,
	type ChangeEmailFields,
	type ChangeEmailState,
	type MagicLinkRequestAction,
	type MagicLinkRequestDependencies,
	type MagicLinkFields,
	type MagicLinkRequestState,
	type MfaEnrolmentAction,
	type MfaEnrolmentDependencies,
	type MfaCodeFields,
	type MfaEnrolmentState,
	type ChangePasswordAction,
	type ChangePasswordDependencies,
	type ChangePasswordFields,
	type ChangePasswordState
} from '../src/lib/flows/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

const PASSWORD = 'correct horse battery';

type Request = (...args: unknown[]) => Promise<unknown>;
type FlowState<F extends Record<string, unknown>> = { form: FormState<F>; status: string };

/** What one flow needs to run the shared contract. */
interface FlowCase<F extends Record<string, unknown>, S extends FlowState<F>, A, D> {
	flow: string;
	reducer: Reducer<S, A, D>;
	initial: () => S;
	/** Lifts a form action into the flow's action. */
	form: (action: FormAction<F>) => A;
	/** Field edits that make the form valid. */
	fields: readonly FormAction<F>[];
	/** Builds the flow's dependencies around the request under test. */
	deps: (request: Mock<Request>) => D;
	/** What the request resolves with. */
	result: unknown;
	/** The status the flow settles in once the request succeeds. */
	settled: S['status'];
	/** The request's arguments before its `AbortSignal`, for the valid fields. */
	requestArgs: readonly unknown[];
}

function fold<S, A, D>(reducer: Reducer<S, A, D>, state: S, actions: readonly A[], deps: D): S {
	return actions.reduce((current, action) => reducer(current, action, deps)[0], state);
}

function stamped<F extends Record<string, unknown>>(submissionId: number | undefined): FormAction<F> {
	return { type: 'submissionSucceeded', submissionId };
}

const started: FormAction<never> = { type: 'submissionStarted' };

/** Let queued effects and their dispatches drain. */
async function settleEffects(): Promise<void> {
	for (let turn = 0; turn < 4; turn++) await new Promise<void>((done) => setTimeout(done, 0));
}

function isNone<A>(effect: Effect<A>): boolean {
	return effect._tag === 'None';
}

function describeSubmissionFeedback<F extends Record<string, unknown>, S extends FlowState<F>, A, D>(
	c: FlowCase<F, S, A, D>
): void {
	const inert = (): D => c.deps(vi.fn<Request>(async () => c.result));
	const ready = (deps: D): S => fold(c.reducer, c.initial(), c.fields.map(c.form), deps);
	const start = (state: S, deps: D): S => c.reducer(state, c.form(started as FormAction<F>), deps)[0];

	describe(`${c.flow}: submission feedback`, () => {
		it('a stamped result while nothing is submitting starts no request; a genuine submission does, once, and its replay does not', async () => {
			const request = vi.fn<Request>(async () => c.result);
			const deps = c.deps(request);
			const seen: A[] = [];
			const store = createStore({
				initialState: ready(deps),
				reducer: (state: S, action: A, dependencies: D) => {
					seen.push(action);
					return c.reducer(state, action, dependencies);
				},
				dependencies: deps
			});
			const idle = store.state.status;
			expect(store.state.form.isSubmitting).toBe(false);

			store.dispatch(c.form(stamped(store.state.form.submissionId ?? 1)));
			await settleEffects();
			expect(request, 'a request for a result the form refused').not.toHaveBeenCalled();
			expect(store.state.status).toBe(idle);

			// Positive control: the same store, a genuine submission.
			const genuine = seen.length;
			store.dispatch(c.form({ type: 'submitTriggered' }));
			await vi.waitFor(() => expect(store.state.status).toBe(c.settled));
			expect(request).toHaveBeenCalledTimes(1);
			expect(request.mock.calls[0]!.slice(0, -1)).toEqual(c.requestArgs);

			// The real stamped result that started it, delivered again.
			const accepted = seen.slice(genuine).find(isSubmissionSucceeded);
			expect(accepted, 'the genuine submission never reported a result').toBeDefined();
			store.dispatch(accepted!);
			await settleEffects();
			expect(request, 'the replayed result started a second request').toHaveBeenCalledTimes(1);
			expect(store.state.status).toBe(c.settled);
			store.destroy();
		});

		it('refuses a submissionId a newer submission superseded, and accepts the current one', () => {
			const deps = inert();
			const first = start(ready(deps), deps);
			const firstId = first.form.submissionId!;
			const second = start(first, deps);
			expect(second.form.submissionId).toBe(firstId + 1);

			const [refused, refusedEffect] = c.reducer(second, c.form(stamped(firstId)), deps);
			expect(refused.form, 'the form refused it').toBe(second.form);
			expect(refused.status, 'the flow started a request for it').toBe(second.status);
			expect(isNone(refusedEffect)).toBe(true);

			const [accepted, acceptedEffect] = c.reducer(second, c.form(stamped(firstId + 1)), deps);
			expect(accepted.status).toBe('submitting');
			expect(isNone(acceptedEffect)).toBe(false);
		});

		it('refuses the result of a submission a formReset cancelled; the next submission is accepted', () => {
			const deps = inert();
			const submitting = start(ready(deps), deps);
			const cancelledId = submitting.form.submissionId!;
			const reset = c.reducer(submitting, c.form({ type: 'formReset' }), deps)[0];
			expect(reset.form.isSubmitting).toBe(false);

			for (const id of [cancelledId, reset.form.submissionId]) {
				const [next, effect] = c.reducer(reset, c.form(stamped(id)), deps);
				expect(next.status, `stamped ${id} after the reset started a request`).toBe(reset.status);
				expect(isNone(effect)).toBe(true);
			}

			const again = start(fold(c.reducer, reset, c.fields.map(c.form), deps), deps);
			const [accepted] = c.reducer(again, c.form(stamped(again.form.submissionId)), deps);
			expect(accepted.status).toBe('submitting');
		});

		it('ignores an unstamped result while nothing is submitting, though the form accepts it; accepts one that completes a submission', () => {
			const deps = inert();
			const idle = ready(deps);
			const [next, effect] = c.reducer(idle, c.form(stamped(undefined)), deps);
			// Core has no stamp to check and records the success; the refusal is the flow's.
			expect(next.form, 'the form accepted it').not.toBe(idle.form);
			expect(next.form.submitCount).toBe(idle.form.submitCount + 1);
			expect(next.status, 'the flow started a request').toBe(idle.status);
			expect(isNone(effect)).toBe(true);

			// Positive control: a hand-dispatched result for a submission in flight.
			const [accepted, acceptedEffect] = c.reducer(start(idle, deps), c.form(stamped(undefined)), deps);
			expect(accepted.status).toBe('submitting');
			expect(isNone(acceptedEffect)).toBe(false);
		});

		it('a second genuine submission while the request is in flight still supersedes it', async () => {
			const releases: Array<() => void> = [];
			const request = vi.fn<Request>(
				() => new Promise((resolve) => releases.push(() => resolve(c.result)))
			);
			const deps = c.deps(request);
			const store = createStore({ initialState: ready(deps), reducer: c.reducer, dependencies: deps });

			store.dispatch(c.form({ type: 'submitTriggered' }));
			await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
			expect(store.state.status).toBe('submitting');

			store.dispatch(c.form({ type: 'submitTriggered' }));
			await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
			const signal = (call: number) => request.mock.calls[call]!.at(-1) as AbortSignal;
			expect(signal(0).aborted, 'the superseded request was not cancelled').toBe(true);
			expect(signal(1).aborted).toBe(false);

			releases[1]!();
			await vi.waitFor(() => expect(store.state.status).toBe(c.settled));
			store.destroy();
		});
	});
}

function isSubmissionSucceeded(action: unknown): boolean {
	if (typeof action !== 'object' || action === null) return false;
	const { type, action: inner } = action as { type?: unknown; action?: { type?: unknown; submissionId?: unknown } };
	return type === 'form' && inner?.type === 'submissionSucceeded' && typeof inner.submissionId === 'number';
}

function changed<F extends Record<string, unknown>>(field: keyof F & string, value: string): FormAction<F> {
	return { type: 'fieldChanged', field, value } as FormAction<F>;
}

// ---------------------------------------------------------------------------
// The seven flows
// ---------------------------------------------------------------------------

describeSubmissionFeedback<SignupFields, SignupState, SignupAction, SignupDependencies>({
	flow: 'signup',
	reducer: signupReducer,
	initial: () => createInitialSignupState(),
	form: (action) => ({ type: 'form', action }),
	fields: [
		changed('email', 'ada@example.com'),
		changed('password', PASSWORD),
		changed('confirmPassword', PASSWORD)
	],
	deps: (request) => ({ signup: request as SignupDependencies['signup'] }),
	result: { kind: 'session', session },
	settled: 'succeeded',
	requestArgs: [{ email: 'ada@example.com', password: PASSWORD }]
});

describeSubmissionFeedback<
	ForgotPasswordFields,
	ForgotPasswordState,
	ForgotPasswordAction,
	ForgotPasswordDependencies
>({
	flow: 'forgot-password',
	reducer: forgotPasswordReducer,
	initial: () => createInitialForgotPasswordState(),
	form: (action) => ({ type: 'form', action }),
	fields: [changed('email', 'ada@example.com')],
	deps: (request) => ({
		requestPasswordReset: request as ForgotPasswordDependencies['requestPasswordReset']
	}),
	result: undefined,
	settled: 'sent',
	requestArgs: ['ada@example.com']
});

describeSubmissionFeedback<
	ResetPasswordFields,
	ResetPasswordState,
	ResetPasswordAction,
	ResetPasswordDependencies
>({
	flow: 'reset-password',
	reducer: resetPasswordReducer,
	initial: () => createInitialResetPasswordState('tok_1'),
	form: (action) => ({ type: 'form', action }),
	fields: [changed('password', PASSWORD), changed('confirmPassword', PASSWORD)],
	deps: (request) => ({ resetPassword: request as ResetPasswordDependencies['resetPassword'] }),
	result: session,
	settled: 'reset',
	requestArgs: ['tok_1', PASSWORD]
});

describeSubmissionFeedback<ChangeEmailFields, ChangeEmailState, ChangeEmailAction, ChangeEmailDependencies>({
	flow: 'change-email',
	reducer: changeEmailReducer,
	initial: () => createInitialChangeEmailState(),
	form: (action) => ({ type: 'form', action }),
	fields: [changed('email', 'new@example.com')],
	deps: (request) => ({
		requestEmailChange: request as ChangeEmailDependencies['requestEmailChange'],
		resendEmailChange: vi.fn(async () => undefined)
	}),
	result: undefined,
	// Success clears the field and returns to `idle` with the pending address.
	settled: 'idle',
	requestArgs: ['new@example.com']
});

describeSubmissionFeedback<
	MagicLinkFields,
	MagicLinkRequestState,
	MagicLinkRequestAction,
	MagicLinkRequestDependencies
>({
	flow: 'magic-link-request',
	reducer: magicLinkRequestReducer,
	initial: () => createInitialMagicLinkRequestState(),
	form: (action) => ({ type: 'form', action }),
	fields: [changed('email', 'ada@example.com')],
	deps: (request) => ({
		requestMagicLink: request as MagicLinkRequestDependencies['requestMagicLink']
	}),
	result: undefined,
	settled: 'sent',
	requestArgs: ['ada@example.com']
});

const confirmingEnrolment = (): MfaEnrolmentState => ({
	...createInitialMfaEnrolmentState(),
	status: 'confirming',
	enrolmentId: 'enr_1',
	secret: 'JBSWY3DPEHPK3PXP',
	otpauthUri: 'otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP'
});

const enrolmentDeps = (confirm: MfaEnrolmentDependencies['confirmMfaEnrolment']): MfaEnrolmentDependencies => ({
	beginMfaEnrolment: vi.fn(async () => {
		throw new Error('the enrolment was already started');
	}),
	confirmMfaEnrolment: confirm
});

describeSubmissionFeedback<MfaCodeFields, MfaEnrolmentState, MfaEnrolmentAction, MfaEnrolmentDependencies>({
	flow: 'mfa-enrolment',
	reducer: mfaEnrolmentReducer,
	initial: confirmingEnrolment,
	form: (action) => ({ type: 'form', action }),
	fields: [changed('code', '123456')],
	deps: (request) => enrolmentDeps(request as MfaEnrolmentDependencies['confirmMfaEnrolment']),
	result: { recoveryCodes: ['aaa-111', 'bbb-222'] },
	settled: 'enrolled',
	requestArgs: ['enr_1', '123456']
});

describeSubmissionFeedback<
	ChangePasswordFields,
	ChangePasswordState,
	ChangePasswordAction,
	ChangePasswordDependencies
>({
	flow: 'change-password',
	reducer: changePasswordReducer,
	initial: () => createInitialChangePasswordState(),
	form: (action) => ({ type: 'form', action }),
	fields: [changed('password', PASSWORD), changed('confirmPassword', PASSWORD)],
	deps: (request) => ({ changePassword: request as ChangePasswordDependencies['changePassword'] }),
	result: session,
	settled: 'changed',
	requestArgs: [PASSWORD]
});

// ---------------------------------------------------------------------------
// What differs
// ---------------------------------------------------------------------------

describe('reset-password: the missing-token refusal', () => {
	const deps: ResetPasswordDependencies = { resetPassword: vi.fn(async () => session) };
	const tokenless = (): ResetPasswordState =>
		fold(
			resetPasswordReducer,
			createInitialResetPasswordState(null),
			[
				{ type: 'form', action: changed<ResetPasswordFields>('password', PASSWORD) },
				{ type: 'form', action: changed<ResetPasswordFields>('confirmPassword', PASSWORD) }
			],
			deps
		);

	it('is not raised by a result the form refused, and is by one it accepted', () => {
		const idle = tokenless();
		const [refused] = resetPasswordReducer(
			idle,
			{ type: 'form', action: stamped(idle.form.submissionId ?? 1) },
			deps
		);
		expect(refused.error, 'a stale result reported the link as broken').toBeNull();

		// Positive control: an accepted submission with no token still says so.
		const submitting = resetPasswordReducer(idle, { type: 'form', action: started }, deps)[0];
		const [accepted, effect] = resetPasswordReducer(
			submitting,
			{ type: 'form', action: stamped(submitting.form.submissionId) },
			deps
		);
		expect(accepted.error?.code).toBe('token_expired');
		expect(accepted.status).toBe('idle');
		expect(isNone(effect), 'a request with no token').toBe(true);
	});
});

describe('mfa-enrolment: confirmation only while the secret is being confirmed', () => {
	it('an accepted result after enrolment starts no second confirmation and keeps the recovery codes on screen', async () => {
		// A submission can still be in flight when `enrolled` arrives — one begun
		// while the first confirmation was pending, headless or during the
		// first's validation. Confirming a finished enrolment again fails, and a
		// failure sends the flow back to `confirming`: off the recovery codes,
		// which are shown once.
		const confirm = vi
			.fn<MfaEnrolmentDependencies['confirmMfaEnrolment']>()
			.mockRejectedValue({ code: 'token_expired', message: 'This enrolment is finished.' });
		const deps = enrolmentDeps(confirm);
		const enrolled = fold(
			mfaEnrolmentReducer,
			{ ...confirmingEnrolment(), status: 'enrolled', recoveryCodes: ['aaa-111'] },
			[
				{ type: 'form', action: changed<MfaCodeFields>('code', '123456') },
				{ type: 'form', action: started }
			],
			deps
		);
		expect(enrolled.form.isSubmitting, 'a submission is in flight').toBe(true);
		const store = createStore({ initialState: enrolled, reducer: mfaEnrolmentReducer, dependencies: deps });

		store.dispatch({ type: 'form', action: stamped(enrolled.form.submissionId) });
		await settleEffects();
		expect(store.state.form.isSubmitting, 'the form accepted it').toBe(false);
		expect(confirm, 'a second confirmation of a finished enrolment').not.toHaveBeenCalled();
		expect(store.state.status).toBe('enrolled');
		expect(store.state.recoveryCodes).toEqual(['aaa-111']);
		store.destroy();
	});

	it('refuses an accepted result outside confirming and submitting; accepts it in both', () => {
		const deps = enrolmentDeps(vi.fn(async () => ({ recoveryCodes: [] })));
		const code = { type: 'form', action: changed<MfaCodeFields>('code', '123456') } as const;
		const submittingIn = (state: MfaEnrolmentState) =>
			fold(mfaEnrolmentReducer, state, [code, { type: 'form', action: started }], deps);

		const enrolled = submittingIn({ ...confirmingEnrolment(), status: 'enrolled', recoveryCodes: ['aaa-111'] });
		const [refused, refusedEffect] = mfaEnrolmentReducer(
			enrolled,
			{ type: 'form', action: stamped(enrolled.form.submissionId) },
			deps
		);
		expect(refused.form, 'the form accepted it').not.toBe(enrolled.form);
		expect(refused.status).toBe('enrolled');
		expect(isNone(refusedEffect), 'a confirmation after enrolment').toBe(true);

		// Positive controls: `confirming`, and `submitting` — where a second
		// submission supersedes the first, as before.
		for (const status of ['confirming', 'submitting'] as const) {
			const live = submittingIn({ ...confirmingEnrolment(), status });
			const [accepted, effect] = mfaEnrolmentReducer(
				live,
				{ type: 'form', action: stamped(live.form.submissionId) },
				deps
			);
			expect(accepted.status, status).toBe('submitting');
			expect(isNone(effect), status).toBe(false);
		}
	});
});
