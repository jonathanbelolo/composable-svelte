/**
 * The second-factor challenge.
 *
 * Like `reset-password` and unlike `email-verification`: the code is exchanged
 * **on submit**, so there is no mount effect to re-fire and none of
 * verification's mount machinery is needed. A generation guards queued
 * form actions separately from verification request identity. Replacing the
 * challenge/factor retires both result lifetimes and requests resource cleanup;
 * starting verification does not retire its form. Legacy synchronous subscriber
 * reentrancy can still register an old effect after cancellation.
 */

import { createStore, Effect, scope } from '@composable-svelte/core';
import {
	createFormReducer,
	createInitialFormState,
	type FormAction,
	type FormConfig,
	type FormState
} from '@composable-svelte/core/components/form';
import type { Reducer, Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import { emptyMfaCodeFields, mfaCodeSchema, type MfaCodeFields } from './schema.js';
import type { MfaMethod } from '../../deps.js';
import type {
	MfaChallengeAction,
	MfaChallengeDependencies,
	MfaChallengeState
} from './types.js';

/** Cancellation retires a replaced request; status gating prevents duplicate submissions. */
const CHALLENGE_EFFECT_ID = 'auth/flows/mfa-challenge';

/**
 * `mode: 'onSubmit'`, like sign-in and unlike the password forms.
 *
 * There is nothing useful to say on blur. The only rule is "you typed
 * something", and flagging an empty field the moment someone tabs past it while
 * reaching for their phone is exactly the hostility the sign-in form avoids.
 */
export const mfaChallengeFormConfig: FormConfig<MfaCodeFields> = {
	schema: mfaCodeSchema,
	initialData: emptyMfaCodeFields,
	mode: 'onSubmit',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission, or `challengeId`
		// would be flattened out of the failure on the way back.
	}
};

export function createInitialMfaChallengeState(
	challengeId: string | null = null,
	methods: readonly MfaMethod[] = ['totp']
): MfaChallengeState {
	// Match the HTTP adapter's documented fallback when no factor is named.
	const availableMethods: readonly MfaMethod[] = methods.length > 0 ? methods : ['totp'];
	return {
		form: createInitialFormState(mfaChallengeFormConfig, emptyMfaCodeFields),
		status: 'idle',
		challengeId: challengeId === '' ? null : challengeId,
		methods: availableMethods,
		// Whatever the account can actually do, preferring the authenticator.
		method: availableMethods.includes('totp') ? 'totp' : availableMethods[0]!,
		error: null,
		session: null,
		attempt: 0,
		formGeneration: 0
	};
}

const formReducer = createFormReducer(mfaChallengeFormConfig);

const scopedFormReducer = scope<
	MfaChallengeState,
	MfaChallengeAction,
	FormState<MfaCodeFields>,
	FormAction<MfaCodeFields>,
	MfaChallengeDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const mfaChallengeReducer: Reducer<
	MfaChallengeState,
	MfaChallengeAction,
	MfaChallengeDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'form': {
			if ((action.generation !== undefined && action.generation !== (state.formGeneration ?? 0)) ||
				(action.generation === undefined && action.attempt !== undefined && action.attempt !== (state.formGeneration ?? 0))) {
				return [state, Effect.none()];
			}
			// MFA spends one code per attempt. Ignore duplicate submit intentions
			// before they start another child operation, including reentrant callers.
			if (action.action.type === 'submitTriggered' &&
				(state.form.isValidating || state.form.isSubmitting || state.status !== 'idle')) {
				return [state, Effect.none()];
			}
			const [withForm, unguardedFormEffect] = scopedFormReducer(state, action, deps);
			const formEffect = Effect.map(unguardedFormEffect, (next) =>
				next.type === 'form' ? { ...next, generation: state.formGeneration ?? 0 } : next
			);

			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (
				action.action.type !== 'submissionSucceeded' ||
				withForm.form === state.form ||
				!state.form.isSubmitting
			) {
				return [cleared, formEffect];
			}

			if (cleared.status === 'submitting' || cleared.status === 'succeeded') {
				return [cleared, formEffect];
			}

			// Valid field and no challenge is not the user's mistake and not fixable
			// from here — the same shape as reset-password's missing token.
			if (cleared.challengeId === null || cleared.challengeId === '') {
				return [
					{
						...cleared,
						error: {
							code: 'token_expired',
							message: 'This sign-in attempt is no longer available. Start again.'
						}
					},
					formEffect
				];
			}

			const { challengeId, method } = cleared;
			// Not trimmed here any more. Core's form reducer now writes the
			// schema's output back into `state.data` at submit-time validation, so
			// `mfaCodeSchema`'s `.trim()` is what this reads — one declaration
			// instead of a rule every reducer had to remember separately.
			const code = cleared.form.data.code;
			// A verification request has its own correlation. Other current-lifetime
			// form completions must still settle their flags after this handoff.
			const attempt = (cleared.attempt ?? 0) + 1;

			return [
				{ ...cleared, status: 'submitting', error: null, session: null, attempt },
				Effect.batch(
					formEffect,
					Effect.cancellable<MfaChallengeAction>(
						CHALLENGE_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								const session = await deps.verifyMfaChallenge(
									challengeId,
									code,
									method,
									signal
								);
								dispatch({ type: 'challengeSucceeded', session, attempt });
							} catch (error) {
								dispatch({ type: 'challengeFailed', error: toAuthError(error), attempt });
							}
						}
					)
				)
			];
		}

		case 'challengeProvided': {
			const [reset, resetEffect] = scopedFormReducer(state, { type: 'form', action: { type: 'formReset' } }, deps);
			const availableMethods: readonly MfaMethod[] = action.methods.length > 0 ? action.methods : ['totp'];
			// Explicit replacement resets the complete local attempt, including a
			// successful result and typed code, even for the same challenge ID.
			// MfaChallengeForm deduplicates prop synchronization by challenge ID.
			return [
				{
					...state,
					status: 'idle',
					challengeId: action.challengeId === '' ? null : action.challengeId,
					methods: availableMethods,
					method: availableMethods.includes('totp') ? 'totp' : availableMethods[0]!,
					error: null,
					session: null,
					form: reset.form,
					attempt: (state.attempt ?? 0) + 1,
					formGeneration: (state.formGeneration ?? 0) + 1
				},
				Effect.batch(resetEffect, Effect.cancel(CHALLENGE_EFFECT_ID))
			];
		}

		case 'methodChosen': {
			if (action.method === state.method || !state.methods.includes(action.method)) return [state, Effect.none()];
			const [reset, resetEffect] = scopedFormReducer(state, { type: 'form', action: { type: 'formReset' } }, deps);

			// The local result and code are cleared to begin a fresh factor attempt.
			// This does not revoke an external session. Leaving a
			// half-typed authenticator code in the box while the label now says
			// "recovery code" is how someone submits the wrong thing twice.
			return [
				{
					...state,
					method: action.method,
					status: 'idle',
					session: null,
					attempt: (state.attempt ?? 0) + 1,
					formGeneration: (state.formGeneration ?? 0) + 1,
					error: null,
					form: reset.form
				},
				Effect.batch(resetEffect, Effect.cancel(CHALLENGE_EFFECT_ID))
			];
		}

		case 'challengeSucceeded': {
			if (action.attempt !== undefined) {
				if (action.attempt !== (state.attempt ?? 0) || state.status !== 'submitting') {
					return [state, Effect.none()];
				}
			}
			return [
				{ ...state, status: 'succeeded', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'challengeFailed': {
			if (action.attempt !== undefined) {
				if (action.attempt !== (state.attempt ?? 0) || state.status !== 'submitting') {
					return [state, Effect.none()];
				}
			}
			// Back to `idle`; `error` says what went wrong. `token_expired` is the
			// one a surface must treat differently — retrying cannot help.
			// A failed local result cannot retain a previous successful result.
			// This is flow state, not the application's established session store.
			return [{ ...state, status: 'idle', error: action.error, session: null }, Effect.none()];
		}

		case 'errorDismissed': {
			return [state.error === null ? state : { ...state, error: null }, Effect.none()];
		}

		case 'startOverRequested':
			// A request to whoever composes this flow; the challenge itself has
			// nothing to change. `createAuthFeature` answers it with a fresh sign-in.
			return [state, Effect.none()];

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
};

/**
 * A store for one second-factor challenge.
 *
 * @example
 * ```ts
 * import { createMfaChallengeStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * // `LoginForm`'s `onMfaRequired` hands over the id and the methods.
 * const challenge = createMfaChallengeStore(createHttpAuthDeps());
 * ```
 */
export function createMfaChallengeStore(
	deps: MfaChallengeDependencies,
	challengeId: string | null = null,
	methods: readonly MfaMethod[] = ['totp']
): Store<MfaChallengeState, MfaChallengeAction> {
	return createStore({
		initialState: createInitialMfaChallengeState(challengeId, methods),
		reducer: mfaChallengeReducer,
		dependencies: deps
	});
}
