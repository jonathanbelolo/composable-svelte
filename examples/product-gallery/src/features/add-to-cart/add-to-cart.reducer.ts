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

    case 'addButtonTapped': {
      const isValidProductId =
        typeof state?.productId === 'string' && state.productId.trim().length > 0;
      const isValidQuantity =
        typeof state?.quantity === 'number' &&
        Number.isInteger(state.quantity) &&
        state.quantity >= 1;

      if (!isValidProductId || !isValidQuantity) {
        return [state, Effect.none()];
      }

      const { productId, quantity } = state;
      return [
        state,
        Effect.run((dispatch) => dispatch({ type: 'addConfirmed', productId, quantity }))
      ];
    }

    case 'addConfirmed':
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
