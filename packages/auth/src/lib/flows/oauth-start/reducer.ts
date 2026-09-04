import { createStore, Effect, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import { normaliseReturnTo } from '../oauth-pending.js';
import type {
	OAuthStartAction,
	OAuthStartDependencies,
	OAuthStartState
} from './types.js';

/**
 * Fixed, so a second button press supersedes the first rather than racing it.
 *
 * One id and not two: there is only one operation here, and the store-and-go
 * step deliberately runs inside the same effect as the request that produced it.
 */
const START_EFFECT_ID = 'auth/flows/oauth-start';

export function createInitialOAuthStartState(): OAuthStartState {
	return { status: 'idle', provider: null, error: null };
}

export function oauthStartReducer(
	state: OAuthStartState,
	action: OAuthStartAction,
	deps: OAuthStartDependencies
): readonly [OAuthStartState, Effect<OAuthStartAction>] {
	switch (action.type) {
		case 'authorizationRequested': {
			// **No status guard, deliberately.** The same reasoning `sessionReducer`
			// gives for its `logout` arm: a guard here would make `redirecting` a
			// trap. Only a navigation leaves that status, so if the navigation is
			// slow, blocked by an extension, or simply does not happen, every button
			// on the page is refused with no way out and no error to explain it.
			//
			// Nothing is lost by omitting it. The fixed cancellation id gives what a
			// guard would have protected — a second press supersedes the first — and
			// the two arms below discard the superseded answer when it lands.
			const { provider } = action;
			const intent = action.intent ?? 'signIn';
			const returnTo = normaliseReturnTo(action.returnTo);

			return [
				{ ...state, status: 'starting', provider, error: null },
				Effect.cancellable<OAuthStartAction>(START_EFFECT_ID, async (dispatch, signal) => {
					try {
						const start = await deps.beginOAuth(provider, signal);
						dispatch({
							type: 'authorizationReady',
							provider,
							intent,
							authorizeUrl: start.authorizeUrl,
							state: start.state,
							returnTo
						});
					} catch (error) {
						dispatch({ type: 'authorizationFailed', provider, error: toAuthError(error) });
					}
				})
			];
		}

		case 'authorizationReady': {
			// Both clauses are pure reads with no side effect and no reactive
			// tracking, so the order of the `||` changes nothing. Said out loud
			// because the last review found a guard that worked *only* because
			// `started ||` short-circuited before a status read — a guard resting on
			// clause order. This one cannot: swap the two and it behaves identically.
			if (state.status !== 'starting' || action.provider !== state.provider) {
				return [state, Effect.none()];
			}

			const { provider, intent, authorizeUrl, state: nonce, returnTo } = action;

			return [
				{ ...state, status: 'redirecting', error: null },
				// **One effect, not `Effect.batch`.** Storing has to happen before
				// leaving: a redirect that got out first would land the user on a
				// callback page with no record to verify against, and a perfectly
				// legitimate sign-in would be reported as a CSRF failure.
				//
				// Measured, so the claim is accurate: a batch *does* preserve the
				// order today, because the store runs members with a plain `forEach`
				// and both operations here are synchronous. But `Effect.batch`'s own
				// contract is "execute in parallel", so that ordering is an
				// implementation accident and not a promise. Depending on it would be
				// the same shape of mistake as the guard that worked only because of
				// clause short-circuiting — right today, silently wrong later.
				Effect.run<OAuthStartAction>(async (dispatch) => {
					try {
						deps.pendingOAuth.put({ provider, intent, state: nonce, returnTo });
					} catch (error) {
						// Storing failed, so do not navigate. Leaving now would spend a
						// real authorization round trip to arrive at an unverifiable
						// callback; failing here keeps the user on a page that still has
						// buttons and an error region.
						dispatch({ type: 'authorizationFailed', provider, error: toAuthError(error) });
						return;
					}
					try {
						deps.redirect(authorizeUrl);
					} catch (error) {
						// The redirect refuses a URL that is not `http(s):`, and a
						// consumer-supplied one may refuse for its own reasons. Without
						// this the throw escapes the effect and `redirecting` — a status
						// only a navigation leaves — becomes permanent, with `error` null
						// and the button reading "Taking you to GitHub…" forever.
						//
						// The same species as the `take()` throw in `oauth-callback`, and
						// it was left open in the same change that closed that one. The
						// lesson is that every `deps.*` call reachable from an effect
						// needs a catch, not just the awaited ones.
						dispatch({ type: 'authorizationFailed', provider, error: toAuthError(error) });
					}
				})
			];
		}

		case 'authorizationFailed': {
			// Guarded on the provider only, and **not** on status. The storage
			// failure above dispatches this while the status is already
			// `redirecting`, so a `status === 'starting'` clause would swallow the
			// one failure the user most needs to see.
			if (action.provider !== state.provider) {
				return [state, Effect.none()];
			}
			// Back to `idle` with `error` doing the talking, as every other flow
			// here does. `idle` is a usable state: the buttons never left the page.
			return [{ ...state, status: 'idle', provider: null, error: action.error }, Effect.none()];
		}

		case 'errorDismissed': {
			// The same object when there is nothing to clear — an identical one
			// still notifies every subscriber.
			return [state.error === null ? state : { ...state, error: null }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
}

export function createOAuthStartStore(
	deps: OAuthStartDependencies
): Store<OAuthStartState, OAuthStartAction> {
	return createStore({
		initialState: createInitialOAuthStartState(),
		reducer: oauthStartReducer,
		dependencies: deps
	});
}
