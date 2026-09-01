/**
 * Setting a new password from a reset link.
 *
 * The first flow here that is **both** shapes at once: it starts from a token
 * in a URL, like email verification, and then collects a password, like signup.
 *
 * That combination is why one thing must *not* be copied from verification.
 * There, the token is exchanged **on mount**, so an effect that re-fires spends
 * a single-use link — hence a guard in the reducer and another in the
 * component. Here the token is exchanged **on submit**, by a click. There is no
 * mount effect to re-fire, so the equivalent guard would be answering a
 * question nobody asked. What is needed instead is the ordinary one every form
 * flow has: a fixed cancellation id, so a double-click supersedes rather than
 * spending the token twice.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { ResetPasswordFields } from './schema.js';

export type ResetPasswordStatus = 'idle' | 'submitting' | 'reset';

export interface ResetPasswordState {
	form: FormState<ResetPasswordFields>;
	status: ResetPasswordStatus;
	/**
	 * Why it failed.
	 *
	 * `token_expired` is the one to expect and the one with a different
	 * recovery: a new link, not a retry — the form in front of the user cannot
	 * fix it.
	 */
	error: AuthError | null;
	/**
	 * The session, when the backend signed the account in as part of the reset.
	 *
	 * `null` with `status: 'reset'` is a success too — the password is changed
	 * and the user signs in with it.
	 */
	session: SessionSnapshot | null;
	/**
	 * The token from the link.
	 *
	 * On state rather than in the form, because it is not a field: the user did
	 * not type it and cannot correct it. Held here so the reducer has it when the
	 * form reports itself valid — the same place verification keeps the address a
	 * resend goes to.
	 *
	 * `null` means the link was mangled or the page was reached directly, which
	 * is a state to render rather than an error to report.
	 */
	token: string | null;
}

export type ResetPasswordAction =
	| { type: 'form'; action: FormAction<ResetPasswordFields> }
	/** Tell the flow which token to reset against. */
	| { type: 'tokenProvided'; token: string }
	| { type: 'resetSucceeded'; session: SessionSnapshot | null }
	| { type: 'resetFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface ResetPasswordDependencies {
	resetPassword: AuthDependencies['resetPassword'];
}
