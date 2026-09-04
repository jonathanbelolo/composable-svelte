/**
 * Confirming an email change from the link.
 *
 * Formless, like `email-verification`: the input is a token that arrived in a
 * link, so the work starts on mount rather than on submit.
 *
 * **A live session is required**, and that is a deliberate cost. Accepting the
 * token alone would let a forwarded mail, a shared inbox or a mail scanner
 * complete an identity change silently — and unlike verifying an address, which
 * is what the link was for anyway, this *moves* the account. The price is real:
 * a user opening the link on a phone they are not signed in on gets a 401. That
 * is why `EmailChangeConfirmation` requires an `onSignIn` prop, so the cliff is
 * never a dead end.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';

export type ChangeEmailConfirmStatus = 'idle' | 'confirming' | 'confirmed';

export interface ChangeEmailConfirmState {
	status: ChangeEmailConfirmStatus;
	/**
	 * Why confirming failed, or `null`.
	 *
	 * `token_expired` is the ordinary one — a link opened a week late — and the
	 * recovery is a fresh request rather than a retry. `invalid_credentials`
	 * means there is no session, which is the phone case.
	 */
	error: AuthError | null;
	/** The address now on the account, once confirmed. `null` before that. */
	email: string | null;
}

export type ChangeEmailConfirmAction =
	| { type: 'confirmationRequested'; token: string }
	| { type: 'confirmationSucceeded'; email: string }
	| { type: 'confirmationFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface ChangeEmailConfirmDependencies {
	confirmEmailChange: AuthDependencies['confirmEmailChange'];
}
