/**
 * Confirming an email address.
 *
 * Structurally unlike the other two flows: there is **no form**. The input is a
 * token that arrived in a link, so the work starts on mount rather than on
 * submit, and the only thing a user can type is nothing at all.
 *
 * That makes two things different from login and signup. There is no
 * `FormState` slice and no Zod schema — a token is opaque and only the backend
 * can judge it, so validating its shape here would reject links a future
 * backend issues. And **two operations run against one surface**: confirming a
 * token, and asking for another mail. They are tracked separately because both
 * can be true at once — a failed confirmation with a resend in flight is the
 * ordinary state of this page, not an edge case.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';

/** Confirming the token. */
export type EmailVerificationStatus = 'idle' | 'verifying' | 'verified';

/** Asking for another mail. */
export type ResendStatus = 'idle' | 'sending' | 'sent';

export interface EmailVerificationState {
	status: EmailVerificationStatus;
	/**
	 * Why confirming failed, or `null`.
	 *
	 * `token_expired` is the one to expect: a link opened a week late is the
	 * ordinary case here, and the recovery is a resend rather than a retry.
	 */
	error: AuthError | null;
	/**
	 * The session, when confirming also signed the account in.
	 *
	 * `null` with `status: 'verified'` is a success too — the address is
	 * confirmed and the user still has to sign in.
	 */
	session: SessionSnapshot | null;
	/** Tracked apart from `status`: both operations can be in play at once. */
	resendStatus: ResendStatus;
	resendError: AuthError | null;
	/**
	 * Where a resend goes.
	 *
	 * Held on state rather than read from a field, because there is no field —
	 * it comes from whatever knew the address: signup's `pendingEmail`, a query
	 * parameter, or a signed-in session. `null` means resending is not offered.
	 */
	email: string | null;
}

export type EmailVerificationAction =
	/** Confirm this token. Dispatched on mount, once, by the surface. */
	| { type: 'verificationRequested'; token: string }
	/** Effect feedback: confirmed. `session` is null when none was issued. */
	| { type: 'verificationSucceeded'; session: SessionSnapshot | null }
	/** Effect feedback: the link did not work. */
	| { type: 'verificationFailed'; error: AuthError }
	/** Send another mail to {@link EmailVerificationState.email}. */
	| { type: 'resendRequested' }
	| { type: 'resendSucceeded' }
	| { type: 'resendFailed'; error: AuthError }
	/**
	 * Tell the flow where a resend should go.
	 *
	 * Without this the address could only be set when the store was built, so a
	 * user who arrived with no token and no known address had **no path forward
	 * at all** — the surface could not offer a resend and there was no way to
	 * give it one. That is the commonest way to reach this page.
	 */
	| { type: 'emailProvided'; email: string }
	/** Clear both failures — the surface shows them together. */
	| { type: 'errorDismissed' };

export interface EmailVerificationDependencies {
	verifyEmail: AuthDependencies['verifyEmail'];
	resendVerification: AuthDependencies['resendVerification'];
}
