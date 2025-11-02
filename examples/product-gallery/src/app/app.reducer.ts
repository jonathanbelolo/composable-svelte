import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { integrate } from '@composable-svelte/core/navigation';
import { createURLSyncEffect } from '@composable-svelte/core/routing';
import type { AppState, AppAction } from './app.types.js';
import { addToCart } from '../models/cart.js';
import { createProductDetailState } from '../features/product-detail/product-detail.types.js';
import { productDetailReducer } from '../features/product-detail/product-detail.reducer.js';
import { serializeAppState } from './app.routing.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface AppDependencies {
  // No external dependencies for this example
}

// ============================================================================
// URL Sync Effect
// ============================================================================

// Create the URL sync effect function (called once at module level)
const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
  serializeAppState
);

// ============================================================================
// Core Reducer (without child integration)
// ============================================================================

const coreReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'productClicked': {
      // Show product detail using tree-based navigation WITH animation
      const detailState = createProductDetailState(action.productId);
      const newState = {
        ...state,
        productDetail: detailState,
        presentation: {
          status: 'presenting',
          content: detailState,
          duration: 300  // 300ms animation
        }
      };
      return [
        newState,
        urlSyncEffect(newState)
      ];
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
          const newState = {
            ...state,
            productDetail: null,
            presentation: { status: 'idle' }
          };
          return [
            newState,
            urlSyncEffect(newState)
          ];
        }

        default:
          return [state, Effect.none()];
      }
    }

    case 'categoryToggled': {
      const { selectedCategories } = state.filters;
      const isSelected = selectedCategories.includes(action.category);

      return [
        {
          ...state,
          filters: {
            selectedCategories: isSelected
              ? selectedCategories.filter((c) => c !== action.category)
              : [...selectedCategories, action.category]
          }
        },
        Effect.none()
      ];
    }

    case 'viewModeChanged': {
      return [
        {
          ...state,
          viewMode: action.mode
        },
        Effect.none()
      ];
    }

    case 'sidebarToggled': {
      return [
        {
          ...state,
          sidebarExpanded: !state.sidebarExpanded
        },
        Effect.none()
      ];
    }

    case 'cartItemAdded': {
      return [
        {
          ...state,
          cart: addToCart(state.cart, action.productId, action.quantity)
        },
        Effect.none()
      ];
    }

    case 'productDeleted': {
      return [
        {
          ...state,
          products: state.products.filter((p) => p.id !== action.productId),
          // Also dismiss the detail view since product is deleted
          productDetail: null
        },
        Effect.none()
      ];
    }

    case 'favoriteToggled': {
      return [
        {
          ...state,
          products: state.products.map((p) =>
            p.id === action.productId ? { ...p, isFavorite: !p.isFavorite } : p
          )
        },
        Effect.none()
      ];
    }

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// App Reducer (Phase 3 DSL - with integrate())
// ============================================================================

// Phase 2 manual pattern (before):
// case 'productDetail': {
//   const [newState, effect] = ifLetPresentation(
//     (s: AppState) => s.productDetail,
//     (s: AppState, detail) => ({ ...s, productDetail: detail }),
//     'productDetail',
//     (childAction): AppAction => ({ type: 'productDetail', action: { type: 'presented', action: childAction } }),
//     productDetailReducer
//   )(state, action, deps);
//   return [newState, effect];
// }

const integratedReducer = integrate(coreReducer)
  .with('productDetail', productDetailReducer)
  .build();

// Wrap integrated reducer to handle dismiss animations
export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  // Check if this is a dismiss action
  if (
    action.type === 'productDetail' &&
    action.action.type === 'dismiss' &&
    state.presentation.status === 'presented' &&
    state.presentation.content
  ) {
    // Start dismissing animation instead of immediately clearing productDetail
    return [
      {
        ...state,
        presentation: {
          status: 'dismissing',
          content: state.presentation.content,
          duration: 200  // 200ms dismiss animation
        }
      },
      Effect.none()
    ];
  }

  // Otherwise, let the integrated reducer handle it
  return integratedReducer(state, action, deps);
};
