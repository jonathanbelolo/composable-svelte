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
	return { status: 'idle', token, error: null, session: null, settled: null, attempt: 0 };
}

export function magicLinkSignInReducer(
	state: MagicLinkSignInState,
	action: MagicLinkSignInAction,
	deps: MagicLinkSignInDependencies
): readonly [MagicLinkSignInState, Effect<MagicLinkSignInAction>] {
	const base = state.settled === null ? state : { ...state, settled: null };
	switch (action.type) {
		case 'tokenProvided': {
			// Refused once signed in, because a second token arriving then would
			// offer to spend it for no reason.
			if (base.status === 'succeeded') {
				return [base, Effect.none()];
			}
			// Same token is a no-op.
			if (action.token === base.token) {
				return [base, Effect.none()];
			}
			const nextAttempt = (base.attempt ?? 0) + 1;
			// If submitting and token genuinely changed:
			// Cancel in-flight SIGNIN_EFFECT_ID, reset status to idle, clear error, session, settled,
			// and increment attempt counter so any in-flight effect that escapes cancellation is discarded.
			if (base.status === 'submitting') {
				return [
					{
						...base,
						status: 'idle',
						token: action.token,
						error: null,
						session: null,
						settled: null,
						attempt: nextAttempt
					},
					Effect.cancel(SIGNIN_EFFECT_ID)
				];
			}
			return [
				{
					...base,
					token: action.token,
					error: null,
					settled: null,
					attempt: nextAttempt
				},
				Effect.none()
			];
		}

		case 'signInRequested': {
			// Guarded, because a double press would spend a single-use token twice
			// — and the second spend fails, so the user who double-clicks sees
			// "this link is no longer valid" for a link that just worked.
			//
			// Written as separate statements rather than one `||`, and both read
			// state rather than a flag, so neither clause is load-bearing for the
			// other. A guard that works only because of short-circuit order is one
			// this package has shipped before.
			if (base.status !== 'idle') return [base, Effect.none()];
			if (base.token === null) return [base, Effect.none()];

			const { token } = base;
			const attempt = (base.attempt ?? 0) + 1;

			return [
				{ ...base, status: 'submitting', error: null, session: null, settled: null, attempt },
				Effect.cancellable<MagicLinkSignInAction>(
					SIGNIN_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							const session = await deps.signInWithMagicLink(token, signal);
							if (signal?.aborted) return;
							dispatch({ type: 'signInSucceeded', session, attempt });
						} catch (error) {
							if (signal?.aborted) return;
							dispatch({ type: 'signInFailed', error: toAuthError(error), attempt });
						}
					}
				)
			];
		}

		case 'signInSucceeded': {
			// Only an in-flight exchange can settle with success. A replayed result,
			// or one arriving while idle or already succeeded, must not establish
			// a session or re-settle the flow.
			if (base.status !== 'submitting') {
				return [base, Effect.none()];
			}
			if (action.attempt !== undefined && action.attempt !== base.attempt) {
				return [base, Effect.none()];
			}
			return [
				{ ...base, status: 'succeeded', error: null, session: action.session, settled: 'succeeded' },
				Effect.none()
			];
		}

		case 'signInFailed': {
			// Only an in-flight exchange can fail.
			if (base.status !== 'submitting') {
				return [base, Effect.none()];
			}
			if (action.attempt !== undefined && action.attempt !== base.attempt) {
				return [base, Effect.none()];
			}
			// Back to `idle`, unlike the OAuth callback, which is terminal.
			//
			// The difference is real rather than stylistic. An OAuth code is spent
			// at the provider before the app ever hears about it, so nothing can
			// succeed from `idle` there. Here a `network` failure may mean the
			// request never arrived and the token is untouched, so pressing again
			// is a genuine recovery. `token_expired` is the one that is not, and
			// the surface branches on that to offer a new link instead.
			return [{ ...base, status: 'idle', error: action.error, settled: 'failed' }, Effect.none()];
		}

		case 'requestNewLinkRequested': {
			if (base.status === 'submitting') return [base, Effect.none()];
			return [base, Effect.none()];
		}

		case 'startOverRequested': {
			if (base.status === 'submitting') return [base, Effect.none()];
			return [base, Effect.none()];
		}

		case 'errorDismissed': {
			return [base.error === null ? base : { ...base, error: null }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [base, Effect.none()];
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
