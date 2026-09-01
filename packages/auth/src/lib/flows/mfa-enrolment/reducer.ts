/**
 * The enrolment flow.
 *
 * Two effect ids, because starting and confirming are independent operations —
 * the same reasoning `email-verification` documents for verify and resend.
 *
 * And unlike `reset-password`, the guard against a repeated start **is** wanted
 * here. That flow exchanges on submit, where there is no mount effect to
 * re-fire; this one fetches on entry, where there is. A second start does not
 * merely waste a request: it issues a new secret, silently invalidating the one
 * the user is at that moment typing into their authenticator app.
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
	emptyMfaCodeFields,
	mfaCodeSchema,
	type MfaCodeFields
} from '../mfa-challenge/schema.js';
import type {
	MfaEnrolmentAction,
	MfaEnrolmentDependencies,
	MfaEnrolmentState
} from './types.js';

const START_EFFECT_ID = 'auth/flows/mfa-enrolment/start';
const CONFIRM_EFFECT_ID = 'auth/flows/mfa-enrolment/confirm';

/** The same lax code rule the challenge uses, from the same schema. */
export const mfaEnrolmentFormConfig: FormConfig<MfaCodeFields> = {
	schema: mfaCodeSchema,
	initialData: emptyMfaCodeFields,
	mode: 'onSubmit',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission.
	}
};

export function createInitialMfaEnrolmentState(): MfaEnrolmentState {
	return {
		form: createInitialFormState(mfaEnrolmentFormConfig, emptyMfaCodeFields),
		status: 'idle',
		enrolmentId: null,
		secret: null,
		otpauthUri: null,
		recoveryCodes: null,
		error: null
	};
}

const formReducer = createFormReducer(mfaEnrolmentFormConfig);

const scopedFormReducer = scope<
	MfaEnrolmentState,
	MfaEnrolmentAction,
	FormState<MfaCodeFields>,
	FormAction<MfaCodeFields>,
	MfaEnrolmentDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export const mfaEnrolmentReducer: Reducer<
	MfaEnrolmentState,
	MfaEnrolmentAction,
	MfaEnrolmentDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'enrolmentRequested': {
			// Refused unless idle. A second start issues a new secret and quietly
			// invalidates the one already on screen — which the user may be halfway
			// through typing into their phone.
			if (state.status !== 'idle') {
				return [state, Effect.none()];
			}

			return [
				{ ...state, status: 'starting', error: null },
				Effect.cancellable<MfaEnrolmentAction>(START_EFFECT_ID, async (dispatch, signal) => {
					try {
						const start = await deps.beginMfaEnrolment(signal);
						dispatch({ type: 'enrolmentStarted', ...start });
					} catch (error) {
						dispatch({ type: 'enrolmentStartFailed', error: toAuthError(error) });
					}
				})
			];
		}

		case 'enrolmentStarted': {
			return [
				{
					...state,
					status: 'confirming',
					enrolmentId: action.enrolmentId,
					secret: action.secret,
					otpauthUri: action.otpauthUri,
					error: null
				},
				Effect.none()
			];
		}

		case 'enrolmentStartFailed': {
			// Back to `idle`, which is also what makes a retry possible — the guard
			// above only refuses while something is in flight or already started.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'form': {
			const [withForm, formEffect] = scopedFormReducer(state, action, deps);

			const cleared =
				action.action.type === 'fieldChanged' && withForm.error !== null
					? { ...withForm, error: null }
					: withForm;

			if (action.action.type !== 'submissionSucceeded') {
				return [cleared, formEffect];
			}

			// Submitting before there is a secret is not reachable through the
			// component, which does not render the form until `confirming`. Guarded
			// anyway, because the reducer is exported and a headless caller can.
			if (cleared.enrolmentId === null) {
				return [cleared, formEffect];
			}

			const { enrolmentId } = cleared;
			// Not trimmed here any more. Core's form reducer now writes the
			// schema's output back into `state.data` at submit-time validation, so
			// `mfaCodeSchema`'s `.trim()` is what this reads — one declaration
			// instead of a rule every reducer had to remember separately.
			const code = cleared.form.data.code;

			return [
				{ ...cleared, status: 'submitting', error: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<MfaEnrolmentAction>(CONFIRM_EFFECT_ID, async (dispatch, signal) => {
						try {
							const { recoveryCodes } = await deps.confirmMfaEnrolment(
								enrolmentId,
								code,
								signal
							);
							dispatch({ type: 'enrolmentConfirmed', recoveryCodes });
						} catch (error) {
							dispatch({ type: 'enrolmentConfirmFailed', error: toAuthError(error) });
						}
					})
				)
			];
		}

		case 'enrolmentConfirmed': {
			return [
				{ ...state, status: 'enrolled', recoveryCodes: action.recoveryCodes, error: null },
				Effect.none()
			];
		}

		case 'enrolmentConfirmFailed': {
			// Back to `confirming`, not `idle`: the secret is still good and still on
			// screen, and the user simply mistyped. Returning to `idle` would offer
			// to start over and throw away an enrolment that is one correct code
			// from finishing.
			return [{ ...state, status: 'confirming', error: action.error }, Effect.none()];
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
 * A store for one enrolment.
 *
 * @example
 * ```ts
 * import { createMfaEnrolmentStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const enrolment = createMfaEnrolmentStore(createHttpAuthDeps());
 * ```
 */
export function createMfaEnrolmentStore(
	deps: MfaEnrolmentDependencies
): Store<MfaEnrolmentState, MfaEnrolmentAction> {
	return createStore({
		initialState: createInitialMfaEnrolmentState(),
		reducer: mfaEnrolmentReducer,
		dependencies: deps
	});
}
