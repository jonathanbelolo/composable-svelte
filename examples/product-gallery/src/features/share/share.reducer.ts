import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { ShareState, ShareAction } from './share.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface ShareDependencies {
  // No dependencies needed - parent observes actions
}

// ============================================================================
// Share Reducer
// ============================================================================

export const shareReducer: Reducer<ShareState, ShareAction, ShareDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'methodSelected':
      return [
        {
          ...state,
          selectedMethod: action.method
        },
        Effect.none()
      ];

    case 'shareButtonTapped':
      return [
        state,
        state.selectedMethod
          ? Effect.run(() => {
              console.log(`[Share] Sharing via ${state.selectedMethod}`);
            })
          : Effect.none()
      ];

    case 'cancelButtonTapped':
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
