import type { FormState, FormAction } from '@composable-svelte/core/components/form';
import { z } from 'zod';

/**
 * Contact form data schema
 */
export const contactSchema = z.object({
	name: z
		.string()
		.min(2, 'Name must be at least 2 characters')
		.max(50, 'Name must be less than 50 characters'),
	email: z.string().email('Please enter a valid email address').min(1, 'Email is required'),
	message: z
		.string()
		.min(10, 'Message must be at least 10 characters')
		.max(500, 'Message must be less than 500 characters')
});

/**
 * Infer TypeScript type from schema
 */
export type ContactFormData = z.infer<typeof contactSchema>;

/**
 * Contact form state (managed by form reducer)
 */
export type ContactFormState = FormState<ContactFormData>;

/**
 * Contact form actions (dispatched by form component)
 */
export type ContactFormAction = FormAction<ContactFormData>;
