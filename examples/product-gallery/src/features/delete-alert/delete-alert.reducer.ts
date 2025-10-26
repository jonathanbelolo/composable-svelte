import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { DeleteAlertState, DeleteAlertAction } from './delete-alert.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface DeleteAlertDependencies {
  dismiss: () => void;
  onConfirm?: () => void;
}

// ============================================================================
// DeleteAlert Reducer
// ============================================================================

export const deleteAlertReducer: Reducer<
  DeleteAlertState,
  DeleteAlertAction,
  DeleteAlertDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'confirmButtonTapped':
      if (deps.onConfirm) {
        return [
          state,
          Effect.run((dispatch) => {
            deps.onConfirm!();
          })
        ];
      }
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
