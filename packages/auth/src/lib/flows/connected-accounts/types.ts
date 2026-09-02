/**
 * The providers attached to an account.
 *
 * **This flow owns detaching only.** Attaching is `oauth-start` with
 * `intent: 'link'` — the same redirect, the same pending record, the same
 * callback — because a parallel link flow would drift from the one two rounds of
 * review have already hardened. The panel drives both stores; only this half has
 * state worth keeping.
 *
 * ## Why detaching is offered rather than judged
 *
 * The obvious client-side rule is `hasPassword || providers.length > 1`, and it
 * is wrong in a way that matters: **a magic link is also a way in**, and nothing
 * in `AccountSnapshot` says whether the backend offers them. An account with no
 * password and one provider may be perfectly safe to detach from, and the
 * obvious rule locks that user out of a button that would have worked.
 *
 * So the same principle the re-authentication arm settled applies again — the
 * backend decides, the client explains. Detaching is offered; a backend that
 * would strand the user refuses with its own message, and the panel shows it
 * with the route out. What the client *can* say truthfully it says as an
 * advisory, never as a disabled button.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';

export type ConnectedAccountsStatus = 'idle' | 'unlinking';

export interface ConnectedAccountsState {
	status: ConnectedAccountsStatus;
	/**
	 * Which provider the attempt in flight is for, or which one `error` is about.
	 *
	 * Not a boolean, for the reason `OAuthStartState.provider` gives: with a row
	 * per provider a single flag disables every row and names none of them, and
	 * the stale-answer guards need to know which reply belongs to which click.
	 */
	provider: string | null;
	/**
	 * Providers detached during this session, before the account has been re-read.
	 *
	 * The account is the truth, but it lags: a surface calls `reloadRequested` on
	 * success and the row stays on screen until that lands, offering a second
	 * click that can only fail. This is the same local-knowledge-ahead-of-the-read
	 * duplication as `mfa-management`'s `disabled` status, and it is justified the
	 * same way — it records something the read model does not know yet.
	 *
	 * **Pruned by `providersObserved` once the read lands.** An entry's whole job
	 * is to cover the window before the account catches up, so the moment the
	 * account stops reporting that provider the entry is done and goes.
	 *
	 * Without that pruning this list only ever grows, and a provider detached and
	 * then re-attached stays hidden forever — with no Disconnect row, while
	 * simultaneously being offered under Connect, because both derive from here.
	 * An earlier version of this comment claimed the panel unioned the two lists;
	 * it subtracted, and nothing tested a re-attach.
	 */
	unlinked: readonly string[];
	error: AuthError | null;
}

export type ConnectedAccountsAction =
	| { type: 'unlinkRequested'; provider: string }
	| { type: 'unlinkSucceeded'; provider: string }
	| { type: 'unlinkFailed'; provider: string; error: AuthError }
	/**
	 * What the account currently reports. Dispatched by the surface whenever the
	 * read changes, so `unlinked` cannot outlive its usefulness.
	 */
	| { type: 'providersObserved'; providers: readonly string[] }
	| { type: 'errorDismissed' };

export interface ConnectedAccountsDependencies {
	unlinkOAuthProvider: AuthDependencies['unlinkOAuthProvider'];
}
