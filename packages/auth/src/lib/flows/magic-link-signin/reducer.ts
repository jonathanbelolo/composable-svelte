import { createStore, Effect, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	MagicLinkSignInAction,
	MagicLinkSignInDependencies,
	MagicLinkSignInState
} from './types.js';

/** Fixed, so a double press supersedes rather than spending the token twice. */
const SIGNIN_EFFECT_ID = 'auth/flows/magic-link-signin';

export function createInitialMagicLinkSignInState(
	token: string | null = null
): MagicLinkSignInState {
	return { status: 'idle', token, error: null, session: null };
}

export function magicLinkSignInReducer(
	state: MagicLinkSignInState,
	action: MagicLinkSignInAction,
	deps: MagicLinkSignInDependencies
): readonly [MagicLinkSignInState, Effect<MagicLinkSignInAction>] {
	switch (action.type) {
		case 'tokenProvided': {
			// Replaces whatever was there, including a previous failure: a new link
			// is not answerable for the last one. Refused once signed in, because a
			// second token arriving then would offer to spend it for no reason.
			if (state.status === 'succeeded') {
				return [state, Effect.none()];
			}
			return [{ ...state, token: action.token, error: null }, Effect.none()];
		}

		case 'signInRequested': {
			// Guarded, because a double press would spend a single-use token twice
			// — and the second spend fails, so the user who double-clicked sees
			// "this link is no longer valid" for a link that just worked.
			//
			// Written as separate statements rather than one `||`, and both read
			// state rather than a flag, so neither clause is load-bearing for the
			// other. A guard that works only because of short-circuit order is one
			// this package has shipped before.
			if (state.status !== 'idle') return [state, Effect.none()];
			if (state.token === null) return [state, Effect.none()];

			const { token } = state;

			return [
				{ ...state, status: 'submitting', error: null, session: null },
				Effect.cancellable<MagicLinkSignInAction>(
					SIGNIN_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							const session = await deps.signInWithMagicLink(token, signal);
							dispatch({ type: 'signInSucceeded', session });
						} catch (error) {
							dispatch({ type: 'signInFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'signInSucceeded': {
			return [
				{ ...state, status: 'succeeded', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'signInFailed': {
			// Back to `idle`, unlike the OAuth callback, which is terminal.
			//
			// The difference is real rather than stylistic. An OAuth code is spent
			// at the provider before the app ever hears about it, so nothing can
			// succeed from `idle` there. Here a `network` failure may mean the
			// request never arrived and the token is untouched, so pressing again
			// is a genuine recovery. `token_expired` is the one that is not, and
			// the surface branches on that to offer a new link instead.
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

export function createMagicLinkSignInStore(
	deps: MagicLinkSignInDependencies,
	token: string | null = null
): Store<MagicLinkSignInState, MagicLinkSignInAction> {
	return createStore({
		initialState: createInitialMagicLinkSignInState(token),
		reducer: magicLinkSignInReducer,
		dependencies: deps
	});
}
