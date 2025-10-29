import type { Reducer, EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { ifLetPresentation } from '@composable-svelte/core/navigation';
import type {
  ProductDetailState,
  ProductDetailAction,
  ProductDetailDestination,
  ProductDetailDestinationAction
} from './product-detail.types.js';
import { createAddToCartState } from '../add-to-cart/add-to-cart.types.js';
import { createShareState } from '../share/share.types.js';
import { createQuickViewState } from '../quick-view/quick-view.types.js';
import { createDeleteAlertState } from '../delete-alert/delete-alert.types.js';
import { addToCartReducer, type AddToCartDependencies } from '../add-to-cart/add-to-cart.reducer.js';
import { shareReducer, type ShareDependencies } from '../share/share.reducer.js';
import { quickViewReducer, type QuickViewDependencies } from '../quick-view/quick-view.reducer.js';
import { deleteAlertReducer, type DeleteAlertDependencies } from '../delete-alert/delete-alert.reducer.js';

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
  AddToCartDependencies | ShareDependencies | QuickViewDependencies | DeleteAlertDependencies
> = (state, action, deps) => {
  switch (state.type) {
    case 'addToCart': {
      if (action.type === 'addToCart') {
        const [childState, childEffect] = addToCartReducer(state.state, action.action, deps);
        return [
          { type: 'addToCart' as const, state: childState },
          Effect.map(childEffect, (childAction) => ({
            type: 'addToCart' as const,
            action: childAction
          }))
        ];
      }
      return [state, Effect.none()];
    }

    case 'share': {
      if (action.type === 'share') {
        const [childState, childEffect] = shareReducer(state.state, action.action, deps);
        return [
          { type: 'share' as const, state: childState },
          Effect.map(childEffect, (childAction) => ({
            type: 'share' as const,
            action: childAction
          }))
        ];
      }
      return [state, Effect.none()];
    }

    case 'quickView': {
      if (action.type === 'quickView') {
        const [childState, childEffect] = quickViewReducer(state.state, action.action, deps);
        return [
          { type: 'quickView' as const, state: childState },
          Effect.map(childEffect, (childAction) => ({
            type: 'quickView' as const,
            action: childAction
          }))
        ];
      }
      return [state, Effect.none()];
    }

    case 'deleteAlert': {
      if (action.type === 'deleteAlert') {
        const deleteAlertDeps: DeleteAlertDependencies = {
          dismiss: () => {} // Handled by parent observation
        };
        const [childState, childEffect] = deleteAlertReducer(state.state, action.action, deleteAlertDeps);
        return [
          { type: 'deleteAlert' as const, state: childState },
          Effect.map(childEffect, (childAction) => ({
            type: 'deleteAlert' as const,
            action: childAction
          }))
        ];
      }
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
    case 'addToCartButtonTapped': {
      const destinationState = {
        type: 'addToCart' as const,
        state: createAddToCartState(state.productId)
      };
      return [
        {
          ...state,
          destination: destinationState,
          presentation: {
            status: 'presenting',
            content: destinationState,
            duration: 300
          }
        },
        Effect.none()
      ];
    }

    case 'shareButtonTapped': {
      const destinationState = {
        type: 'share' as const,
        state: createShareState(state.productId)
      };
      return [
        {
          ...state,
          destination: destinationState,
          presentation: {
            status: 'presenting',
            content: destinationState,
            duration: 300
          }
        },
        Effect.none()
      ];
    }

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
            type: 'deleteAlert',
            state: createDeleteAlertState(state.productId)
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
      // Handle child destinations with ifLetPresentation
      const [newState, effect] = ifLetPresentation(
        (s: ProductDetailState) => s.destination,
        (s: ProductDetailState, d: ProductDetailDestination | null) => ({ ...s, destination: d }),
        'destination',
        (childAction): ProductDetailAction => ({ type: 'destination', action: { type: 'presented', action: childAction } }),
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

      // AddToCart canceled
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'addToCart' &&
        presentedAction.action.action.type === 'cancelButtonTapped'
      ) {
        // Start dismissal animation
        if (state.destination) {
          return [
            {
              ...newState,
              presentation: {
                status: 'dismissing',
                content: state.destination,
                duration: 300
              }
            },
            effect
          ];
        }
        return [{ ...newState, destination: null, presentation: { status: 'idle' } }, effect];
      }

      // Share completed
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'share' &&
        presentedAction.action.action.type === 'shareButtonTapped'
      ) {
        // Start dismissal animation
        if (state.destination) {
          return [
            {
              ...newState,
              presentation: {
                status: 'dismissing',
                content: state.destination,
                duration: 300
              }
            },
            effect
          ];
        }
        return [{ ...newState, destination: null, presentation: { status: 'idle' } }, effect];
      }

      // Share canceled
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'share' &&
        presentedAction.action.action.type === 'cancelButtonTapped'
      ) {
        // Start dismissal animation
        if (state.destination) {
          return [
            {
              ...newState,
              presentation: {
                status: 'dismissing',
                content: state.destination,
                duration: 300
              }
            },
            effect
          ];
        }
        return [{ ...newState, destination: null, presentation: { status: 'idle' } }, effect];
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

      // Delete alert - intercept dismiss actions
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action?.type === 'deleteAlert' &&
        (presentedAction.action.action?.type === 'cancelButtonTapped' ||
         presentedAction.action.action?.type === 'confirmButtonTapped')
      ) {
        // Dismiss the alert, keep ProductDetail open
        return [{ ...newState, destination: null }, effect];
      }

      return [newState, effect];
    }

    case 'presentation': {
      switch (action.event.type) {
        case 'presentationCompleted': {
          // Animation finished - mark as presented
          if (state.presentation.status === 'presenting' && state.presentation.content) {
            return [
              {
                ...state,
                presentation: {
                  status: 'presented',
                  content: state.presentation.content
                }
              },
              Effect.none()
            ];
          }
          return [state, Effect.none()];
        }

        case 'dismissalCompleted': {
          // Dismissal animation finished - clear everything
          return [
            {
              ...state,
              destination: null,
              presentation: { status: 'idle' }
            },
            Effect.none()
          ];
        }

        default:
          return [state, Effect.none()];
      }
    }

    default:
      return [state, Effect.none()];
  }
};
