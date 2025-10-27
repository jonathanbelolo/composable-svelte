/**
 * App-level types for multi-step onboarding form
 *
 * The app manages:
 * - Current step
 * - Accumulated data from all completed steps
 * - Two separate form states (one per step)
 * - Overall completion status
 */

import type { FormState, FormAction } from '@composable-svelte/core/components/form';
import type {
  PersonalInfoData,
  AddressData,
  CompleteOnboardingData,
  OnboardingStep
} from '../features/onboarding/onboarding.types.js';

export interface AppState {
  // Current step in the wizard
  currentStep: OnboardingStep;

  // Accumulated data from completed steps
  completedData: {
    personalInfo: PersonalInfoData | null;
    address: AddressData | null;
  };

  // Form states for each step
  personalInfoForm: FormState<PersonalInfoData>;
  addressForm: FormState<AddressData>;

  // Overall submission state
  isSubmitting: boolean;
  submitError: string | null;
  submissionComplete: boolean;
  submittedData: CompleteOnboardingData | null;
}

export type AppAction =
  | { type: 'personalInfoForm'; action: FormAction<PersonalInfoData> }
  | { type: 'addressForm'; action: FormAction<AddressData> }
  | { type: 'nextStep' }
  | { type: 'previousStep' }
  | { type: 'goToStep'; step: OnboardingStep }
  | { type: 'submitOnboarding' }
  | { type: 'submissionStarted' }
  | { type: 'submissionSucceeded'; data: CompleteOnboardingData }
  | { type: 'submissionFailed'; error: string }
  | { type: 'resetOnboarding' };
