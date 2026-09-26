import { createStore, Effect, scope, type Store } from '@composable-svelte/core';
import {
	createFormReducer,
	createInitialFormState,
	type FormAction,
	type FormConfig,
	type FormState
} from '@composable-svelte/core/components/form';

import { toAuthError } from '../../errors/helpers.js';
import { completesSubmissionInFlight } from '../submission-feedback.js';
import {
	changePasswordSchema,
	emptyChangePasswordFields,
	type ChangePasswordFields
} from './schema.js';
import type {
	ChangePasswordAction,
	ChangePasswordDependencies,
	ChangePasswordState
} from './types.js';

/** Fixed, so a double submit supersedes rather than changing twice. */
const CHANGE_EFFECT_ID = 'auth/flows/change-password';

/** `mode: 'onBlur'`, for the confirm field — the same reasoning as signup. */
export const changePasswordFormConfig: FormConfig<ChangePasswordFields> = {
	schema: changePasswordSchema,
	initialData: emptyChangePasswordFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission, or core's form
		// reducer would catch the throw and flatten the `AuthError` to a string.
	}
};

export function createInitialChangePasswordState(): ChangePasswordState {
	return {
		form: createInitialFormState(changePasswordFormConfig, emptyChangePasswordFields),
		status: 'idle',
		error: null,
		session: null,
		settled: null,
		completionCount: 0
	};
}

const formReducer = createFormReducer(changePasswordFormConfig);

const scopedFormReducer = scope<
	ChangePasswordState,
	ChangePasswordAction,
	FormState<ChangePasswordFields>,
	FormAction<ChangePasswordFields>,
	ChangePasswordDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export function changePasswordReducer(
	state: ChangePasswordState,
	action: ChangePasswordAction,
	deps: ChangePasswordDependencies
): readonly [ChangePasswordState, Effect<ChangePasswordAction>] {
	switch (action.type) {
		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			// Only the result of a submission in flight; see `submission-feedback.ts`.
			// A stale one would otherwise change the password to whatever the fields
			// now hold — including the empty fields a success leaves behind.
			if (!completesSubmissionInFlight(state.form, withForm.form, action.action)) {
				return [{ ...cleared, settled: null }, formEffect];
			}

			const password = cleared.form.data.password;

			return [
				{ ...cleared, status: 'submitting', error: null, session: null, settled: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<ChangePasswordAction>(
						CHANGE_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								const session = await deps.changePassword(password, signal);
								dispatch({ type: 'changeSucceeded', session });
							} catch (error) {
								dispatch({ type: 'changeFailed', error: toAuthError(error) });
							}
						}
					)
				)
			];
		}

		case 'changeSucceeded': {
			// The fields are cleared, unlike every other flow here. They hold a
			// password that is now live, on a page the user stays on afterwards —
			// a settings panel is not a sign-in form that unmounts on success.
			const isSettling = state.status === 'submitting';
			return [
				{
					...state,
					form: createInitialFormState(changePasswordFormConfig, emptyChangePasswordFields),
					status: 'changed',
					error: null,
					session: action.session,
					settled: isSettling ? 'changed' : null,
					completionCount: isSettling ? state.completionCount + 1 : state.completionCount
				},
				Effect.none()
			];
		}

		case 'changeFailed': {
			// Back to `idle` with `error` doing the talking, as every other flow
			// here does. `reauthentication_required` is the one a surface must treat
			// differently — it is the backend asking for proof, not a refusal, and
			// the fields are deliberately left filled so the user does not retype
			// them after confirming.
			return [
				{
					...state,
					status: 'idle',
					error: action.error,
					settled: state.status === 'submitting' ? 'failed' : null
				},
				Effect.none()
			];
		}

		case 'errorDismissed': {
			return [
				state.error === null && state.settled === null
					? state
					: { ...state, error: null, settled: null },
				Effect.none()
			];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [{ ...state, settled: null }, Effect.none()];
		}
	}
}

export function createChangePasswordStore(
	deps: ChangePasswordDependencies
): Store<ChangePasswordState, ChangePasswordAction> {
	return createStore({
		initialState: createInitialChangePasswordState(),
		reducer: changePasswordReducer,
		dependencies: deps
	});
}
