import { createStore, Effect, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type { AccountAction, AccountDependencies, AccountState } from './types.js';

/** Fixed, so a refresh supersedes a load still in flight rather than racing it. */
const ACCOUNT_EFFECT_ID = 'auth/flows/account';

export function createInitialAccountState(): AccountState {
	return { status: 'idle', account: null, error: null };
}

/** The read, shared by both entry points. */
function load(deps: AccountDependencies): Effect<AccountAction> {
	return Effect.cancellable<AccountAction>(ACCOUNT_EFFECT_ID, async (dispatch, signal) => {
		try {
			const account = await deps.fetchAccount(signal);
			dispatch({ type: 'accountLoaded', account });
		} catch (error) {
			dispatch({ type: 'accountFailed', error: toAuthError(error) });
		}
	});
}

export function accountReducer(
	state: AccountState,
	action: AccountAction,
	deps: AccountDependencies
): readonly [AccountState, Effect<AccountAction>] {
	switch (action.type) {
		case 'accountRequested': {
			// Guarded, like `mfa-enrolment`'s start: the surface dispatches this
			// from a mount effect, and an effect re-runs for reasons unrelated to
			// its subject.
			//
			// **Total, not just "while busy".** `idle` is the only status that
			// admits a load, and nothing returns to it — a failure goes to
			// `failed`. An earlier version returned to `idle` so a retry was
			// possible, which re-armed the very condition the mount effect reads
			// and turned a down endpoint into an unbounded retry loop. Retrying is
			// `reloadRequested`, which is unguarded on purpose.
			if (state.status !== 'idle') {
				return [state, Effect.none()];
			}
			return [{ ...state, status: 'loading', error: null }, load(deps)];
		}

		case 'reloadRequested': {
			// Deliberately unguarded. The fixed effect id supersedes a read still
			// in flight, and `account` is kept rather than cleared so a panel does
			// not blank while refreshing — the stale-while-revalidate posture
			// `AuthGuard` already takes with a retained subject.
			return [{ ...state, status: 'loading', error: null }, load(deps)];
		}

		case 'accountLoaded': {
			return [{ ...state, status: 'loaded', account: action.account, error: null }, Effect.none()];
		}

		case 'accountFailed': {
			// `failed` when there is nothing to show — terminal to the mount
			// effect, retryable by `reloadRequested`. `loaded` when there is, so a
			// failed refresh does not throw away an account that is still on screen
			// and still true.
			return [
				{
					...state,
					status: state.account === null ? 'failed' : 'loaded',
					error: action.error
				},
				Effect.none()
			];
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

export function createAccountStore(
	deps: AccountDependencies
): Store<AccountState, AccountAction> {
	return createStore({
		initialState: createInitialAccountState(),
		reducer: accountReducer,
		dependencies: deps
	});
}
