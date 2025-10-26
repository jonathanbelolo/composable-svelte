import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { QuickViewState, QuickViewAction } from './quick-view.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface QuickViewDependencies {
  dismiss: () => void;
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
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[QuickView] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
