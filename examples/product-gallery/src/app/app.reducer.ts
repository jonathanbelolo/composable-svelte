// @ts-nocheck - Temporary: ifLetPresentation has type inference issues with Effect mapping
import type { Reducer, EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { ifLetPresentation } from '@composable-svelte/core/navigation';
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
      // Show product detail using tree-based navigation
      const detailState = createProductDetailState(action.productId);
      return [
        {
          ...state,
          productDetail: detailState
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

    case 'productDetail': {
      // Handle product detail navigation with ifLetPresentation
      // Provide dependencies for child feature
      const productDetailDeps = {
        onCartItemAdded: (productId: string, quantity: number) => {
          // Parent observes and handles - dispatch action to update cart
          // This will be handled via Effect, so no direct dispatch here
        },
        onProductDeleted: (productId: string) => {
          // Parent observes and handles - will be triggered via Effect
        }
      };

      // @ts-expect-error - ifLetPresentation effect typing issue
      const [newState, effect] = ifLetPresentation(
        (s: AppState) => s.productDetail,
        (s: AppState, detail) => ({ ...s, productDetail: detail }),
        'productDetail',
        productDetailReducer
      )(state, action, productDetailDeps);

      // Observe dismiss action to hide detail
      if ('action' in action && action.action.type === 'dismiss') {
        // @ts-expect-error - ifLetPresentation effect typing issue
        return [{ ...newState, productDetail: null }, effect];
      }

      // @ts-expect-error - ifLetPresentation effect typing issue
      return [newState, effect];
    }

    default:
      return [state, Effect.none()];
  }
};
