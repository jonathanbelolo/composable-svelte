/**
 * Initial App State Factory
 */

import { createInitialFormState } from '@composable-svelte/core/components/form';
import { personalInfoFormConfig } from '../features/onboarding/personal-info.config.js';
import { addressFormConfig } from '../features/onboarding/address.config.js';
import type { AppState } from './app.types.js';

/**
 * Create initial application state
 */
export function createInitialAppState(): AppState {
  return {
    currentStep: 'personalInfo',
    completedData: {
      personalInfo: null,
      address: null
    },
    personalInfoForm: createInitialFormState(personalInfoFormConfig),
    addressForm: createInitialFormState(addressFormConfig),
    isSubmitting: false,
    submitError: null,
    submissionComplete: false,
    submittedData: null
  };
}
