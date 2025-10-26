import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { AddToCartState, AddToCartAction } from './add-to-cart.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface AddToCartDependencies {
  // No dependencies needed - parent observes actions
}

// ============================================================================
// AddToCart Reducer
// ============================================================================

export const addToCartReducer: Reducer<
  AddToCartState,
  AddToCartAction,
  AddToCartDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'incrementQuantity':
      return [
        {
          ...state,
          quantity: state.quantity + 1
        },
        Effect.none()
      ];

    case 'decrementQuantity':
      return [
        {
          ...state,
          quantity: Math.max(1, state.quantity - 1) // Minimum quantity is 1
        },
        Effect.none()
      ];

    case 'addButtonTapped':
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      // Parent observes this action and dismisses
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
