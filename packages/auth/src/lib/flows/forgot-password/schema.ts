/**
 * What a "forgot my password" form validates: an address, and nothing else.
 *
 * No password rules here — this form does not take one. That is worth saying
 * because the reset form on the other end of the link does, and the two are
 * easily conflated.
 */

import { z } from 'zod';

import { emailField } from '../email-field.js';

export const forgotPasswordSchema = z.object({
	email: emailField()
});

export type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export const emptyForgotPasswordFields: ForgotPasswordFields = { email: '' };
