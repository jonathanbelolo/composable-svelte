import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { ShareState, ShareAction } from './share.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface ShareDependencies {
  dismiss: () => void;
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
      // For demo, just dismiss
      if (state.selectedMethod) {
        console.log(`[Share] Sharing via ${state.selectedMethod}`);
        try {
          deps.dismiss();
        } catch (error) {
          console.error('[Share] Failed to dismiss:', error);
        }
      }
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[Share] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
