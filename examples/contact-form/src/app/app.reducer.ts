import { Effect, type Reducer } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer } from '@composable-svelte/core/components/form';
import type { AppState, AppAction } from './app.types.js';
import type { ContactFormState, ContactFormAction } from '../features/contact-form/contact-form.types.js';
import { contactFormConfig } from '../features/contact-form/contact-form.config.js';

export interface AppDependencies {
  /** Event-time dependency; invoked only by the completion effect. */
  now?: () => Date;
}
const dismissMessage = 'contact-success-message';
const formReducer = createFormReducer(contactFormConfig);
const scopedForm = scope<AppState, AppAction, ContactFormState, ContactFormAction, AppDependencies>(
  state => state.contactForm,
  (state, contactForm) => ({ ...state, contactForm }),
  action => action.type === 'contactForm' ? action.action : null,
  action => ({ type: 'contactForm', action }),
  formReducer
);

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  // The framework first decides whether a form event belongs to the active attempt.
  const [next, formEffect] = scopedForm(state, action, deps);
  if (action.type === 'contactForm') {
    const previous = state.contactForm, current = next.contactForm;
    if (action.action.type === 'submissionStarted' && current.isSubmitting && current.submissionId !== previous.submissionId)
      return [{ ...next, pendingSubmission: previous.data }, formEffect];
    if (action.action.type === 'submissionSucceeded' && current.submitOutcome === 'succeeded' && current.submitCount > previous.submitCount) {
      const snapshot = state.pendingSubmission ?? previous.data;
      return [{ ...next, pendingSubmission: null }, Effect.batch(formEffect, Effect.run(dispatch => {
        dispatch({ type: 'submissionRecorded', snapshot, timestamp: deps.now?.() ?? new Date() });
      }))];
    }
    if (action.action.type === 'formReset' || (action.action.type === 'submissionFailed' && current.submitCount > previous.submitCount))
      return [{ ...next, pendingSubmission: null }, formEffect];
    return [next, formEffect];
  }
  if (action.type === 'submissionRecorded') {
    return [{ ...next,
      submissionHistory: [...next.submissionHistory, { timestamp: action.timestamp, name: action.snapshot.name, email: action.snapshot.email }],
      successMessage: `Thank you, ${action.snapshot.name}! Your message has been sent.`
    }, Effect.debounced(dismissMessage, 5000, dispatch => dispatch({ type: 'successMessageDismissed' }))];
  }
  return [{ ...next, successMessage: null }, Effect.cancel(dismissMessage)];
};
