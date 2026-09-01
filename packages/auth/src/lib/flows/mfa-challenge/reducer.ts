/**
 * The second-factor challenge.
 *
 * Like `reset-password` and unlike `email-verification`: the code is exchanged
 * **on submit**, so there is no mount effect to re-fire and none of
 * verification's two-guard machinery is needed. The fixed cancellation id is
 * the whole of it.
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

/** Fixed, so a double submit supersedes rather than spending the code twice. */
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
	return {
		form: createInitialFormState(mfaChallengeFormConfig, emptyMfaCodeFields),
		status: 'idle',
		challengeId,
		methods,
		// Whatever the account can actually do, preferring the authenticator.
		method: methods.includes('totp') ? 'totp' : (methods[0] ?? 'totp'),
		error: null,
		session: null
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
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			// Valid field and no challenge is not the user's mistake and not fixable
			// from here — the same shape as reset-password's missing token.
			if (cleared.challengeId === null) {
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
			// Trimmed *here*, not by the schema. `.trim()` in Zod runs during
			// parsing, and core's form reducer stores the raw value it was handed by
			// `fieldChanged` — it validates against the schema but never writes the
			// transformed result back. So the schema's trim only decides whether
			// all-whitespace is rejected; what actually gets sent is trimmed by
			// whoever builds the request, which is this.
			const code = cleared.form.data.code.trim();

			return [
				{ ...cleared, status: 'submitting', error: null, session: null },
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
								dispatch({ type: 'challengeSucceeded', session });
							} catch (error) {
								dispatch({ type: 'challengeFailed', error: toAuthError(error) });
							}
						}
					)
				)
			];
		}

		case 'challengeProvided': {
			// Replaces whatever was there, including any failure from a previous
			// challenge: a new sign-in attempt is not answerable for the last one.
			return [
				{
					...state,
					challengeId: action.challengeId,
					methods: action.methods,
					method: action.methods.includes('totp') ? 'totp' : (action.methods[0] ?? 'totp'),
					error: null
				},
				Effect.none()
			];
		}

		case 'methodChosen': {
			if (action.method === state.method) return [state, Effect.none()];

			// The code is cleared, because it is not the same code. Leaving a
			// half-typed authenticator code in the box while the label now says
			// "recovery code" is how someone submits the wrong thing twice.
			return [
				{
					...state,
					method: action.method,
					error: null,
					form: createInitialFormState(mfaChallengeFormConfig, emptyMfaCodeFields)
				},
				Effect.none()
			];
		}

		case 'challengeSucceeded': {
			return [
				{ ...state, status: 'succeeded', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'challengeFailed': {
			// Back to `idle`; `error` says what went wrong. `token_expired` is the
			// one a surface must treat differently — retrying cannot help.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'errorDismissed': {
			return [state.error === null ? state : { ...state, error: null }, Effect.none()];
		}

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
