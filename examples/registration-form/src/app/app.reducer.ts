/**
 * App Reducer - Integrates registration form reducer
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer } from '@composable-svelte/core/components/form';
import { registrationFormConfig } from '../features/registration/registration.config.js';
import type { AppState, AppAction } from './app.types.js';

// Create form reducer
const formReducer = createFormReducer(registrationFormConfig);

/**
 * Core app reducer - handles parent-specific logic
 */
const coreReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  switch (action.type) {
    case 'registrationForm': {
      // Parent observes form submission success
      if (action.action.type === 'submissionSucceeded') {
        const formData = state.registrationForm.data;
        return [
          {
            ...state,
            registrationSuccess: true,
            registeredUser: {
              username: formData.username,
              email: formData.email
            }
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'registrationReset': {
      return [
        {
          ...state,
          registrationSuccess: false,
          registeredUser: null
        },
        Effect.none()
      ];
    }

    default:
      return [state, Effect.none()];
  }
};

/**
 * Main app reducer - composes core reducer with form reducer
 */
export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  // Run core reducer first
  const [s1, e1] = coreReducer(state, action, deps);

  // Then run scoped form reducer
  const scopedFormReducer = scope<AppState, AppAction, any, any, {}>(
    (s) => s.registrationForm, // Extract child state
    (s, child) => ({ ...s, registrationForm: child }), // Update parent with child
    (a) => (a.type === 'registrationForm' ? a.action : null), // Extract child action
    (childAction) => ({ type: 'registrationForm', action: childAction }), // Wrap child action
    formReducer
  );

  const [s2, e2] = scopedFormReducer(s1, action, deps);
  return [s2, Effect.batch(e1, e2)];
};
