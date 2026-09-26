import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import {
  defineApplication,
  ManagedIntegrationBuilder,
  optionalSlot
} from '@composable-svelte/core/application';
import type { AppAction, AppInitialInput, AppState } from './app.types.js';
import { createInitialAppState } from './app.types.js';
import { addToCart } from '../models/cart.js';
import { createProductDetailState } from '../features/product-detail/product-detail.types.js';
import { productDetailComposition } from '../features/product-detail/product-detail.reducer.js';
import { appRouting, parseAppURL } from './app.routing.js';

export type AppDependencies = Record<never, never>;

const coreReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action) => {
  switch (action.type) {
    case 'productClicked': {
      if (!state.products.some((product) => product.id === action.productId)) {
        return [{ ...state, productDetail: null, presentation: { status: 'idle' } }, Effect.none()];
      }
      const productDetail = createProductDetailState(action.productId);
      return [{
        ...state,
        productDetail,
        presentation: { status: 'presenting', content: productDetail, duration: 300 }
      }, Effect.none()];
    }
    case 'productDetail': {
      if (action.action.type === 'dismiss') {
        if (!state.productDetail || state.presentation.status !== 'presented') {
          return [state, Effect.none()];
        }
        return [{
          ...state,
          presentation: {
            status: 'dismissing',
            content: state.productDetail,
            duration: 200
          }
        }, Effect.none()];
      }
      const child = action.action.action;
      if (child.type === 'rootPresentationCompleted') {
        if (!state.productDetail || state.presentation.status !== 'presenting') {
          return [state, Effect.none()];
        }
        return [{
          ...state,
          presentation: { status: 'presented', content: state.productDetail }
        }, Effect.none()];
      }
      if (child.type === 'rootDismissalCompleted') {
        if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
        return [{ ...state, productDetail: null, presentation: { status: 'idle' } }, Effect.none()];
      }
      if (child.type !== 'destination' || child.action.type !== 'presented') {
        return [state, Effect.none()];
      }
      const output = child.action.action;
      if (output.type === 'addToCart' && output.action.type === 'addConfirmed') {
        return [{
          ...state,
          cart: addToCart(state.cart, output.action.productId, output.action.quantity)
        }, Effect.none()];
      }
      if (output.type === 'deleteAlert' && output.action.type === 'deleteConfirmed') {
        const productId = output.action.productId;
        return [{
          ...state,
          products: state.products.filter((product) => product.id !== productId),
          productDetail: null,
          presentation: { status: 'idle' }
        }, Effect.none()];
      }
      return [state, Effect.none()];
    }
    case 'presentation': {
      if (action.event.type === 'dismissalRequested') {
        if (!state.productDetail) {
          return [{ ...state, presentation: { status: 'idle' } }, Effect.none()];
        }
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{
          ...state,
          presentation: {
            status: 'dismissing',
            content: state.productDetail,
            duration: 200
          }
        }, Effect.none()];
      }
      return [state, Effect.none()];
    }
    case 'filtersCleared':
      return [{ ...state, filters: { selectedCategories: [] } }, Effect.none()];
    case 'categoryToggled': {
      const selected = state.filters.selectedCategories;
      return [{
        ...state,
        filters: {
          selectedCategories: selected.includes(action.category)
            ? selected.filter((category) => category !== action.category)
            : [...selected, action.category]
        }
      }, Effect.none()];
    }
    case 'viewModeChanged':
      return [{ ...state, viewMode: action.mode }, Effect.none()];
    case 'sidebarToggled':
      return [{ ...state, sidebarExpanded: !state.sidebarExpanded }, Effect.none()];
    case 'favoriteToggled':
      return [{
        ...state,
        products: state.products.map((product) => product.id === action.productId
          ? { ...product, isFavorite: !product.isFavorite }
          : product)
      }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

export const productDetailSlot = optionalSlot<AppState, AppAction>()('productDetail');

const appBuilder = new ManagedIntegrationBuilder(coreReducer)
  .with(productDetailSlot, productDetailComposition, {
    replaceOn: (action) => action.type === 'productClicked',
    dismissal: 'deferred'
  });

export const appComposition = appBuilder.build();

export const galleryApplication = defineApplication(appComposition, {
  initialState: (input: AppInitialInput) =>
    createInitialAppState(input.products, parseAppURL(input.url)),
  routing: appRouting
});

export const appReducer = appComposition.reducer;
