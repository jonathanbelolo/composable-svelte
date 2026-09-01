/**
 * Asking for a password-reset link.
 *
 * The same form-plus-request shape as sign-in, with one deliberate difference:
 * **success is not terminal.** Signup replaces itself with a "check your email"
 * panel because the account now exists and there is nothing left to do here.
 * This cannot make that claim — the honest message is conditional, "if that
 * address has an account, we sent a link", precisely because the backend will
 * not say whether it did. A user who mistyped their address needs the form
 * still there to try another, so `sent` sits beside the form rather than
 * instead of it.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { ForgotPasswordFields } from './schema.js';

export type ForgotPasswordStatus = 'idle' | 'submitting' | 'sent';

export interface ForgotPasswordState {
	form: FormState<ForgotPasswordFields>;
	status: ForgotPasswordStatus;
	error: AuthError | null;
	/**
	 * The address the last request named.
	 *
	 * Held so the confirmation can repeat it back — "if there is an account for
	 * ada@example.com" — using what was actually submitted rather than what the
	 * field happens to contain now.
	 */
	requestedFor: string | null;
}

export type ForgotPasswordAction =
	| { type: 'form'; action: FormAction<ForgotPasswordFields> }
	/** Effect feedback: the backend accepted the request. Says nothing about whether an account exists. */
	| { type: 'requestSent'; email: string }
	| { type: 'requestFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface ForgotPasswordDependencies {
	requestPasswordReset: AuthDependencies['requestPasswordReset'];
}
