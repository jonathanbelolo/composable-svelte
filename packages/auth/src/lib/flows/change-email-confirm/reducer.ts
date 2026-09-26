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

export function createInitialChangeEmailConfirmState(
	token: string | null = null
): ChangeEmailConfirmState {
	return { status: 'idle', token, error: null, email: null, settled: null, attempt: 0 };
}

export const changeEmailConfirmReducer: Reducer<
	ChangeEmailConfirmState,
	ChangeEmailConfirmAction,
	ChangeEmailConfirmDependencies
> = (state, action, deps) => {
	const base = state.settled === null ? state : { ...state, settled: null };
	return reduceChangeEmailConfirm(base, action, deps);
};

function reduceChangeEmailConfirm(
	state: ChangeEmailConfirmState,
	action: ChangeEmailConfirmAction,
	deps: ChangeEmailConfirmDependencies
): readonly [ChangeEmailConfirmState, Effect<ChangeEmailConfirmAction>] {
	switch (action.type) {
		case 'tokenProvided': {
			if (state.status === 'confirmed') {
				return [state, Effect.none()];
			}
			if (action.token === (state.token ?? null)) {
				return [state, Effect.none()];
			}
			if (state.status === 'confirming') {
				const nextAttempt = (state.attempt ?? 0) + 1;
				return [
					{
						...state,
						status: 'idle',
						token: action.token,
						error: null,
						email: null,
						settled: null,
						attempt: nextAttempt
					},
					Effect.cancel<ChangeEmailConfirmAction>(CONFIRM_EFFECT_ID)
				];
			}
			return [
				{
					...state,
					token: action.token,
					error: null,
					settled: null,
					attempt: 0
				},
				Effect.none()
			];
		}

		case 'confirmationRequested': {
			// Refused once it has succeeded, or while the same token is running. The
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
			if (state.status === 'confirmed') {
				return [state, Effect.none()];
			}
			// Same token while in flight is a duplicate dispatch — ignore.
			if (state.status === 'confirming' && state.token === action.token) {
				return [state, Effect.none()];
			}

			const token = action.token;
			const attempt = (state.attempt ?? 0) + 1;
			const cancelPrevious =
				state.status === 'confirming'
					? Effect.cancel<ChangeEmailConfirmAction>(CONFIRM_EFFECT_ID)
					: Effect.none();

			return [
				{ ...state, status: 'confirming', token, error: null, email: null, settled: null, attempt },
				Effect.batch(
					cancelPrevious,
					Effect.cancellable<ChangeEmailConfirmAction>(
						CONFIRM_EFFECT_ID,
						async (dispatch, signal) => {
							try {
								const email = await deps.confirmEmailChange(token, signal);
								if (signal?.aborted) return;
								dispatch({ type: 'confirmationSucceeded', email, attempt });
							} catch (error) {
								if (signal?.aborted) return;
								dispatch({ type: 'confirmationFailed', error: toAuthError(error), attempt });
							}
						}
					)
				)
			];
		}

		case 'confirmationSucceeded': {
			// A stale attempt from a cancelled/superseded token is dropped.
			if (action.attempt !== undefined && state.attempt !== undefined && action.attempt !== state.attempt) {
				return [state, Effect.none()];
			}
			return [
				{
					...state,
					status: 'confirmed',
					error: null,
					email: action.email,
					settled: state.status === 'confirming' ? 'confirmed' : null
				},
				Effect.none()
			];
		}

		case 'confirmationFailed': {
			// Back to `idle`, not to a failed status — `error` is what says it went
			// wrong. It also means a *new* token can be tried, which is what happens
			// when the user follows a link from a resent mail without reloading.
			if (action.attempt !== undefined && state.attempt !== undefined && action.attempt !== state.attempt) {
				return [state, Effect.none()];
			}
			return [
				{
					...state,
					status: 'idle',
					error: action.error,
					settled: state.status === 'confirming' ? 'failed' : null
				},
				Effect.none()
			];
		}

		case 'signInRequested': {
			return [state, Effect.none()];
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
