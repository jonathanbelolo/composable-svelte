import { createStore, Effect, type Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type { AuthError } from '../../errors/types.js';
import type { PendingOAuth } from '../oauth-pending.js';
import type {
	OAuthCallbackAction,
	OAuthCallbackDependencies,
	OAuthCallbackParams,
	OAuthCallbackState
} from './types.js';

const CALLBACK_EFFECT_ID = 'auth/flows/oauth-callback';

/**
 * What an OAuth error code is allowed to look like before it is shown.
 *
 * `?error=` is whatever a link carries. Svelte escapes, so this is not a
 * scripting hole — but a message in the application's own chrome saying
 * "Your account is locked, call 1-800-…" is a phishing surface regardless, and
 * the whole point of a callback page is that the user arrives at it by
 * following a link someone else may have sent.
 *
 * Real OAuth 2.0 error codes are lowercase ASCII with underscores, so the shape
 * check costs nothing and refuses everything else.
 */
const SAFE_ERROR_CODE = /^[a-z_]{1,64}$/;

/**
 * The callback query from a URL.
 *
 * Takes a full URL **string** rather than reading `window.location`, exactly as
 * `tokenFromUrl` does and for the same reasons: it works on a server and it can
 * be driven from a test. Returns all-nulls rather than throwing for anything
 * that is not a URL.
 */
export function oauthParamsFromUrl(url: string): OAuthCallbackParams {
	const empty: OAuthCallbackParams = {
		code: null,
		state: null,
		error: null,
		errorDescription: null
	};

	let params: URLSearchParams;
	try {
		params = new URL(url).searchParams;
	} catch {
		return empty;
	}

	// An empty parameter is a missing one — `?code=` reaches here when something
	// mangles the redirect, and sending "" onward just produces a confusing
	// failure. The same rule `tokenFromUrl` applies.
	const read = (name: string): string | null => {
		const value = params.get(name);
		return value === null || value === '' ? null : value;
	};

	return {
		code: read('code'),
		state: read('state'),
		error: read('error'),
		errorDescription: read('error_description')
	};
}

/** The provider refused, or the user did. */
function providerError(code: string, provider: string | undefined): AuthError {
	if (code === 'access_denied') {
		return {
			code: 'oauth_denied',
			message: 'You cancelled that sign-in. Nothing has changed.',
			...(provider !== undefined && { provider })
		};
	}

	// Everything else — `server_error`, `temporarily_unavailable`,
	// `invalid_scope`, `unauthorized_client` — becomes `unknown`, and that is
	// not indecision. On this page every failure has the same recovery, because
	// the code is dead whatever went wrong, so the retryable/not distinction the
	// union exists to draw has no consumer here. `unknown` also means
	// `retryDelaySeconds` returns null, which is right: none of these becomes
	// true by waiting.
	//
	// The code itself goes in the message, for the reason `UnknownAuthError`
	// documents about carrying `status` — "unknown" plus a code is a far better
	// bug report than "unknown". Only after the shape check.
	const named = SAFE_ERROR_CODE.test(code) ? ` (${code})` : '';
	return {
		code: 'unknown',
		message: `That sign-in could not be completed${named}.`
	};
}

/** Cannot verify. Carries nothing else — see `OAuthStateMismatchError`. */
function stateMismatch(): AuthError {
	return {
		code: 'oauth_state_mismatch',
		message: 'That sign-in link has already been used, or is no longer valid.'
	};
}

export function createInitialOAuthCallbackState(): OAuthCallbackState {
	return { status: 'idle', error: null, session: null, returnTo: null };
}

export function oauthCallbackReducer(
	state: OAuthCallbackState,
	action: OAuthCallbackAction,
	deps: OAuthCallbackDependencies
): readonly [OAuthCallbackState, Effect<OAuthCallbackAction>] {
	switch (action.type) {
		case 'callbackReceived': {
			// **Total**, unlike `email-verification`'s equivalent. That flow must
			// leave `idle` open so a fresh token can be tried after a failure; here
			// there is no such case, because a fresh code arrives only with a new
			// page load and a new page load destroys this store. Being total is what
			// makes the component's own flag redundancy rather than the mechanism —
			// so a mistake there cannot cost a double exchange.
			if (state.status !== 'idle') {
				return [state, Effect.none()];
			}

			const { params } = action;

			return [
				{ ...state, status: 'exchanging', error: null },
				Effect.cancellable<OAuthCallbackAction>(
					CALLBACK_EFFECT_ID,
					async (dispatch, signal) => {
						// Taken first and unconditionally: the attempt is over however
						// this ends, and a record left behind is a live nonce that the
						// next page load could match.
						//
						// Wrapped even though the interface says `take` never throws, and
						// both implementations here honour that. A consumer-supplied one
						// might not, and an escaped throw is the worst available failure:
						// `exchanging` is not terminal, so the page sits on "Finishing
						// your sign-in…" forever with nothing to click. `null` lands on
						// `oauth_state_mismatch`, which means "cannot verify" — the honest
						// verdict when the record cannot be read.
						let pending: PendingOAuth | null;
						try {
							pending = deps.pendingOAuth.take();
						} catch {
							pending = null;
						}

						// The provider's refusal is read **before** the state check and
						// is not gated on it. Gating would turn "you pressed Cancel"
						// into a security alarm for anyone whose record was overwritten
						// by a second attempt in the same tab; not gating costs nothing,
						// because a forged `?error=` can only produce a screen that
						// offers to start again. Nothing is created and nothing spent.
						if (params.error !== null) {
							dispatch({
								type: 'exchangeFailed',
								error: providerError(params.error, pending?.provider)
							});
							return;
						}

						// The CSRF gate. Absence and inequality share an arm on purpose:
						// the recovery is identical, and saying which it was tells an
						// attacker whether a sign-in was in progress — the reasoning
						// `verifyEmail` already gives for not separating a stale token
						// from a malformed one.
						if (pending === null || params.state === null || params.state !== pending.state) {
							dispatch({ type: 'exchangeFailed', error: stateMismatch() });
							return;
						}

						if (params.code === null) {
							dispatch({
								type: 'exchangeFailed',
								error: {
									code: 'unknown',
									message: 'That sign-in came back without an authorization code.'
								}
							});
							return;
						}

						const { code } = params;

						try {
							// `pending.provider`, never anything from the URL. The provider
							// has to come from the trusted side of the gate, or the gate
							// is decorative.
							const session = await deps.completeOAuth(
								pending.provider,
								code,
								pending.state,
								signal
							);
							dispatch({ type: 'exchangeSucceeded', session, returnTo: pending.returnTo });
						} catch (error) {
							dispatch({ type: 'exchangeFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'exchangeSucceeded': {
			return [
				{
					...state,
					status: 'completed',
					error: null,
					session: action.session,
					returnTo: action.returnTo
				},
				Effect.none()
			];
		}

		case 'exchangeFailed': {
			return [{ ...state, status: 'failed', error: action.error }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
}

export function createOAuthCallbackStore(
	deps: OAuthCallbackDependencies
): Store<OAuthCallbackState, OAuthCallbackAction> {
	return createStore({
		initialState: createInitialOAuthCallbackState(),
		reducer: oauthCallbackReducer,
		dependencies: deps
	});
}
