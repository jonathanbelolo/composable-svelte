import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { DeleteAlertState, DeleteAlertAction } from './delete-alert.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export type DeleteAlertDependencies = Record<never, never>;

// ============================================================================
// DeleteAlert Reducer
// ============================================================================

export const deleteAlertReducer: Reducer<
  DeleteAlertState,
  DeleteAlertAction,
  DeleteAlertDependencies
> = (state, action, _deps) => {
  switch (action.type) {
    case 'confirmButtonTapped': {
      const isValidProductId =
        typeof state?.productId === 'string' && state.productId.trim().length > 0;

      if (!isValidProductId) {
        return [state, Effect.none()];
      }

      const { productId } = state;
      return [
        state,
        Effect.run((dispatch) => dispatch({ type: 'deleteConfirmed', productId }))
      ];
    }

    case 'deleteConfirmed':
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
