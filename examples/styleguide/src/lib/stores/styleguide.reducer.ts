import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { createURLSyncEffect } from '@composable-svelte/core/routing';
import type { StyleguideState, StyleguideAction } from './styleguide.types.js';
import { serializeStyleguideState } from './styleguide.routing.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface StyleguideDependencies {}

// ============================================================================
// URL Sync Effect
// ============================================================================

// Create the URL sync effect function (called once)
const urlSyncEffect = createURLSyncEffect<StyleguideState, StyleguideAction>(
  serializeStyleguideState
);

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
      const newState = {
        ...state,
        selectedComponent: action.componentId
      };
      return [
        newState,
        urlSyncEffect(newState)
      ];
    }

    case 'homeSelected': {
      const newState = {
        ...state,
        selectedComponent: null
      };
      return [
        newState,
        urlSyncEffect(newState)
      ];
    }

    default: {
      return [state, Effect.none()];
    }
  }
};
