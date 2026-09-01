/**
 * What setting or changing a password validates.
 *
 * The same rules signup and reset enforce, from the same module, so an account
 * cannot be told one thing when it is created and another when it is changed.
 *
 * **There is no `currentPassword` field, and that is the design.** The client
 * cannot know whether the account has a password — `SessionSnapshot` carries no
 * credential-kind field, and an account created through OAuth or a magic link
 * never set one. A backend that wants proof rejects with
 * `reauthentication_required` saying which methods it accepts.
 *
 * Neither field is trimmed. Whitespace is legitimate password content, and
 * trimming one and not the other produces a spurious "Passwords do not match" —
 * the rule `email-field.ts` states for the fields that *are* trimmed.
 */

import { z } from 'zod';

import { passwordField } from '../password-policy.js';

export const changePasswordSchema = z
	.object({
		password: passwordField(),
		confirmPassword: z.string().min(1, 'Confirm your password')
	})
	// `path` matters: without it the message lands in `formErrors`, which no
	// component renders.
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword']
	});

export type ChangePasswordFields = z.infer<typeof changePasswordSchema>;

export const emptyChangePasswordFields: ChangePasswordFields = {
	password: '',
	confirmPassword: ''
};
