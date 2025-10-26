import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { AddToCartState, AddToCartAction } from './add-to-cart.types.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface AddToCartDependencies {
  dismiss: () => void;
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
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[AddToCart] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[AddToCart] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
