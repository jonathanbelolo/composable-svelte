/**
 * Personal Info Form Configuration (Step 1)
 */

import type { FormConfig } from '@composable-svelte/core/components/form';
import { personalInfoSchema, type PersonalInfoData } from './onboarding.types.js';

/**
 * Simulate async email validation
 */
async function validateEmail(email: string): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Check for blocked domains
  if (email.endsWith('@blocked.com')) {
    throw new Error('This email domain is not allowed');
  }
}

/**
 * Personal info form configuration
 */
export const personalInfoFormConfig: FormConfig<PersonalInfoData> = {
  schema: personalInfoSchema,
  initialData: {
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  },
  mode: 'all', // Validate on both blur and change

  asyncValidators: {
    email: validateEmail
  },

  onSubmit: async (data) => {
    console.log('Personal info step completed:', data);
    // No actual submission - parent will handle progression
  },

  onSubmitSuccess: (data) => {
    console.log('Personal info validated successfully');
  },

  onSubmitError: (error) => {
    console.error('Personal info validation failed:', error);
  }
};
