/**
 * The forgot-password flow.
 *
 * Core's form reducer handles the field; this handles the request. The split is
 * the same one the other flows document: `config.onSubmit` flattens a thrown
 * `AuthError` to a string, so the reducer makes the call instead.
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
import {
	emptyForgotPasswordFields,
	forgotPasswordSchema,
	type ForgotPasswordFields
} from './schema.js';
import type {
	ForgotPasswordAction,
	ForgotPasswordDependencies,
	ForgotPasswordState
} from './types.js';

/** Fixed, so a second submit supersedes the first instead of racing it. */
const FORGOT_EFFECT_ID = 'auth/flows/forgot-password';

/**
 * `mode: 'onBlur'`, between sign-in's `onSubmit` and nothing.
 *
 * A mistyped address is the single most likely thing to go wrong here, and it
 * is the one thing the backend will never tell the user about — a request for
 * `ada@exmaple.com` succeeds exactly like a real one. Catching the typo at blur
 * is the only chance to catch it at all.
 */
export const forgotPasswordFormConfig: FormConfig<ForgotPasswordFields> = {
	schema: forgotPasswordSchema,
	initialData: emptyForgotPasswordFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — see above.
	}
};

export function createInitialForgotPasswordState(
	fields?: Partial<ForgotPasswordFields>
): ForgotPasswordState {
	return {
		form: createInitialFormState(forgotPasswordFormConfig, {
			...emptyForgotPasswordFields,
			...fields
		}),
		status: 'idle',
		error: null,
		requestedFor: null
	};
}

const formReducer = createFormReducer(forgotPasswordFormConfig);

const scopedFormReducer = scope<
	ForgotPasswordState,
	ForgotPasswordAction,
	FormState<ForgotPasswordFields>,
	FormAction<ForgotPasswordFields>,
	ForgotPasswordDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const forgotPasswordReducer: Reducer<
	ForgotPasswordState,
	ForgotPasswordAction,
	ForgotPasswordDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			// Editing clears the last failure, as in every other flow here.
			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			const email = cleared.form.data.email;

			return [
				// `requestedFor` is cleared on a new attempt, so a confirmation can
				// never name an address from a previous one — which is exactly the
				// kind of stale claim that sends someone to check the wrong inbox.
				{ ...cleared, status: 'submitting', error: null, requestedFor: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<ForgotPasswordAction>(
						FORGOT_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								await deps.requestPasswordReset(email, signal);
								dispatch({ type: 'requestSent', email });
							} catch (error) {
								dispatch({ type: 'requestFailed', error: toAuthError(error) });
							}
						}
					)
				)
			];
		}

		case 'requestSent': {
			// `sent`, and the form stays usable. This says the backend accepted the
			// request, not that an account exists — nothing here knows that, and the
			// surface must not imply otherwise.
			return [
				{ ...state, status: 'sent', error: null, requestedFor: action.email },
				Effect.none()
			];
		}

		case 'requestFailed': {
			// Back to `idle`; `error` is what says something went wrong.
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
 * A store for one reset request.
 *
 * @example
 * ```ts
 * import { createForgotPasswordStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const forgot = createForgotPasswordStore(createHttpAuthDeps());
 * ```
 */
export function createForgotPasswordStore(
	deps: ForgotPasswordDependencies,
	fields?: Partial<ForgotPasswordFields>
): Store<ForgotPasswordState, ForgotPasswordAction> {
	return createStore({
		initialState: createInitialForgotPasswordState(fields),
		reducer: forgotPasswordReducer,
		dependencies: deps
	});
}
