/**
 * Finishing an OAuth sign-in.
 *
 * The half that runs on the page the provider redirects back to. Structurally
 * this is `email-verification`: no form, work starts on mount, and a single-use
 * credential is exchanged exactly once. It departs from it in three places, and
 * each departure is commented where it happens rather than here, because each
 * one looks like an oversight otherwise.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { PendingOAuthStorage } from '../oauth-pending.js';

/**
 * The four query parameters an OAuth callback can arrive with.
 *
 * **Every field here is attacker-supplied.** Anyone can send a victim a link to
 * `/auth/callback?error=whatever`, so nothing in this object may be treated as
 * trustworthy and — see `error` — not all of it may be shown.
 */
export interface OAuthCallbackParams {
	code: string | null;
	state: string | null;
	/**
	 * The provider's own error code, verbatim.
	 *
	 * Echoed to the user **only** after a shape check, because a banner wearing
	 * the app's own chrome that renders arbitrary attacker text is a phishing
	 * surface even where it cannot be a scripting one.
	 */
	error: string | null;
	/**
	 * The provider's prose description.
	 *
	 * **Never rendered, on any branch.** Present so a consumer can log it. It is
	 * free-form attacker-controlled text and there is no shape check that would
	 * make it safe to show.
	 */
	errorDescription: string | null;
}

export type OAuthCallbackStatus =
	/** Nothing attempted yet. */
	| 'idle'
	/** Verifying and exchanging. */
	| 'exchanging'
	/** Signed in. `session` is populated. */
	| 'completed'
	/**
	 * Terminal failure. `error` says which.
	 *
	 * A real status, unlike every sibling flow, which returns to `idle` on
	 * failure so a fresh input can be tried. Nothing can be tried here: the
	 * authorization code is spent at the provider and the pending record has been
	 * consumed, and a *fresh* code would need a new page load, which destroys
	 * this store. Making it terminal is what lets the reducer's guard be total.
	 */
	| 'failed';

export interface OAuthCallbackState {
	status: OAuthCallbackStatus;
	error: AuthError | null;
	session: SessionSnapshot | null;
	/** Recovered from the pending record — a same-origin path, or `null`. */
	returnTo: string | null;
}

export type OAuthCallbackAction =
	/** The callback query. Dispatched on mount, once, by the surface. */
	| { type: 'callbackReceived'; params: OAuthCallbackParams }
	| { type: 'exchangeSucceeded'; session: SessionSnapshot; returnTo: string | null }
	| { type: 'exchangeFailed'; error: AuthError };

// There is deliberately no `errorDismissed`. The other flows have one because
// dismissing leaves a form or a button behind to try again with; here it would
// leave a blank page — the dead-end species, hand-built. Every failure branch
// renders wording plus a route out, and the route out is `onStartOver`.

export interface OAuthCallbackDependencies {
	completeOAuth: AuthDependencies['completeOAuth'];
	/** The record written before the redirect. See `OAuthStartDependencies`. */
	pendingOAuth: PendingOAuthStorage;
}
