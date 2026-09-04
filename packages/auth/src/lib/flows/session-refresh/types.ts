/**
 * Keeping a session alive, and noticing when it is not.
 *
 * **There is no bearer token here and there must not be one.** The session
 * cookie is HttpOnly and server-owned; the client never holds a credential and
 * cannot read one. A refresh token reachable by JavaScript is exfiltrable by
 * any XSS, which is precisely what the cookie design avoids — so "token
 * refresh" in this architecture means asking the server to extend the session
 * it already owns, and nothing else.
 *
 * The server's half is a sliding idle window under a non-sliding absolute cap.
 * Without the cap a session used often enough never expires at all.
 */

import type { Clock } from '@composable-svelte/core';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';

export type SessionRefreshStatus =
	/** Nothing in flight. There may or may not be an expiry to watch. */
	| 'idle'
	| 'refreshing'
	/** The backend says there is no live session. Stop asking. */
	| 'ended';

/**
 * There is no `refreshed` status.
 *
 * It would duplicate `expiresAt`, and after a refresh the flow really is idle.
 * The `regenerated` lesson from `mfa-management`.
 */
export interface SessionRefreshState {
	status: SessionRefreshStatus;
	/** Advisory, ISO 8601, or `null` when the backend states none. */
	expiresAt: string | null;
	error: AuthError | null;
}

export type SessionRefreshAction =
	/** Begin watching. The surface dispatches this on mount. */
	| { type: 'watchStarted' }
	| { type: 'watchStopped' }
	/** "Look again." Emitted by the watch; deciding is the reducer's job. */
	| { type: 'ticked' }
	/** The expiry the session store currently holds. */
	| { type: 'expiryObserved'; expiresAt: string | null }
	| { type: 'refreshRequested' }
	| { type: 'refreshSucceeded'; expiresAt: string | null }
	| { type: 'refreshFailed'; error: AuthError }
	| { type: 'errorDismissed' };

/**
 * The deps object is this flow's whole configuration, the way
 * `OAuthStartDependencies` carries `pendingOAuth` and `redirect`.
 */
export interface SessionRefreshDependencies {
	refreshSession: AuthDependencies['refreshSession'];
	/**
	 * Injected so revalidation is testable with `createMockClock`.
	 *
	 * The decision "is it time yet" is then a pure function of state and this
	 * clock, which a `TestStore` can drive with no timers and no sleeping.
	 */
	clock: Clock;
	/** How long before expiry to refresh. */
	leadMs: number;
	/** How often the watch looks. This interval is also the rate floor. */
	tickMs: number;
}
