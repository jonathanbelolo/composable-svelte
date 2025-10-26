import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { QuickViewState, QuickViewAction } from './quick-view.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface QuickViewDependencies {
  // No dependencies needed - parent observes actions
}

// ============================================================================
// QuickView Reducer
// ============================================================================

export const quickViewReducer: Reducer<QuickViewState, QuickViewAction, QuickViewDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'closeButtonTapped':
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
