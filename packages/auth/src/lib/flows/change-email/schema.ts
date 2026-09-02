/**
 * What asking to change an email address validates.
 *
 * One field, and no confirm field — deliberately. A mistyped *password* locks
 * you out, which is why `change-password` has one; a mistyped *address* sends
 * a link nowhere and the change simply never lands. That fails safe, so a
 * second field would be ceremony rather than protection.
 *
 * `emailField()` is the same rule signup and sign-in enforce, from the same
 * module, so an account cannot be told one thing when it is created and
 * another when it is moved.
 */

import { z } from 'zod';

import { emailField } from '../email-field.js';

export const changeEmailSchema = z.object({
	email: emailField()
});

export type ChangeEmailFields = z.infer<typeof changeEmailSchema>;

export const emptyChangeEmailFields: ChangeEmailFields = {
	email: ''
};
