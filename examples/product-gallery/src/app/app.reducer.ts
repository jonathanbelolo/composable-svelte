import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { integrate } from '@composable-svelte/core/navigation';
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
// Core Reducer (without child integration)
// ============================================================================

const coreReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
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

export const appReducer = integrate(coreReducer)
  .with('productDetail', productDetailReducer)
  .build();
