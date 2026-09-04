/**
 * The confirm half of an email change.
 *
 * One fixed effect id: a second press supersedes rather than spending the token
 * twice.
 */

import { createStore, Effect, type Reducer, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	ChangeEmailConfirmAction,
	ChangeEmailConfirmDependencies,
	ChangeEmailConfirmState
} from './types.js';

const CONFIRM_EFFECT_ID = 'auth/flows/change-email-confirm';

export function createInitialChangeEmailConfirmState(): ChangeEmailConfirmState {
	return { status: 'idle', error: null, email: null };
}

export const changeEmailConfirmReducer: Reducer<
	ChangeEmailConfirmState,
	ChangeEmailConfirmAction,
	ChangeEmailConfirmDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'confirmationRequested': {
			// Refused once it has succeeded, and while one is already running. The
			// surface dispatches this from mount, and an effect re-runs for reasons
			// unrelated to the token — a prop changing, a parent re-rendering. A
			// second exchange of a single-use token is how a working link becomes a
			// spent one.
			//
			// Confirming on mount rather than on a press, unlike `MagicLinkSignIn`:
			// there, a mail scanner following a *sign-in* link spends the token
			// before its owner sees the page. That reasoning does not reach here —
			// a scanner that confirms an email change performs the change the user
			// asked for. (What a scanner must not do is confirm it for an account
			// it is not signed into, which is what requiring the session prevents.)
			if (state.status !== 'idle') {
				return [state, Effect.none()];
			}

			return [
				{ ...state, status: 'confirming', error: null },
				Effect.cancellable<ChangeEmailConfirmAction>(
					CONFIRM_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							const email = await deps.confirmEmailChange(action.token, signal);
							dispatch({ type: 'confirmationSucceeded', email });
						} catch (error) {
							dispatch({ type: 'confirmationFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'confirmationSucceeded': {
			return [{ status: 'confirmed', error: null, email: action.email }, Effect.none()];
		}

		case 'confirmationFailed': {
			// Back to `idle`, not to a failed status — `error` is what says it went
			// wrong. It also means a *new* token can be tried, which is what happens
			// when the user follows a link from a resent mail without reloading.
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
 * A store for the confirmation page.
 *
 * @example
 * ```ts
 * import { createChangeEmailConfirmStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const confirm = createChangeEmailConfirmStore(createHttpAuthDeps());
 * ```
 */
export function createChangeEmailConfirmStore(
	deps: ChangeEmailConfirmDependencies
): Store<ChangeEmailConfirmState, ChangeEmailConfirmAction> {
	return createStore({
		initialState: createInitialChangeEmailConfirmState(),
		reducer: changeEmailConfirmReducer,
		dependencies: deps
	});
}
