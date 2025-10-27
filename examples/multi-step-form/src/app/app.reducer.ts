/**
 * App Reducer - Manages multi-step wizard flow
 *
 * Responsibilities:
 * - Track current step
 * - Accumulate data from completed steps
 * - Validate current step before progression
 * - Compose form reducers for each step
 * - Handle final submission
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer } from '@composable-svelte/core/components/form';
import { personalInfoFormConfig } from '../features/onboarding/personal-info.config.js';
import { addressFormConfig } from '../features/onboarding/address.config.js';
import type { AppState, AppAction } from './app.types.js';
import type { OnboardingStep } from '../features/onboarding/onboarding.types.js';

// Create form reducers
const personalInfoFormReducer = createFormReducer(personalInfoFormConfig);
const addressFormReducer = createFormReducer(addressFormConfig);

/**
 * Core app reducer - handles step navigation and data accumulation
 */
const coreReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  switch (action.type) {
    case 'personalInfoForm': {
      // Parent observes form submission success to capture data and progress
      if (action.action.type === 'submissionSucceeded') {
        const formData = state.personalInfoForm.data;
        return [
          {
            ...state,
            completedData: {
              ...state.completedData,
              personalInfo: formData
            },
            // Auto-progress to next step
            currentStep: 'address'
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'addressForm': {
      // Parent observes form submission success to capture data and progress
      if (action.action.type === 'submissionSucceeded') {
        const formData = state.addressForm.data;
        return [
          {
            ...state,
            completedData: {
              ...state.completedData,
              address: formData
            },
            // Auto-progress to review step
            currentStep: 'review'
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'nextStep': {
      // Validate current step before progressing
      const currentStep = state.currentStep;

      if (currentStep === 'personalInfo') {
        const form = state.personalInfoForm;

        // Check if form is valid
        if (!_isFormValid(form)) {
          // Trigger submission to show validation errors
          return [
            state,
            Effect.run(async (dispatch) => {
              dispatch({
                type: 'personalInfoForm',
                action: { type: 'submitTriggered' }
              });
            })
          ];
        }

        // Form is valid - trigger submission to capture data, then move to next step
        return [
          state,
          Effect.run(async (dispatch) => {
            dispatch({
              type: 'personalInfoForm',
              action: { type: 'submitTriggered' }
            });
          })
        ];
      }

      if (currentStep === 'address') {
        const form = state.addressForm;

        // Check if form is valid
        if (!_isFormValid(form)) {
          // Trigger submission to show validation errors
          return [
            state,
            Effect.run(async (dispatch) => {
              dispatch({
                type: 'addressForm',
                action: { type: 'submitTriggered' }
              });
            })
          ];
        }

        // Form is valid - trigger submission to capture data, then move to next step
        return [
          state,
          Effect.run(async (dispatch) => {
            dispatch({
              type: 'addressForm',
              action: { type: 'submitTriggered' }
            });
          })
        ];
      }

      return [state, Effect.none()];
    }

    case 'previousStep': {
      const currentStep = state.currentStep;

      if (currentStep === 'address') {
        return [
          {
            ...state,
            currentStep: 'personalInfo'
          },
          Effect.none()
        ];
      }

      if (currentStep === 'review') {
        return [
          {
            ...state,
            currentStep: 'address'
          },
          Effect.none()
        ];
      }

      return [state, Effect.none()];
    }

    case 'goToStep': {
      return [
        {
          ...state,
          currentStep: action.step
        },
        Effect.none()
      ];
    }

    case 'submitOnboarding': {
      // Validate that all data is collected
      const { personalInfo, address } = state.completedData;

      if (!personalInfo || !address) {
        return [
          {
            ...state,
            submitError: 'Please complete all steps before submitting'
          },
          Effect.none()
        ];
      }

      // Dispatch submission started action
      return [
        state,
        Effect.run(async (dispatch) => {
          dispatch({ type: 'submissionStarted' });
        })
      ];
    }

    case 'submissionStarted': {
      return [
        {
          ...state,
          isSubmitting: true,
          submitError: null
        },
        Effect.run(async (dispatch) => {
          try {
            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const completeData = {
              personalInfo: state.completedData.personalInfo!,
              address: state.completedData.address!
            };

            console.log('Onboarding submitted successfully:', completeData);

            dispatch({
              type: 'submissionSucceeded',
              data: completeData
            });
          } catch (error) {
            dispatch({
              type: 'submissionFailed',
              error: error instanceof Error ? error.message : 'Submission failed'
            });
          }
        })
      ];
    }

    case 'submissionSucceeded': {
      return [
        {
          ...state,
          isSubmitting: false,
          submissionComplete: true,
          submittedData: action.data
        },
        Effect.none()
      ];
    }

    case 'submissionFailed': {
      return [
        {
          ...state,
          isSubmitting: false,
          submitError: action.error
        },
        Effect.none()
      ];
    }

    case 'resetOnboarding': {
      // Reset to initial state
      return [
        {
          ...state,
          currentStep: 'personalInfo',
          completedData: {
            personalInfo: null,
            address: null
          },
          isSubmitting: false,
          submitError: null,
          submissionComplete: false,
          submittedData: null
        },
        Effect.run(async (dispatch) => {
          // Reset both forms
          dispatch({ type: 'personalInfoForm', action: { type: 'formReset' } });
          dispatch({ type: 'addressForm', action: { type: 'formReset' } });
        })
      ];
    }

    default:
      return [state, Effect.none()];
  }
};

/**
 * Helper to check if form is valid (all fields pass validation)
 */
function _isFormValid(form: any): boolean {
  // Check if any field has errors
  for (const fieldName in form.fields) {
    const field = form.fields[fieldName];
    if (field.error) {
      return false;
    }
  }

  // Check if form is currently validating
  if (form.isValidating) {
    return false;
  }

  // Check form-level errors
  if (form.formErrors.length > 0) {
    return false;
  }

  return true;
}

/**
 * Main app reducer - composes core reducer with form reducers
 */
export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  // Run core reducer first
  const [s1, e1] = coreReducer(state, action, deps);

  // Scope personal info form reducer
  const scopedPersonalInfoFormReducer = scope<AppState, AppAction, any, any, {}>(
    (s) => s.personalInfoForm,
    (s, child) => ({ ...s, personalInfoForm: child }),
    (a) => (a.type === 'personalInfoForm' ? a.action : null),
    (childAction) => ({ type: 'personalInfoForm', action: childAction }),
    personalInfoFormReducer
  );

  const [s2, e2] = scopedPersonalInfoFormReducer(s1, action, deps);

  // Scope address form reducer
  const scopedAddressFormReducer = scope<AppState, AppAction, any, any, {}>(
    (s) => s.addressForm,
    (s, child) => ({ ...s, addressForm: child }),
    (a) => (a.type === 'addressForm' ? a.action : null),
    (childAction) => ({ type: 'addressForm', action: childAction }),
    addressFormReducer
  );

  const [s3, e3] = scopedAddressFormReducer(s2, action, deps);

  return [s3, Effect.batch(e1, e2, e3)];
};
