/**
 * What a signup form validates.
 *
 * The password rules themselves live in `../password-policy.js`, because reset
 * enforces the identical ones and would otherwise have to import from signup.
 */

import { z } from 'zod';

import { emailField } from '../email-field.js';

import { passwordField } from '../password-policy.js';

export const signupSchema = z
	.object({
		email: emailField(),
		password: passwordField(),
		confirmPassword: z.string().min(1, 'Confirm your password')
	})
	// `path` matters: without it the message lands in `formErrors`, which no
	// component renders, and the mismatch would be invisible.
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword']
	});

export type SignupFields = z.infer<typeof signupSchema>;

/** Empty form. Exported so a caller can seed it — an invited address, say. */
export const emptySignupFields: SignupFields = {
	email: '',
	password: '',
	confirmPassword: ''
};
