/**
 * Creating an account.
 *
 * The same split as the sign-in flow — the form's job ends at "these fields are
 * valid", and this reducer makes the request — for the same forced reason:
 * core's `createFormReducer` catches whatever `config.onSubmit` throws and keeps
 * `error.message`, a string, which would flatten `email_taken` into prose a
 * surface cannot branch on.
 *
 * **Two terminal states, not one.** A backend that requires email confirmation
 * cannot return a session, and one that does not should not force a second
 * round trip. Signup therefore ends either signed in or waiting on a mail, and
 * both are successes.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { SignupFields } from './schema.js';

/**
 * What the flow is doing.
 *
 * `succeeded` and `awaitingVerification` are both terminal and both good; they
 * differ in what the surface should do next, which is exactly why they are
 * distinct rather than one `done` plus a nullable field.
 */
export type SignupStatus = 'idle' | 'submitting' | 'succeeded' | 'awaitingVerification';

export interface SignupState {
	form: FormState<SignupFields>;
	status: SignupStatus;
	/**
	 * Why it failed, structured.
	 *
	 * `email_taken` is the one to branch on here: the useful response is an
	 * offer to sign in instead, not a red banner.
	 */
	error: AuthError | null;
	/** The session, when the backend issued one. Only set with `succeeded`. */
	session: SessionSnapshot | null;
	/**
	 * The address a confirmation was sent to. Only set with
	 * `awaitingVerification`.
	 *
	 * Held rather than re-read from the form so a "resend to…" offer names the
	 * address that was actually submitted, even if the field has since changed.
	 */
	pendingEmail: string | null;
}

export type SignupAction =
	/** Every form interaction, forwarded to core's form reducer. */
	| { type: 'form'; action: FormAction<SignupFields> }
	/** Effect feedback: the account exists and the backend signed it in. */
	| { type: 'signupSucceeded'; session: SessionSnapshot }
	/** Effect feedback: the account exists and needs its address confirmed. */
	| { type: 'verificationRequired'; email: string }
	/** Effect feedback: it did not work. */
	| { type: 'signupFailed'; error: AuthError }
	/** Clear the failure without touching the fields. */
	| { type: 'errorDismissed' };

export interface SignupDependencies {
	/** Only `signup` is needed here; the flow does nothing else. */
	signup: AuthDependencies['signup'];
}
