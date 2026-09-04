/**
 * The reset-password flow.
 *
 * See `types.ts` for why the single-use-token guards from email verification
 * are deliberately absent here.
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
	emptyResetPasswordFields,
	resetPasswordSchema,
	type ResetPasswordFields
} from './schema.js';
import type {
	ResetPasswordAction,
	ResetPasswordDependencies,
	ResetPasswordState
} from './types.js';

/**
 * Fixed, so a double-click supersedes rather than spending the token twice.
 *
 * This is the whole of the single-use protection this flow needs. Verification
 * needs two guards on top because it exchanges from a mount effect; a submit
 * button has no equivalent to re-fire.
 */
const RESET_EFFECT_ID = 'auth/flows/reset-password';

/** `mode: 'onBlur'`, for the confirm field — the same reasoning as signup. */
export const resetPasswordFormConfig: FormConfig<ResetPasswordFields> = {
	schema: resetPasswordSchema,
	initialData: emptyResetPasswordFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission.
	}
};

export function createInitialResetPasswordState(
	token: string | null = null,
	fields?: Partial<ResetPasswordFields>
): ResetPasswordState {
	return {
		form: createInitialFormState(resetPasswordFormConfig, {
			...emptyResetPasswordFields,
			...fields
		}),
		status: 'idle',
		error: null,
		session: null,
		token
	};
}

const formReducer = createFormReducer(resetPasswordFormConfig);

const scopedFormReducer = scope<
	ResetPasswordState,
	ResetPasswordAction,
	FormState<ResetPasswordFields>,
	FormAction<ResetPasswordFields>,
	ResetPasswordDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const resetPasswordReducer: Reducer<
	ResetPasswordState,
	ResetPasswordAction,
	ResetPasswordDependencies
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

			// Valid fields and no token is not the user's mistake and not something
			// they can fix from here. Calling the backend with an empty token would
			// only turn it into a confusing `token_expired`.
			if (cleared.token === null) {
				return [
					{
						...cleared,
						error: {
							code: 'token_expired',
							message: 'This reset link is missing or incomplete. Ask for a new one.'
						}
					},
					formEffect
				];
			}

			const { token } = cleared;
			const password = cleared.form.data.password;

			return [
				{ ...cleared, status: 'submitting', error: null, session: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<ResetPasswordAction>(RESET_EFFECT_ID, async (dispatch, signal) => {
						try {
							const session = await deps.resetPassword(token, password, signal);
							dispatch({ type: 'resetSucceeded', session });
						} catch (error) {
							dispatch({ type: 'resetFailed', error: toAuthError(error) });
						}
					})
				)
			];
		}

		case 'tokenProvided': {
			return [{ ...state, token: action.token }, Effect.none()];
		}

		case 'resetSucceeded': {
			return [
				{ ...state, status: 'reset', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'resetFailed': {
			// Back to `idle` so the form is usable — though for `token_expired` the
			// surface should offer a new link rather than a retry, which is why the
			// code is preserved rather than flattened to a message.
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
 * A store for one reset.
 *
 * @example
 * ```ts
 * import { createResetPasswordStore, tokenFromUrl } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const reset = createResetPasswordStore(
 *   createHttpAuthDeps(),
 *   tokenFromUrl(window.location.href)
 * );
 * ```
 */
export function createResetPasswordStore(
	deps: ResetPasswordDependencies,
	token: string | null = null,
	fields?: Partial<ResetPasswordFields>
): Store<ResetPasswordState, ResetPasswordAction> {
	return createStore({
		initialState: createInitialResetPasswordState(token, fields),
		reducer: resetPasswordReducer,
		dependencies: deps
	});
}
