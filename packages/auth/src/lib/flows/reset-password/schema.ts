/**
 * What a reset form validates.
 *
 * The same password rules signup enforces, from the same module, so a user
 * cannot be told one thing when creating an account and another when recovering
 * it. The token is not in the schema: it came from a link, the user cannot edit
 * it, and only the backend can judge it.
 */

import { z } from 'zod';

import { passwordField } from '../password-policy.js';

export const resetPasswordSchema = z
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

export type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export const emptyResetPasswordFields: ResetPasswordFields = {
	password: '',
	confirmPassword: ''
};
