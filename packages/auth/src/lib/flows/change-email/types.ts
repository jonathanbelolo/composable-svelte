/**
 * Asking to move the account to a different email address.
 *
 * The *request* half only. Confirming the link is `change-email-confirm`, and
 * they are separate for the reason OAuth and magic links are: **the two halves
 * run in different page loads.** This one is a form in a settings panel; that
 * one is formless and runs on whatever page the link opens. One reducer holding
 * both would carry three statuses and three errors where any given page uses
 * two — the redundant-state smell `mfa-management` names.
 *
 * It does not reuse `email-verification`, which is the flow it most resembles.
 * Nothing is shared but the word "token": `verifyEmail` confirms *the account's*
 * address and may return a session, while `confirmEmailChange` swaps to a
 * different address on a session that already exists and returns the new
 * address. Different verb, different return type, and opposite postures on
 * `email_taken`.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { ChangeEmailFields } from './schema.js';

export type ChangeEmailStatus = 'idle' | 'submitting';

/** Tracked apart from `status`: a resend can be in flight while a request is not. */
export type ChangeEmailResendStatus = 'idle' | 'sending' | 'sent';

/**
 * There is no `sent` status, and that is deliberate.
 *
 * It would say exactly what `pendingEmail !== null` already says, and two
 * copies of one fact are what drift apart.
 */
export interface ChangeEmailState {
	form: FormState<ChangeEmailFields>;
	status: ChangeEmailStatus;
	error: AuthError | null;
	resendStatus: ChangeEmailResendStatus;
	resendError: AuthError | null;
	/**
	 * The address a confirmation link is out to, or `null`.
	 *
	 * Not the account's address — that is `AccountSnapshot.email`, and a panel
	 * shows both: "you are ada@example.com; we have sent a link to
	 * ada@work.example".
	 */
	pendingEmail: string | null;
}

export type ChangeEmailAction =
	| { type: 'form'; action: FormAction<ChangeEmailFields> }
	| { type: 'changeRequestSucceeded'; email: string }
	| { type: 'changeRequestFailed'; error: AuthError }
	| { type: 'resendRequested' }
	| { type: 'resendSucceeded' }
	| { type: 'resendFailed'; error: AuthError }
	/**
	 * What the account currently reports as pending.
	 *
	 * Dispatched by the surface whenever the read changes, so a local
	 * `pendingEmail` cannot outlive the fact it recorded — the lesson
	 * `mfaObserved` and `providersObserved` both learned the hard way.
	 */
	| { type: 'pendingEmailObserved'; email: string | null }
	| { type: 'errorDismissed' };

export interface ChangeEmailDependencies {
	requestEmailChange: AuthDependencies['requestEmailChange'];
	resendEmailChange: AuthDependencies['resendEmailChange'];
}
