/**
 * What a sign-in form validates before it is worth sending.
 *
 * Deliberately lax about the password. A sign-in is not the place to enforce
 * complexity — the account already exists, its password was accepted under
 * whatever rules applied when it was created, and telling someone their
 * *existing* password "must contain a number" while they are trying to get in
 * is both wrong and infuriating. Signup enforces strength; login checks only
 * that something was typed.
 *
 * Email is validated as an email because a typo there is worth catching before
 * a round trip. Some deployments sign in with a username instead; those pass
 * their own schema.
 */

import { z } from 'zod';

import { emailField } from '../email-field.js';

export const loginSchema = z.object({
	email: emailField(),
	password: z.string().min(1, 'Password is required'),
	rememberMe: z.boolean()
});

export type LoginFields = z.infer<typeof loginSchema>;

/** Empty form. Exported so a caller can seed it — a remembered address, say. */
export const emptyLoginFields: LoginFields = {
	email: '',
	password: '',
	rememberMe: false
};
