import { createInitialFormState } from '@composable-svelte/core/components/form';
import { contactFormConfig } from '../features/contact-form/contact-form.config.js';
import type { AppState } from './app.types.js';

export function createInitialAppState(): AppState {
  return {
    contactForm: createInitialFormState(contactFormConfig),
    submissionHistory: [],
    successMessage: null
  };
}
