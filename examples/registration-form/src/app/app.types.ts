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
  /** Business identity submitted by the current attempt, independent of later edits. */
  submittedUser?: { username: string; email: string } | null;
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
