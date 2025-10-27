/**
 * Address Form Configuration (Step 2)
 */

import type { FormConfig } from '@composable-svelte/core/components/form';
import { addressSchema, type AddressData } from './onboarding.types.js';

/**
 * Simulate async zip code validation
 */
async function validateZipCode(zipCode: string): Promise<void> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Check for invalid zip codes (example: 00000, 99999)
  if (zipCode === '00000' || zipCode === '99999') {
    throw new Error('This zip code is not serviceable');
  }
}

/**
 * Address form configuration
 */
export const addressFormConfig: FormConfig<AddressData> = {
  schema: addressSchema,
  initialData: {
    street: '',
    city: '',
    state: '',
    zipCode: ''
  },
  mode: 'all', // Validate on both blur and change

  asyncValidators: {
    zipCode: validateZipCode
  },

  onSubmit: async (data) => {
    console.log('Address step completed:', data);
    // No actual submission - parent will handle progression
  },

  onSubmitSuccess: (data) => {
    console.log('Address validated successfully');
  },

  onSubmitError: (error) => {
    console.error('Address validation failed:', error);
  }
};
