/**
 * Turning on an authenticator.
 *
 * Both shapes at once, again — it fetches on entry like `email-verification`,
 * then collects a code like `signup`. That first half is why this flow **does**
 * need verification's guards, where `reset-password` deliberately did not: an
 * effect that re-fires here starts a second enrolment and throws away the
 * secret the user is already looking at.
 *
 * The end is unusual. `enrolled` carries recovery codes that the backend will
 * never hand over again — they are the only way back in after a lost phone, and
 * a surface that drops them has silently locked the user out of their own
 * recovery. That is why they live on state rather than being handed to a
 * callback and forgotten.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { MfaCodeFields } from '../mfa-challenge/schema.js';

export type MfaEnrolmentStatus =
	/** Nothing started, or a failure to correct. */
	| 'idle'
	/** Fetching the secret. */
	| 'starting'
	/** The secret is on screen; waiting for a code to prove it works. */
	| 'confirming'
	/** Submitting that code. */
	| 'submitting'
	/** Done. `recoveryCodes` is populated and will never be again. */
	| 'enrolled';

export interface MfaEnrolmentState {
	form: FormState<MfaCodeFields>;
	status: MfaEnrolmentStatus;
	enrolmentId: string | null;
	/** Base32, for manual entry into an authenticator app. */
	secret: string | null;
	/** `otpauth://totp/...` — what a QR encodes, if a consumer renders one. */
	otpauthUri: string | null;
	/** Shown once. `null` until enrolled, and never refetchable after. */
	recoveryCodes: readonly string[] | null;
	error: AuthError | null;
}

export type MfaEnrolmentAction =
	| { type: 'form'; action: FormAction<MfaCodeFields> }
	/** Fetch a secret. Dispatched on mount, once, by the surface. */
	| { type: 'enrolmentRequested' }
	| { type: 'enrolmentStarted'; enrolmentId: string; secret: string; otpauthUri: string }
	| { type: 'enrolmentStartFailed'; error: AuthError }
	| { type: 'enrolmentConfirmed'; recoveryCodes: readonly string[] }
	| { type: 'enrolmentConfirmFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface MfaEnrolmentDependencies {
	beginMfaEnrolment: AuthDependencies['beginMfaEnrolment'];
	confirmMfaEnrolment: AuthDependencies['confirmMfaEnrolment'];
}
