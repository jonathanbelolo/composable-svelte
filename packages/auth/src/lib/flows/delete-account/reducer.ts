/**
 * The deletion flow.
 *
 * One fixed effect id: a double press supersedes rather than deleting twice.
 */

import { createStore, Effect, type Reducer, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	DeleteAccountAction,
	DeleteAccountDependencies,
	DeleteAccountState
} from './types.js';

const DELETE_EFFECT_ID = 'auth/flows/delete-account';

export function createInitialDeleteAccountState(): DeleteAccountState {
	return { status: 'idle', error: null };
}

export const deleteAccountReducer: Reducer<
	DeleteAccountState,
	DeleteAccountAction,
	DeleteAccountDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'confirmationRequested': {
			if (state.status !== 'idle') return [state, Effect.none()];
			return [{ ...state, status: 'confirming', error: null }, Effect.none()];
		}

		case 'confirmationDismissed': {
			// Refused while deleting: a confirmation that can be cancelled after the
			// request is out lies about what happened.
			if (state.status !== 'confirming') return [state, Effect.none()];
			return [{ ...state, status: 'idle' }, Effect.none()];
		}

		case 'deletionRequested': {
			// **The load-bearing guard.** Deleting is only reachable from
			// `confirming`, so the confirmation step is a property of the flow
			// rather than of whichever markup happens to be rendered. A consumer
			// who builds their own dialog, or none, cannot skip it by accident.
			if (state.status !== 'confirming') return [state, Effect.none()];

			return [
				{ ...state, status: 'deleting', error: null },
				Effect.cancellable<DeleteAccountAction>(DELETE_EFFECT_ID, async (dispatch, signal) => {
					try {
						await deps.deleteAccount(signal);
						dispatch({ type: 'deletionSucceeded' });
					} catch (error) {
						dispatch({ type: 'deletionFailed', error: toAuthError(error) });
					}
				})
			];
		}

		case 'deletionSucceeded': {
			return [{ status: 'deleted', error: null }, Effect.none()];
		}

		case 'deletionFailed': {
			// Back to `idle`, not to a failed status, and **not** to `confirming`.
			// `reauthentication_required` is the commonest arm here, and its
			// recovery is: prompt, sign in again, press again — which means asking
			// afresh, so the user re-confirms an action they may have been
			// interrupted out of.
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
 * A store for the delete-account panel.
 *
 * @example
 * ```ts
 * import { createDeleteAccountStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const deleteAccount = createDeleteAccountStore(createHttpAuthDeps());
 * ```
 */
export function createDeleteAccountStore(
	deps: DeleteAccountDependencies
): Store<DeleteAccountState, DeleteAccountAction> {
	return createStore({
		initialState: createInitialDeleteAccountState(),
		reducer: deleteAccountReducer,
		dependencies: deps
	});
}
