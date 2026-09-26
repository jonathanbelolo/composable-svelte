/**
 * Using a sign-in link.
 *
 * **The token is spent on a press, not on mount**, and that is the one thing
 * that makes this structurally unlike `email-verification` despite looking
 * identical from the outside.
 *
 * Corporate mail scanners and link prefetchers follow links before a person
 * does. For a verification link that costs little — the address gets verified,
 * which is what the link was for. For a *sign-in* link it means the token is
 * spent before the user ever sees the page, so their link is dead on arrival
 * and the replacement they request is eaten the same way. A scanner issues a
 * GET; it does not press buttons. So the exchange waits for one.
 *
 * The pleasant side effect: no work starts from an effect, so none of the
 * mount-guard machinery `email-verification` and `MfaEnrolment` need exists
 * here, and neither does the class of defect that comes with it.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';

export type MagicLinkSignInStatus = 'idle' | 'submitting' | 'succeeded';

export interface MagicLinkSignInState {
	status: MagicLinkSignInStatus;
	/**
	 * The token from the link, or `null`.
	 *
	 * `null` is a state to render rather than an error: someone reached the page
	 * directly, or a mail client mangled the link, and the useful offer is a new
	 * one — the same shape `reset-password` uses for its missing token.
	 */
	token: string | null;
	error: AuthError | null;
	session: SessionSnapshot | null;
	/**
	 * One-reduction marker: the terminal verdict admitted in this reduction,
	 * cleared before every other action.
	 */
	settled: 'succeeded' | 'failed' | null;
	/**
	 * Monotonically increasing attempt id for effect correlation.
	 * Incremented on every token change and submission start, so that late or
	 * stale results from cancelled or superseded attempts are discarded.
	 */
	attempt: number;
}

export type MagicLinkSignInAction =
	/** Hand the flow the token from the URL. */
	| { type: 'tokenProvided'; token: string }
	/** The user pressed the button. The only thing that spends the token. */
	| { type: 'signInRequested' }
	| { type: 'signInSucceeded'; session: SessionSnapshot; attempt?: number }
	| { type: 'signInFailed'; error: AuthError; attempt?: number }
	| { type: 'errorDismissed' }
	/** "Send me a new link", from an expired or missing link. */
	| { type: 'requestNewLinkRequested' }
	/** "Start again" or "Sign in another way", to return to sign-in. */
	| { type: 'startOverRequested' };

export interface MagicLinkSignInDependencies {
	signInWithMagicLink: AuthDependencies['signInWithMagicLink'];
}
