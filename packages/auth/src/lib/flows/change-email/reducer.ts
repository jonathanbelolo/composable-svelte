/**
 * The request half of an email change.
 *
 * Two fixed effect ids, because requesting and resending are independent — a
 * resend must not cancel a request still in flight. Fixed within each, so a
 * second press supersedes the first rather than racing it. The reasoning
 * `email-verification` states.
 */

import { createStore, Effect, scope, type Store } from '@composable-svelte/core';
import {
	createFormReducer,
	createInitialFormState,
	type FormAction,
	type FormConfig,
	type FormState
} from '@composable-svelte/core/components/form';

import { toAuthError } from '../../errors/helpers.js';
import { changeEmailSchema, emptyChangeEmailFields, type ChangeEmailFields } from './schema.js';
import type {
	ChangeEmailAction,
	ChangeEmailDependencies,
	ChangeEmailState
} from './types.js';

const REQUEST_EFFECT_ID = 'auth/flows/change-email/request';
const RESEND_EFFECT_ID = 'auth/flows/change-email/resend';

/**
 * `mode: 'onBlur'`, matching `forgot-password` and for its reason: a typo is
 * the most likely failure, and the backend will never mention it — the link
 * simply goes somewhere else.
 */
export const changeEmailFormConfig: FormConfig<ChangeEmailFields> = {
	schema: changeEmailSchema,
	initialData: emptyChangeEmailFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission, or core's form
		// reducer would catch the throw and flatten the `AuthError` to a string.
	}
};

export function createInitialChangeEmailState(): ChangeEmailState {
	return {
		form: createInitialFormState(changeEmailFormConfig, emptyChangeEmailFields),
		status: 'idle',
		error: null,
		resendStatus: 'idle',
		resendError: null,
		pendingEmail: null
	};
}

const formReducer = createFormReducer(changeEmailFormConfig);

const scopedFormReducer = scope<
	ChangeEmailState,
	ChangeEmailAction,
	FormState<ChangeEmailFields>,
	FormAction<ChangeEmailFields>,
	ChangeEmailDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export function changeEmailReducer(
	state: ChangeEmailState,
	action: ChangeEmailAction,
	deps: ChangeEmailDependencies
): readonly [ChangeEmailState, Effect<ChangeEmailAction>] {
	switch (action.type) {
		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			// Core never clears its own `submitError`, so without this the failure
			// sits above the address being retyped.
			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			const email = cleared.form.data.email;

			return [
				{ ...cleared, status: 'submitting', error: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<ChangeEmailAction>(
						REQUEST_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								await deps.requestEmailChange(email, signal);
								dispatch({ type: 'changeRequestSucceeded', email });
							} catch (error) {
								dispatch({ type: 'changeRequestFailed', error: toAuthError(error) });
							}
						}
					)
				)
			];
		}

		case 'changeRequestSucceeded': {
			// The field is cleared, as `change-password` clears its own: a settings
			// panel is not a form that unmounts on success, and the panel now says
			// "we sent a link to …" — leaving the value in the field says it twice.
			//
			// The resend state resets too: a new request supersedes any resend that
			// belonged to the previous one.
			return [
				{
					...state,
					form: createInitialFormState(changeEmailFormConfig, emptyChangeEmailFields),
					status: 'idle',
					error: null,
					resendStatus: 'idle',
					resendError: null,
					pendingEmail: action.email
				},
				Effect.none()
			];
		}

		case 'changeRequestFailed': {
			// Back to `idle` with `error` doing the talking. `email_taken` and
			// `reauthentication_required` are the two that land here, and both are
			// things the user can act on rather than failures.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'resendRequested': {
			// Nothing to resend, so nothing to do — not an error: a surface simply
			// does not offer it when no change is pending.
			if (state.pendingEmail === null || state.resendStatus === 'sending') {
				return [state, Effect.none()];
			}

			return [
				{ ...state, resendStatus: 'sending', resendError: null },
				Effect.cancellable<ChangeEmailAction>(RESEND_EFFECT_ID, async (dispatch, signal) => {
					try {
						await deps.resendEmailChange(signal);
						dispatch({ type: 'resendSucceeded' });
					} catch (error) {
						dispatch({ type: 'resendFailed', error: toAuthError(error) });
					}
				})
			];
		}

		case 'resendSucceeded': {
			return [{ ...state, resendStatus: 'sent', resendError: null }, Effect.none()];
		}

		case 'resendFailed': {
			return [{ ...state, resendStatus: 'idle', resendError: action.error }, Effect.none()];
		}

		case 'pendingEmailObserved': {
			// The account is the truth; `pendingEmail` is only this store's memory
			// of a request it made.
			//
			// **Identical state object when nothing changed** — the surface
			// dispatches this from an effect, and a fresh object each time would
			// re-trigger it forever.
			if (state.pendingEmail === action.email) return [state, Effect.none()];
			return [
				{ ...state, pendingEmail: action.email, resendStatus: 'idle', resendError: null },
				Effect.none()
			];
		}

		case 'errorDismissed': {
			if (state.error === null && state.resendError === null) return [state, Effect.none()];
			return [{ ...state, error: null, resendError: null }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
}

/**
 * A store for the email-change panel.
 *
 * @example
 * ```ts
 * import { createChangeEmailStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const changeEmail = createChangeEmailStore(createHttpAuthDeps());
 * ```
 */
export function createChangeEmailStore(
	deps: ChangeEmailDependencies
): Store<ChangeEmailState, ChangeEmailAction> {
	return createStore({
		initialState: createInitialChangeEmailState(),
		reducer: changeEmailReducer,
		dependencies: deps
	});
}
