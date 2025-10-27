/**
 * App State and Actions
 */

import type { FormState, FormAction } from '@composable-svelte/core/components/form';
import type { RegistrationFormData } from '../features/registration/registration.types.js';

/**
 * Application state
 */
export interface AppState {
  registrationForm: FormState<RegistrationFormData>;
  registrationSuccess: boolean;
  registeredUser: {
    username: string;
    email: string;
  } | null;
}

/**
 * Application actions
 */
export type AppAction =
  | { type: 'registrationForm'; action: FormAction<RegistrationFormData> }
  | { type: 'registrationReset' };
