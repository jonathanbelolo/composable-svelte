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
import type { OAuthIntent, PendingOAuthStorage } from '../oauth-pending.js';

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
	/**
	 * Done. `session` is populated for a sign-in, and `null` for a link.
	 *
	 * One status for both outcomes, because every branch after this — focus, the
	 * way onward, the footer — is identical. What differs is `intent`, and a
	 * surface reads that rather than a second status it would have to keep in
	 * step.
	 */
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
	/**
	 * What the return was for, once the record has been read.
	 *
	 * `null` until then — and it stays `null` when the record could not be read
	 * at all, which is the branch that reports `oauth_state_mismatch`.
	 */
	intent: OAuthIntent | null;
	/**
	 * The session, for a sign-in.
	 *
	 * **Always `null` for a link**, and that is the point of the whole intent:
	 * attaching a provider to the account you are already in must not establish
	 * a second session.
	 */
	session: SessionSnapshot | null;
	/** Recovered from the pending record — a same-origin path, or `null`. */
	returnTo: string | null;
}

export type OAuthCallbackAction =
	/** The callback query. Dispatched on mount, once, by the surface. */
	| { type: 'callbackReceived'; params: OAuthCallbackParams }
	| {
			type: 'exchangeSucceeded';
			intent: OAuthIntent;
			/** `null` for a link — see the state field. */
			session: SessionSnapshot | null;
			returnTo: string | null;
	  }
	| {
			type: 'exchangeFailed';
			error: AuthError;
			/**
			 * What the return was for, if that could be established.
			 *
			 * `null` when the pending record could not be read — which is precisely
			 * the branch that cannot know. Carried on the failure too, because
			 * otherwise every failed *link* is worded as a failed sign-in, which is
			 * the wrong thing to tell someone who is already signed in.
			 */
			intent: OAuthIntent | null;
	  };

// There is deliberately no `errorDismissed`. The other flows have one because
// dismissing leaves a form or a button behind to try again with; here it would
// leave a blank page — the dead-end species, hand-built. Every failure branch
// renders wording plus a route out, and the route out is `onStartOver`.

export interface OAuthCallbackDependencies {
	completeOAuth: AuthDependencies['completeOAuth'];
	/**
	 * Attaching a provider instead of signing in.
	 *
	 * Optional: an app that never offers linking should not have to supply it,
	 * and a returning link record with no way to complete it is a configuration
	 * error the flow reports rather than crashes on.
	 */
	linkOAuthProvider?: AuthDependencies['linkOAuthProvider'] | undefined;
	/** The record written before the redirect. See `OAuthStartDependencies`. */
	pendingOAuth: PendingOAuthStorage;
}
