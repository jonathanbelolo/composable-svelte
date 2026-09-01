import { createStore, Effect, scope, type Store } from '@composable-svelte/core';
import {
	createFormReducer,
	createInitialFormState,
	type FormAction,
	type FormConfig,
	type FormState
} from '@composable-svelte/core/components/form';

import { toAuthError } from '../../errors/helpers.js';
import { emptyMagicLinkFields, magicLinkSchema, type MagicLinkFields } from './schema.js';
import type {
	MagicLinkRequestAction,
	MagicLinkRequestDependencies,
	MagicLinkRequestState
} from './types.js';

/** Fixed, so a second press supersedes rather than sending two mails. */
const REQUEST_EFFECT_ID = 'auth/flows/magic-link-request';

/**
 * `mode: 'onBlur'`, matching `forgot-password` and for its reason.
 *
 * A mistyped address is the single most likely thing to go wrong here, and it
 * is the one thing the backend will never report: a request for an address with
 * no account resolves exactly like one that worked, so a typo produces a
 * cheerful "check your inbox" and a mail nobody receives. Catching it on blur is
 * the only feedback available.
 */
export const magicLinkRequestFormConfig: FormConfig<MagicLinkFields> = {
	schema: magicLinkSchema,
	initialData: emptyMagicLinkFields,
	mode: 'onBlur',
	onSubmit: async () => {
		// Intentionally empty — the flow owns the submission. Core's form reducer
		// catches a throw here and stores `error.message`, which would flatten the
		// `AuthError` union to a string.
	}
};

export function createInitialMagicLinkRequestState(
	fields?: Partial<MagicLinkFields>
): MagicLinkRequestState {
	return {
		form: createInitialFormState(magicLinkRequestFormConfig, {
			...emptyMagicLinkFields,
			...fields
		}),
		status: 'idle',
		error: null,
		requestedFor: null
	};
}

const formReducer = createFormReducer(magicLinkRequestFormConfig);

const scopedFormReducer = scope<
	MagicLinkRequestState,
	MagicLinkRequestAction,
	FormState<MagicLinkFields>,
	FormAction<MagicLinkFields>,
	MagicLinkRequestDependencies
>(
	(state) => state.form,
	(state, form) => ({ ...state, form }),
	(action) => (action.type === 'form' ? action.action : null),
	(action) => ({ type: 'form', action }),
	formReducer
);

export function magicLinkRequestReducer(
	state: MagicLinkRequestState,
	action: MagicLinkRequestAction,
	deps: MagicLinkRequestDependencies
): readonly [MagicLinkRequestState, Effect<MagicLinkRequestAction>] {
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

			// Not trimmed, unlike the MFA code fields. There the schema was
			// deliberately lax so the reducer had to do it; here `z.string().email()`
			// rejects an address with surrounding whitespace outright, so
			// `submissionSucceeded` never fires for one and a trim would be dead
			// code. `forgot-password` reads the field the same way.
			const email = cleared.form.data.email;

			return [
				// `requestedFor` cleared on a new attempt, so the confirmation below
				// can never name an address from a previous one.
				{ ...cleared, status: 'submitting', error: null, requestedFor: null },
				Effect.batch(
					formEffect,
					Effect.cancellable<MagicLinkRequestAction>(
						REQUEST_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								await deps.requestMagicLink(email, signal);
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
			return [
				{ ...state, status: 'sent', error: null, requestedFor: action.email },
				Effect.none()
			];
		}

		case 'requestFailed': {
			// Back to `idle`, with `error` doing the talking — the field is still on
			// screen and a retry is genuinely useful here, unlike the sign-in half.
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
}

export function createMagicLinkRequestStore(
	deps: MagicLinkRequestDependencies,
	fields?: Partial<MagicLinkFields>
): Store<MagicLinkRequestState, MagicLinkRequestAction> {
	return createStore({
		initialState: createInitialMagicLinkRequestState(fields),
		reducer: magicLinkRequestReducer,
		dependencies: deps
	});
}
