/**
 * The management flow.
 *
 * Two effect ids, as `mfa-enrolment` has, because the operations are
 * independent — cancelling a repeated disable must not cancel a regeneration.
 *
 * But unlike that flow, the *guard* is shared: neither operation starts while
 * either is in flight. They are not independent in the way two ids suggest —
 * disabling mid-regeneration issues codes for an authenticator that is about to
 * stop existing, and the order the backend happens to apply them in is not
 * something a client should be betting on.
 */

import { createStore, Effect, type Reducer, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	MfaManagementAction,
	MfaManagementDependencies,
	MfaManagementState
} from './types.js';

const DISABLE_EFFECT_ID = 'auth/flows/mfa-management/disable';
const REGENERATE_EFFECT_ID = 'auth/flows/mfa-management/regenerate';

export function createInitialMfaManagementState(): MfaManagementState {
	return { status: 'idle', recoveryCodes: null, error: null, operation: null };
}

/** Whether an operation may start. See the note at the top about the shared guard. */
function isBusy(state: MfaManagementState): boolean {
	return state.status === 'disabling' || state.status === 'regenerating';
}

export const mfaManagementReducer: Reducer<
	MfaManagementState,
	MfaManagementAction,
	MfaManagementDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'disableRequested': {
			// `disabled` is refused as well as busy: it is already off, and a second
			// disable is a request the backend would answer with an error the user
			// cannot act on.
			if (isBusy(state) || state.status === 'disabled') {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					status: 'disabling',
					// Cleared before the request, not after it succeeds. Codes for an
					// authenticator being turned off are dead either way, and a failed
					// disable does not make them worth re-reading.
					recoveryCodes: null,
					error: null,
					operation: null
				},
				Effect.cancellable<MfaManagementAction>(DISABLE_EFFECT_ID, async (dispatch, signal) => {
					try {
						await deps.disableMfa(signal);
						dispatch({ type: 'disableSucceeded' });
					} catch (error) {
						dispatch({ type: 'disableFailed', error: toAuthError(error) });
					}
				})
			];
		}

		case 'disableSucceeded': {
			return [
				{ ...state, status: 'disabled', recoveryCodes: null, error: null, operation: null },
				Effect.none()
			];
		}

		case 'disableFailed': {
			// Back to `idle`, so it can be tried again — including after the user
			// satisfies a `reauthentication_required` demand, which is the commonest
			// reason this arm is reached.
			return [{ ...state, status: 'idle', error: action.error, operation: 'disable' }, Effect.none()];
		}

		case 'regenerateRequested': {
			if (isBusy(state) || state.status === 'disabled') {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					status: 'regenerating',
					// The set on screen is about to be invalidated by the set coming
					// back. Leaving it up while the new one is in flight is how a user
					// ends up saving the wrong ten strings.
					recoveryCodes: null,
					error: null,
					operation: null
				},
				Effect.cancellable<MfaManagementAction>(
					REGENERATE_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							const { recoveryCodes } = await deps.regenerateRecoveryCodes(signal);
							dispatch({ type: 'regenerateSucceeded', recoveryCodes });
						} catch (error) {
							dispatch({ type: 'regenerateFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'regenerateSucceeded': {
			return [
				{
					...state,
					status: 'idle',
					recoveryCodes: action.recoveryCodes,
					error: null,
					operation: null
				},
				Effect.none()
			];
		}

		case 'regenerateFailed': {
			return [
				{ ...state, status: 'idle', error: action.error, operation: 'regenerate' },
				Effect.none()
			];
		}

		case 'recoveryCodesAcknowledged': {
			return [
				state.recoveryCodes === null ? state : { ...state, recoveryCodes: null },
				Effect.none()
			];
		}

		case 'mfaObserved': {
			// The account is the truth; `disabled` was only ever this store's
			// memory of an operation it performed. Once the account says an
			// authenticator exists again, that memory is wrong.
			//
			// **Identical state object when nothing changes** — the surface
			// dispatches this from an effect, and a new object each time would
			// re-trigger it forever.
			if (!action.enabled || state.status !== 'disabled') return [state, Effect.none()];
			return [{ ...state, status: 'idle' }, Effect.none()];
		}

		case 'errorDismissed': {
			// `operation` goes with it — the field is documented as null exactly when
			// the error is, and this is the arm that would break that if it forgot.
			return [
				state.error === null ? state : { ...state, error: null, operation: null },
				Effect.none()
			];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
};

/**
 * A store for the MFA settings panel.
 *
 * @example
 * ```ts
 * import { createMfaManagementStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const mfa = createMfaManagementStore(createHttpAuthDeps());
 * ```
 */
export function createMfaManagementStore(
	deps: MfaManagementDependencies
): Store<MfaManagementState, MfaManagementAction> {
	return createStore({
		initialState: createInitialMfaManagementState(),
		reducer: mfaManagementReducer,
		dependencies: deps
	});
}
