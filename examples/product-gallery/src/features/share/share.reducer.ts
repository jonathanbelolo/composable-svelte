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
      // In a real app, would trigger share action here
      // For demo, just log and let parent observe to dismiss
      if (state.selectedMethod) {
        console.log(`[Share] Sharing via ${state.selectedMethod}`);
      }
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
