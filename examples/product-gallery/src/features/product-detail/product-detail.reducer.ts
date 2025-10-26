import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { ifLet } from '@composable-svelte/core/navigation';
import type {
  ProductDetailState,
  ProductDetailAction,
  ProductDetailDestination,
  ProductDetailDestinationAction
} from './product-detail.types.js';
import { createAddToCartState } from '../add-to-cart/add-to-cart.types.js';
import { createShareState } from '../share/share.types.js';
import { createQuickViewState } from '../quick-view/quick-view.types.js';
import { addToCartReducer, type AddToCartDependencies } from '../add-to-cart/add-to-cart.reducer.js';
import { shareReducer, type ShareDependencies } from '../share/share.reducer.js';
import { quickViewReducer, type QuickViewDependencies } from '../quick-view/quick-view.reducer.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface ProductDetailDependencies {
  onCartItemAdded?: (productId: string, quantity: number) => void;
  onProductDeleted?: (productId: string) => void;
}

// ============================================================================
// Destination Reducer
// ============================================================================

const destinationReducer: Reducer<
  ProductDetailDestination,
  ProductDetailDestinationAction,
  AddToCartDependencies | ShareDependencies | QuickViewDependencies
> = (state, action) => {
  switch (state.type) {
    case 'addToCart': {
      if (action.type === 'addToCart') {
        return addToCartReducer(state.state, action.action, { dismiss: () => {} });
      }
      return [state, Effect.none()];
    }

    case 'share': {
      if (action.type === 'share') {
        return shareReducer(state.state, action.action, { dismiss: () => {} });
      }
      return [state, Effect.none()];
    }

    case 'quickView': {
      if (action.type === 'quickView') {
        return quickViewReducer(state.state, action.action, { dismiss: () => {} });
      }
      return [state, Effect.none()];
    }

    case 'delete': {
      // Alert actions handled in parent
      return [state, Effect.none()];
    }

    case 'info': {
      // Popover actions handled in parent
      return [state, Effect.none()];
    }

    default: {
      const _exhaustive: never = state;
      return [_exhaustive, Effect.none()];
    }
  }
};

// ============================================================================
// ProductDetail Reducer
// ============================================================================

export const productDetailReducer: Reducer<
  ProductDetailState,
  ProductDetailAction,
  ProductDetailDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'addToCartButtonTapped':
      return [
        {
          ...state,
          destination: {
            type: 'addToCart',
            state: createAddToCartState(state.productId)
          }
        },
        Effect.none()
      ];

    case 'shareButtonTapped':
      return [
        {
          ...state,
          destination: {
            type: 'share',
            state: createShareState(state.productId)
          }
        },
        Effect.none()
      ];

    case 'quickViewButtonTapped':
      return [
        {
          ...state,
          destination: {
            type: 'quickView',
            state: createQuickViewState(state.productId)
          }
        },
        Effect.none()
      ];

    case 'deleteButtonTapped':
      return [
        {
          ...state,
          destination: {
            type: 'delete',
            productId: state.productId
          }
        },
        Effect.none()
      ];

    case 'infoButtonTapped':
      return [
        {
          ...state,
          destination: {
            type: 'info',
            productId: state.productId
          }
        },
        Effect.none()
      ];

    case 'destination': {
      // Handle child destinations with ifLet
      const [newState, effect] = ifLet(
        (s: ProductDetailState) => s.destination,
        (s: ProductDetailState, d: ProductDetailDestination | null) => ({ ...s, destination: d }),
        (a: ProductDetailAction) => (a.type === 'destination' ? a.action : null),
        (ca) => ({ type: 'destination' as const, action: ca }),
        destinationReducer
      )(state, action, deps);

      // Observe child actions for parent updates
      const presentedAction = action.action;

      // AddToCart completed
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'addToCart' &&
        presentedAction.action.action.type === 'addButtonTapped'
      ) {
        const addToCartState = state.destination;
        if (addToCartState?.type === 'addToCart') {
          const { productId, quantity } = addToCartState.state;

          // Notify parent and dismiss
          if (deps.onCartItemAdded) {
            return [
              { ...newState, destination: null },
              Effect.batch(
                effect,
                Effect.run((dispatch) => {
                  deps.onCartItemAdded!(productId, quantity);
                })
              )
            ];
          }
        }
      }

      // Share completed
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'share' &&
        presentedAction.action.action.type === 'shareButtonTapped'
      ) {
        // Just dismiss
        return [{ ...newState, destination: null }, effect];
      }

      // QuickView closed
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'quickView' &&
        presentedAction.action.action.type === 'closeButtonTapped'
      ) {
        // Just dismiss
        return [{ ...newState, destination: null }, effect];
      }

      // Delete confirmed
      if (presentedAction.type === 'presented' && presentedAction.action.type === 'deleteConfirmed') {
        if (deps.onProductDeleted) {
          return [
            { ...newState, destination: null },
            Effect.batch(
              effect,
              Effect.run((dispatch) => {
                deps.onProductDeleted!(state.productId);
              })
            )
          ];
        }
        return [{ ...newState, destination: null }, effect];
      }

      // Delete cancelled or dismiss
      if (
        presentedAction.type === 'dismiss' ||
        (presentedAction.type === 'presented' && presentedAction.action.type === 'deleteCancelled')
      ) {
        return [{ ...newState, destination: null }, effect];
      }

      return [newState, effect];
    }

    default:
      return [state, Effect.none()];
  }
};
