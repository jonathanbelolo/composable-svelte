import { createStore, Effect, type Reducer, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	ConnectedAccountsAction,
	ConnectedAccountsDependencies,
	ConnectedAccountsState
} from './types.js';

/**
 * Fixed, not per-provider.
 *
 * One detach at a time is the shape the guard below enforces anyway, and a
 * per-provider id would let two run concurrently against a backend whose answer
 * to "is this the last way in" depends on the order they land in.
 */
const UNLINK_EFFECT_ID = 'auth/flows/connected-accounts/unlink';

export function createInitialConnectedAccountsState(): ConnectedAccountsState {
	return { status: 'idle', provider: null, unlinked: [], error: null };
}

export const connectedAccountsReducer: Reducer<
	ConnectedAccountsState,
	ConnectedAccountsAction,
	ConnectedAccountsDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'unlinkRequested': {
			if (state.status === 'unlinking') {
				return [state, Effect.none()];
			}

			// Already gone as far as this flow knows. Refused rather than sent,
			// because the only possible answer is a backend error about a provider
			// the user can already see is not attached.
			if (state.unlinked.includes(action.provider)) {
				return [state, Effect.none()];
			}

			const { provider } = action;

			return [
				{ ...state, status: 'unlinking', provider, error: null },
				Effect.cancellable<ConnectedAccountsAction>(
					UNLINK_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							await deps.unlinkOAuthProvider(provider, signal);
							dispatch({ type: 'unlinkSucceeded', provider });
						} catch (error) {
							dispatch({ type: 'unlinkFailed', provider, error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'unlinkSucceeded': {
			// Both clauses are pure reads — the ordering note in `oauth-start`
			// applies here too, and swapping them changes nothing.
			if (state.status !== 'unlinking' || action.provider !== state.provider) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					status: 'idle',
					provider: null,
					// Guarded against a duplicate, so a re-attach followed by a second
					// detach does not leave the name in here twice.
					unlinked: state.unlinked.includes(action.provider)
						? state.unlinked
						: [...state.unlinked, action.provider],
					error: null
				},
				Effect.none()
			];
		}

		case 'unlinkFailed': {
			// Guarded on the provider only, not on status — the reasoning
			// `oauth-start` gives for the same arm. A refusal is the branch the user
			// most needs to see, and a status clause is how it gets swallowed.
			if (action.provider !== state.provider) {
				return [state, Effect.none()];
			}

			// `provider` is **kept**, unlike `oauth-start`, which nulls it. There the
			// error is one banner above a row of buttons; here it belongs beside the
			// row it is about, and a null would leave the panel unable to say which
			// provider was refused.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'providersObserved': {
			// Drops every entry the account no longer reports — that entry existed
			// only to cover the window before this read arrived.
			//
			// **Returns the identical state object when there is nothing to prune**,
			// which is load-bearing: the surface dispatches this from an effect, and
			// a fresh object every time would re-trigger it forever.
			if (state.unlinked.length === 0) return [state, Effect.none()];

			const pruned = state.unlinked.filter((id) => action.providers.includes(id));
			if (pruned.length === state.unlinked.length) return [state, Effect.none()];

			return [{ ...state, unlinked: pruned }, Effect.none()];
		}

		case 'errorDismissed': {
			return [
				state.error === null ? state : { ...state, provider: null, error: null },
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
 * A store for the connected-accounts panel.
 *
 * Pair it with an `oauth-start` store, which is what attaches a provider.
 *
 * @example
 * ```ts
 * import {
 *   createConnectedAccountsStore,
 *   createOAuthStartStore
 * } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const deps = createHttpAuthDeps();
 * const connected = createConnectedAccountsStore(deps);
 * ```
 */
export function createConnectedAccountsStore(
	deps: ConnectedAccountsDependencies
): Store<ConnectedAccountsState, ConnectedAccountsAction> {
	return createStore({
		initialState: createInitialConnectedAccountsState(),
		reducer: connectedAccountsReducer,
		dependencies: deps
	});
}
