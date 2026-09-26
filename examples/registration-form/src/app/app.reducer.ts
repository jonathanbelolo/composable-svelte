/**
 * App Reducer - Integrates registration form reducer
 */

import type { Reducer } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer, type FormAction, type FormState } from '@composable-svelte/core/components/form';
import { registrationFormConfig } from '../features/registration/registration.config.js';
import type { RegistrationFormData } from '../features/registration/registration.types.js';
import type { AppState, AppAction } from './app.types.js';

// Create form reducer
const formReducer = createFormReducer(registrationFormConfig);

/**
 * Scoped form reducer constructed once with actual child types.
 * Maps 'registrationReset' to 'formReset' so one semantic reset action resets both
 * parent state and child form state via composition.
 */
const scopedFormReducer = scope<
  AppState,
  AppAction,
  FormState<RegistrationFormData>,
  FormAction<RegistrationFormData>,
  {}
>(
  (s) => s.registrationForm,
  (s, child) => ({ ...s, registrationForm: child }),
  (a) => {
    if (a.type === 'registrationForm') return a.action;
    if (a.type === 'registrationReset') return { type: 'formReset' };
    return null;
  },
  (childAction) => ({ type: 'registrationForm', action: childAction }),
  formReducer
);

/** The form decides whether completion is current before the parent records success. */
export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  const [next, effect] = scopedFormReducer(state, action, deps);
  if (action.type === 'registrationReset')
    return [{ ...next, registrationSuccess: false, registeredUser: null, submittedUser: null }, effect];
  const previous = state.registrationForm, current = next.registrationForm;
  if (action.action.type === 'submissionStarted' && current.isSubmitting && current.submissionId !== previous.submissionId) {
    const { username, email } = previous.data;
    return [{ ...next, submittedUser: { username, email } }, effect];
  }
  if (action.action.type === 'submissionSucceeded' && previous.isSubmitting && current.submitOutcome === 'succeeded' && current.submitCount > previous.submitCount) {
    const { username, email } = state.submittedUser ?? previous.data;
    return [{ ...next, registrationSuccess: true, registeredUser: { username, email }, submittedUser: null }, effect];
  }
  if ((action.action.type === 'submissionFailed' && current.submitCount > previous.submitCount) || action.action.type === 'formReset')
    return [{ ...next, submittedUser: null }, effect];
  return [next, effect];
};
