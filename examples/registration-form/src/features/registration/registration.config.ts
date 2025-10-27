/**
 * Registration Form Configuration
 */

import type { FormConfig } from '@composable-svelte/core/components/form';
import { registrationSchema, type RegistrationFormData } from './registration.types.js';

/**
 * Simulated database of existing usernames and emails
 */
const existingUsernames = new Set(['admin', 'user', 'test', 'demo']);
const existingEmails = new Set([
  'admin@example.com',
  'user@example.com',
  'test@example.com'
]);

/**
 * Simulate async username availability check
 */
async function checkUsernameAvailability(username: string): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (existingUsernames.has(username.toLowerCase())) {
    throw new Error('Username is already taken');
  }
}

/**
 * Simulate async email availability check
 */
async function checkEmailAvailability(email: string): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (existingEmails.has(email.toLowerCase())) {
    throw new Error('Email is already registered');
  }
}

/**
 * Registration form configuration
 */
export const registrationFormConfig: FormConfig<RegistrationFormData> = {
  schema: registrationSchema,
  initialData: {
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  },
  mode: 'all', // Validate on both blur and change

  // Async validators run AFTER Zod validation passes
  asyncValidators: {
    username: checkUsernameAvailability,
    email: checkEmailAvailability
  },

  onSubmit: async (data) => {
    console.log('Submitting registration:', data);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('Registration successful!', {
      username: data.username,
      email: data.email
    });
  },

  onSubmitSuccess: (data) => {
    console.log('Registration form submitted successfully');
  },

  onSubmitError: (error) => {
    console.error('Registration failed:', error);
  }
};
