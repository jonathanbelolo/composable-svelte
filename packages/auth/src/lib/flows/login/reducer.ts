/**
 * The sign-in flow.
 *
 * Core's form reducer handles the fields; this handles everything that happens
 * after they are valid. See `types.ts` for why the split is forced rather than
 * chosen.
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
import { emptyLoginFields, loginSchema, type LoginFields } from './schema.js';
import type { LoginAction, LoginDependencies, LoginState } from './types.js';

/**
 * Cancellation id for the sign-in request.
 *
 * Fixed, not per-dispatch: re-registering the same id is what cancels the
 * previous one, so a second submit supersedes the first instead of racing it.
 * The same reasoning as `LOGOUT_EFFECT_ID` in the session reducer.
 */
const LOGIN_EFFECT_ID = 'auth/flows/login';

/**
 * The form config the flow drives.
 *
 * `onSubmit` is deliberately empty. The form's job ends at "these fields are
 * valid"; the reducer observes `submissionSucceeded` and makes the request,
 * because an `AuthError` thrown from `onSubmit` would reach state as a bare
 * string. `mode: 'onSubmit'` because red-flagging a password field while
 * someone types it is hostile — they know it is incomplete.
 */
export const loginFormConfig: FormConfig<LoginFields> = {
	schema: loginSchema,
	initialData: emptyLoginFields,
	mode: 'onSubmit',
	onSubmit: async () => {
		// Intentionally empty — see above.
	}
};

export function createInitialLoginState(fields?: Partial<LoginFields>): LoginState {
	return {
		form: createInitialFormState(loginFormConfig, { ...emptyLoginFields, ...fields }),
		status: 'idle',
		error: null,
		session: null
	};
}

const formReducer = createFormReducer(loginFormConfig);

const scopedFormReducer = scope<
	LoginState,
	LoginAction,
	FormState<LoginFields>,
	FormAction<LoginFields>,
	LoginDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const loginReducer: Reducer<LoginState, LoginAction, LoginDependencies> = (
	state,
	action,
	deps
) => {
	switch (action.type) {
		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			// Editing anything clears the last failure. Core never clears its own
			// `submitError` on `fieldChanged`, so without this a stale "Invalid
			// credentials" sits above the form while the user retypes the password
			// it is complaining about.
			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			// The fields are valid. This is where the flow takes over.
			const credentials = {
				email: cleared.form.data.email,
				password: cleared.form.data.password,
				rememberMe: cleared.form.data.rememberMe
			};

			return [
				// `session` cleared for the same reason as in the signup flow: a
				// failure after an earlier success otherwise leaves a stale snapshot
				// beside the error, and `state.session !== null` stops meaning
				// "signed in".
				{ ...cleared, status: 'submitting', error: null, session: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<LoginAction>(LOGIN_EFFECT_ID, async (dispatch, signal) => {
						try {
							const session = await deps.login(credentials, signal);
							dispatch({ type: 'loginSucceeded', session });
						} catch (error) {
							// `toAuthError` passes an `AuthError` straight through, so a
							// dependency that classified its own failure keeps that work.
							dispatch({ type: 'loginFailed', error: toAuthError(error) });
						}
					})
				)
			];
		}

		case 'loginSucceeded': {
			return [
				{ ...state, status: 'succeeded', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'loginFailed': {
			// Back to `idle`, not to a failed status: the form is usable again and
			// the error is what says something went wrong. A separate `failed`
			// status would be a second source of truth for the same fact.
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
 * A store for one sign-in attempt.
 *
 * The parallel of `createSessionStore`, and there for the same reason: the
 * three-argument `createStore` call is boilerplate a caller gets no say in.
 * Compose `loginReducer` into a parent instead when the surrounding feature
 * needs to observe the sign-in — this is for the common case where nothing does
 * but the component.
 *
 * @example
 * ```ts
 * import { createLoginStore, createSessionStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const deps = createHttpAuthDeps();
 * const session = createSessionStore(deps);
 * const login = createLoginStore(deps);
 * ```
 */
export function createLoginStore(
	deps: LoginDependencies,
	fields?: Partial<LoginFields>
): Store<LoginState, LoginAction> {
	return createStore({
		initialState: createInitialLoginState(fields),
		reducer: loginReducer,
		dependencies: deps
	});
}
