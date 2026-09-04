/**
 * Starting an OAuth sign-in.
 *
 * The half that runs on the page with the buttons on it. It has no success
 * action, because success is the page going away: the terminal state is
 * `redirecting`, and what happens next happens in a different document with a
 * different store. `oauth-callback` is the other half.
 *
 * No form, like `email-verification` — the only input is which button was
 * pressed.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { OAuthIntent, OAuthProvider, PendingOAuthStorage } from '../oauth-pending.js';
import type { Redirect } from './redirect.js';

export type OAuthStartStatus =
	/** Nothing in flight, or a failure to read. */
	| 'idle'
	/** Asking the backend where to send the browser. */
	| 'starting'
	/**
	 * The record is stored and the navigation has been asked for.
	 *
	 * Terminal in this store, and only a navigation leaves it — which is exactly
	 * why nothing guards against re-entering it. See the reducer.
	 */
	| 'redirecting';

export interface OAuthStartState {
	status: OAuthStartStatus;
	/**
	 * Which provider the attempt in flight is for; `null` when idle.
	 *
	 * Not a boolean `isBusy`. With four buttons on screen a single flag disables
	 * all four and names none of them, and the stale-answer guards in the reducer
	 * need to know which reply belongs to which click. This is the same defect
	 * shape as the shared copy flag `MfaEnrolment` was carrying — one boolean
	 * standing in for several distinguishable things.
	 */
	provider: OAuthProvider | null;
	error: AuthError | null;
}

export type OAuthStartAction =
	/** A provider button was pressed. */
	| {
			type: 'authorizationRequested';
			provider: OAuthProvider;
			/**
			 * Sign in, or attach this provider to the account already signed in.
			 *
			 * Defaults to `'signIn'` at the reducer, so every existing caller keeps
			 * working — but it is written into the pending record explicitly, and
			 * the record's validator refuses one without it.
			 */
			intent?: OAuthIntent | undefined;
			/** Where to land afterwards. Normalised to a same-origin path or dropped. */
			returnTo?: string | null | undefined;
	  }
	/** Effect feedback: the backend said where to go. */
	| {
			type: 'authorizationReady';
			provider: OAuthProvider;
			intent: OAuthIntent;
			authorizeUrl: string;
			state: string;
			returnTo: string | null;
	  }
	/** Effect feedback: the start failed, or the record could not be stored. */
	| { type: 'authorizationFailed'; provider: OAuthProvider; error: AuthError }
	| { type: 'errorDismissed' };

export interface OAuthStartDependencies {
	beginOAuth: AuthDependencies['beginOAuth'];
	/**
	 * Where the nonce is parked across the redirect.
	 *
	 * On this interface rather than on `AuthDependencies`, which is documented as
	 * the auth I/O whose "every member reports failure by rejecting with an
	 * `AuthError`". Storage is neither I/O nor a source of `AuthError`s, and
	 * widening that contract to fit it would weaken a promise eleven other
	 * members keep.
	 */
	pendingOAuth: PendingOAuthStorage;
	/** How the browser leaves. Injected so a test can watch and a demo can refuse. */
	redirect: Redirect;
}
