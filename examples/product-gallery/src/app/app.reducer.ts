import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { handleStackAction } from '@composable-svelte/core/navigation';
import type { AppState, AppAction } from './app.types.js';
import { addToCart } from '../models/cart.js';
import { createProductDetailState } from '../features/product-detail/product-detail.types.js';
import { productDetailReducer } from '../features/product-detail/product-detail.reducer.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface AppDependencies {
  // No external dependencies for this example
}

// ============================================================================
// App Reducer
// ============================================================================

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'productClicked': {
      // Push product detail onto stack
      const detailState = createProductDetailState(action.productId);
      return [
        {
          ...state,
          detailPath: [...state.detailPath, detailState]
        },
        Effect.none()
      ];
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
          // Also pop the detail view from stack since product is deleted
          detailPath: state.detailPath.slice(0, -1)
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

    case 'detailPath': {
      // Handle stack navigation with handleStackAction
      return handleStackAction(
        (s: AppState) => s.detailPath,
        (s: AppState, path) => ({ ...s, detailPath: path }),
        (a: AppAction) => (a.type === 'detailPath' ? a.action : null),
        (sa) => ({ type: 'detailPath' as const, action: sa }),
        productDetailReducer,
        {
          onCartItemAdded: (productId, quantity) => {
            // This will be dispatched as an effect
            return { type: 'cartItemAdded' as const, productId, quantity };
          },
          onProductDeleted: (productId) => {
            return { type: 'productDeleted' as const, productId };
          }
        }
      )(state, action, deps);
    }

    default:
      return [state, Effect.none()];
  }
};
