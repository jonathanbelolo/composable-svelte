import type { FormConfig } from '@composable-svelte/core/components/form';
import type { ContactFormData } from './contact-form.types.js';
import { contactSchema } from './contact-form.types.js';

/**
 * Simulate async email validation (e.g., checking if email is blocked)
 */
async function validateEmailAsync(email: string): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 500));

	const blockedDomains = ['spam.com', 'test.invalid'];
	const domain = email.split('@')[1];

	if (blockedDomains.includes(domain)) {
		throw new Error('This email domain is not allowed');
	}
}

/**
 * Contact form configuration
 *
 * This defines:
 * - Initial values
 * - Zod validation schema
 * - When to validate (mode)
 * - Async validators
 * - Submission handler
 */
export const contactFormConfig: FormConfig<ContactFormData> = {
	initialData: {
		name: '',
		email: '',
		message: ''
	},
	schema: contactSchema,
	mode: 'onBlur',
	asyncValidators: {
		email: validateEmailAsync
	},
	onSubmit: async (data) => {
		// Simulate API call
		console.log('Submitting contact form:', data);
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// In a real app, this would call your API:
		// await fetch('/api/contact', {
		//   method: 'POST',
		//   headers: { 'Content-Type': 'application/json' },
		//   body: JSON.stringify(data)
		// });
	},
	onSubmitSuccess: (data) => {
		console.log('Contact form submitted successfully!', data);
		// Parent reducer will observe this via form actions
	},
	onSubmitError: (error) => {
		console.error('Contact form submission failed:', error);
	}
};
