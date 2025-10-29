import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { StyleguideState, StyleguideAction } from './styleguide.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface StyleguideDependencies {}

// ============================================================================
// Styleguide Reducer
// ============================================================================

export const styleguideReducer: Reducer<
  StyleguideState,
  StyleguideAction,
  StyleguideDependencies
> = (state, action, _deps) => {
  switch (action.type) {
    case 'themeToggled': {
      return [
        {
          ...state,
          theme: state.theme === 'light' ? 'dark' : 'light'
        },
        Effect.none()
      ];
    }

    case 'componentSelected': {
      return [
        {
          ...state,
          selectedComponent: action.componentId
        },
        Effect.none()
      ];
    }

    case 'homeSelected': {
      return [
        {
          ...state,
          selectedComponent: null
        },
        Effect.none()
      ];
    }

    default: {
      return [state, Effect.none()];
    }
  }
};
