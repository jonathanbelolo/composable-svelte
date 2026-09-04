/**
 * The sign-in flow: a form, a request, and a structured failure.
 *
 * **The flow owns the submission, not the form.** That is forced rather than
 * stylistic. Core's `createFormReducer` catches whatever `config.onSubmit`
 * throws and stores `error.message` — a string. Run the auth call there and the
 * `AuthError` union is flattened on arrival: `mfa_required` loses its
 * `challengeId`, `rate_limited` loses its delay, and the whole of F1 buys
 * nothing.
 *
 * So `onSubmit` is a no-op, the form's job ends at "these fields are valid", and
 * this reducer observes `submissionSucceeded` and does the work. That is the
 * same arrangement `examples/multi-step-form` uses for its step configs, where
 * the parent owns progression.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { LoginFields } from './schema.js';

/** What the flow is doing, as distinct from what the form is doing. */
export type LoginStatus = 'idle' | 'submitting' | 'succeeded';

export interface LoginState {
	/** Core's form state, scoped. The fields and their validation live here. */
	form: FormState<LoginFields>;
	status: LoginStatus;
	/**
	 * Why the sign-in failed, structured.
	 *
	 * Not the form's `submitError`, which is a string and cannot be branched on.
	 * A surface reads `error.code` to decide what to offer: a resend link for
	 * `email_unverified`, no retry button for `account_locked`, an MFA step for
	 * `mfa_required`.
	 */
	error: AuthError | null;
	/**
	 * The session, once one exists.
	 *
	 * Held so a caller that missed the moment can still find it — a component
	 * mounting late, or one that wants to re-hand it to the session store.
	 */
	session: SessionSnapshot | null;
}

export type LoginAction =
	/** Every form interaction, forwarded to core's form reducer. */
	| { type: 'form'; action: FormAction<LoginFields> }
	/** Effect feedback: the credentials were accepted. */
	| { type: 'loginSucceeded'; session: SessionSnapshot }
	/** Effect feedback: they were not, or something else went wrong. */
	| { type: 'loginFailed'; error: AuthError }
	/**
	 * Clear the failure without touching the fields.
	 *
	 * For a surface that dismisses its own banner. Editing a field clears it
	 * too — see the `form` arm.
	 */
	| { type: 'errorDismissed' };

export interface LoginDependencies {
	/** Only `login` is needed here; the flow does nothing else. */
	login: AuthDependencies['login'];
}
