/**
 * The signup flow.
 *
 * Core's form reducer handles the fields; this handles everything after they
 * are valid. See `types.ts` for why the split is forced rather than chosen.
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
import { emptySignupFields, signupSchema, type SignupFields } from './schema.js';
import type { SignupAction, SignupDependencies, SignupState } from './types.js';

/**
 * Cancellation id for the signup request.
 *
 * Fixed, not per-dispatch: re-registering the same id cancels the previous one,
 * so a second submit supersedes the first instead of racing it. The same
 * reasoning as `LOGIN_EFFECT_ID`.
 */
const SIGNUP_EFFECT_ID = 'auth/flows/signup';

/**
 * The form config the flow drives.
 *
 * `onSubmit` is deliberately empty — see `types.ts`.
 *
 * `mode: 'onBlur'`, where sign-in uses `onSubmit`. The difference is the
 * confirm field: a mismatch discovered only at submit means retyping a password
 * the user believed they had already entered twice, and now that cross-field
 * rules run per-field (they did not until `870c0ca`) blur is the moment to say
 * so. Not `onChange`, which would red-flag a password mid-word — the criteria
 * checklist carries the live feedback instead, and it is phrased as a
 * requirement rather than a failure.
 */
export const signupFormConfig: FormConfig<SignupFields> = {
	schema: signupSchema,
	initialData: emptySignupFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — see above.
	}
};

export function createInitialSignupState(fields?: Partial<SignupFields>): SignupState {
	return {
		form: createInitialFormState(signupFormConfig, { ...emptySignupFields, ...fields }),
		status: 'idle',
		error: null,
		session: null,
		pendingEmail: null
	};
}

const formReducer = createFormReducer(signupFormConfig);

const scopedFormReducer = scope<
	SignupState,
	SignupAction,
	FormState<SignupFields>,
	FormAction<SignupFields>,
	SignupDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const signupReducer: Reducer<SignupState, SignupAction, SignupDependencies> = (
	state,
	action,
	deps
) => {
	switch (action.type) {
		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			// Editing anything clears the last failure, as in the sign-in flow:
			// core never clears its own `submitError` on `fieldChanged`, so a stale
			// "that address is taken" would sit above the address being corrected.
			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			const credentials = {
				email: cleared.form.data.email,
				password: cleared.form.data.password
			};

			return [
				// `session` and `pendingEmail` are cleared, not carried: a new attempt
				// invalidates whatever the last one produced. Without this, state
				// mid-flight still claimed `pendingEmail` from an earlier signup, and
				// a failure after a success left `session` set — so a headless caller
				// reading `state.session !== null` would believe it was signed in
				// while looking at an error.
				{ ...cleared, status: 'submitting', error: null, session: null, pendingEmail: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<SignupAction>(SIGNUP_EFFECT_ID, async (dispatch, signal) => {
						try {
							const outcome = await deps.signup(credentials, signal);
							dispatch(
								outcome.kind === 'session'
									? { type: 'signupSucceeded', session: outcome.session }
									: { type: 'verificationRequired', email: outcome.email }
							);
						} catch (error) {
							dispatch({ type: 'signupFailed', error: toAuthError(error) });
						}
					})
				)
			];
		}

		case 'signupSucceeded': {
			return [
				{
					...state,
					status: 'succeeded',
					error: null,
					session: action.session,
					pendingEmail: null
				},
				Effect.none()
			];
		}

		case 'verificationRequired': {
			// A success, not a failure. `error` stays null: nothing went wrong, the
			// account simply is not usable until the address is confirmed.
			return [
				{
					...state,
					status: 'awaitingVerification',
					error: null,
					session: null,
					pendingEmail: action.email
				},
				Effect.none()
			];
		}

		case 'signupFailed': {
			// Back to `idle` so the form is usable again; the error is what says
			// something went wrong. A `failed` status would be a second source of
			// truth for the same fact.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'errorDismissed': {
			// `state`, not `{ ...state }`: an identical object notifies every
			// subscriber that nothing changed.
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
 * A store for one signup attempt.
 *
 * The parallel of `createLoginStore`. Compose `signupReducer` into a parent
 * instead when the surrounding feature needs to observe the attempt.
 *
 * @example
 * ```ts
 * import { createSignupStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const signup = createSignupStore(createHttpAuthDeps());
 * ```
 */
export function createSignupStore(
	deps: SignupDependencies,
	fields?: Partial<SignupFields>
): Store<SignupState, SignupAction> {
	return createStore({
		initialState: createInitialSignupState(fields),
		reducer: signupReducer,
		dependencies: deps
	});
}
