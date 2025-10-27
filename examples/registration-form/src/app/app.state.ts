/**
 * Initial App State Factory
 */

import { createInitialFormState } from '@composable-svelte/core/components/form';
import { registrationFormConfig } from '../features/registration/registration.config.js';
import type { AppState } from './app.types.js';

/**
 * Create initial application state
 */
export function createInitialAppState(): AppState {
  return {
    registrationForm: createInitialFormState(registrationFormConfig),
    registrationSuccess: false,
    registeredUser: null
  };
}
