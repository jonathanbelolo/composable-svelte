/**
 * Deleting the account.
 *
 * Formless, like `mfa-management`, and for the same reason: there is nothing to
 * type. What there is instead is a confirmation step, and **it lives in the
 * reducer rather than only in the markup** — so a headless consumer and a
 * hand-rolled dialog get the same protection as the panel this ships with.
 *
 * Takes no password. The session says who is asking and the backend decides
 * whether that is enough; `reauthentication_required` is how it asks for more.
 * Removing an account is exactly the action that should demand proof, and
 * exactly the action a client cannot demand proof *for*, because it does not
 * know what proof the account can give.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';

export type DeleteAccountStatus =
	/** Nothing asked, or a failure to correct. */
	| 'idle'
	/** The surface is asking "are you sure". This is what drives a dialog. */
	| 'confirming'
	| 'deleting'
	/**
	 * The account is gone, and so is the session.
	 *
	 * Terminal, with **no way back** — unlike `mfa-management`'s `disabled`,
	 * which needed `mfaObserved` because it was a reachable dead end. Here the
	 * dead end is the point: there is no account left to reconcile against.
	 */
	| 'deleted';

export interface DeleteAccountState {
	status: DeleteAccountStatus;
	error: AuthError | null;
}

export type DeleteAccountAction =
	| { type: 'confirmationRequested' }
	| { type: 'confirmationDismissed' }
	| { type: 'deletionRequested' }
	| { type: 'deletionSucceeded' }
	| { type: 'deletionFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface DeleteAccountDependencies {
	deleteAccount: AuthDependencies['deleteAccount'];
}
