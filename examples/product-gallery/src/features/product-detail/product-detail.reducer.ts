import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { destinationSlot, ManagedIntegrationBuilder } from '@composable-svelte/core/application';
import { createDestination } from '@composable-svelte/core/navigation';
import type {
  InfoAction,
  InfoState,
  ProductDetailAction,
  ProductDetailDestination,
  ProductDetailState
} from './product-detail.types.js';
import { createInfoState } from './product-detail.types.js';
import { createAddToCartState } from '../add-to-cart/add-to-cart.types.js';
import { createShareState } from '../share/share.types.js';
import { createQuickViewState } from '../quick-view/quick-view.types.js';
import { createDeleteAlertState } from '../delete-alert/delete-alert.types.js';
import { addToCartReducer } from '../add-to-cart/add-to-cart.reducer.js';
import { shareReducer } from '../share/share.reducer.js';
import { quickViewReducer } from '../quick-view/quick-view.reducer.js';
import { deleteAlertReducer } from '../delete-alert/delete-alert.reducer.js';

export type ProductDetailDependencies = Record<never, never>;

const infoReducer: Reducer<InfoState, InfoAction, ProductDetailDependencies> = (state) => [
  state,
  Effect.none()
];

export const productDetailDestination = createDestination({
  addToCart: addToCartReducer,
  share: shareReducer,
  quickView: quickViewReducer,
  deleteAlert: deleteAlertReducer,
  info: infoReducer
});

export const productDetailDestinationSlot = destinationSlot<ProductDetailState, ProductDetailAction>()(
  'destination',
  productDetailDestination
);

function presenting(destination: ProductDetailDestination): ProductDetailState['presentation'] {
  return { status: 'presenting', content: destination, duration: 300 };
}
function dismissing(destination: ProductDetailDestination): ProductDetailState['presentation'] {
  return { status: 'dismissing', content: destination, duration: 300 };
}

export const productDetailReducer: Reducer<
  ProductDetailState,
  ProductDetailAction,
  ProductDetailDependencies
> = (state, action) => {
  switch (action.type) {
    case 'addToCartButtonTapped': {
      const destination = productDetailDestination.initial('addToCart', createAddToCartState(state.productId));
      return [{ ...state, destination, presentation: presenting(destination) }, Effect.none()];
    }
    case 'shareButtonTapped': {
      const destination = productDetailDestination.initial('share', createShareState(state.productId));
      return [{ ...state, destination, presentation: presenting(destination) }, Effect.none()];
    }
    case 'quickViewButtonTapped': {
      const destination = productDetailDestination.initial('quickView', createQuickViewState(state.productId));
      return [{ ...state, destination, presentation: presenting(destination) }, Effect.none()];
    }
    case 'deleteButtonTapped': {
      const destination = productDetailDestination.initial('deleteAlert', createDeleteAlertState(state.productId));
      return [{ ...state, destination, presentation: presenting(destination) }, Effect.none()];
    }
    case 'infoButtonTapped': {
      const destination = productDetailDestination.initial('info', createInfoState(state.productId));
      return [{ ...state, destination, presentation: presenting(destination) }, Effect.none()];
    }
    case 'destination': {
      if (action.action.type === 'dismiss') {
        if (!state.destination || state.presentation.status !== 'presented') {
          return [state, Effect.none()];
        }
        return [{ ...state, presentation: dismissing(state.destination) }, Effect.none()];
      }
      const destination = state.destination;
      if (!destination) return [state, Effect.none()];
      const child = action.action.action;
      if (destination.type !== child.type) return [state, Effect.none()];
      if (child.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{
          ...state,
          presentation: { status: 'presented', content: destination }
        }, Effect.none()];
      }
      if (child.action.type === 'dismissalCompleted') {
        if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
        return [{ ...state, destination: null, presentation: { status: 'idle' } }, Effect.none()];
      }
      const closes =
        (child.type === 'addToCart' && (child.action.type === 'addConfirmed' || child.action.type === 'cancelButtonTapped')) ||
        (child.type === 'share' && (child.action.type === 'shareButtonTapped' || child.action.type === 'cancelButtonTapped')) ||
        (child.type === 'quickView' && child.action.type === 'closeButtonTapped') ||
        (child.type === 'deleteAlert' && (child.action.type === 'deleteConfirmed' || child.action.type === 'cancelButtonTapped')) ||
        (child.type === 'info' && (child.action.type === 'closeButtonTapped' || child.action.type === 'cancelButtonTapped'));
      return closes && state.presentation.status === 'presented'
        ? [{ ...state, presentation: dismissing(destination) }, Effect.none()]
        : [state, Effect.none()];
    }
    default:
      return [state, Effect.none()];
  }
};

const productDetailBuilder = new ManagedIntegrationBuilder(productDetailReducer)
  .with(productDetailDestinationSlot, {
    dismissal: 'deferred',
    replaceOn: (action) =>
      action.type === 'addToCartButtonTapped' ||
      action.type === 'shareButtonTapped' ||
      action.type === 'quickViewButtonTapped' ||
      action.type === 'deleteButtonTapped' ||
      action.type === 'infoButtonTapped'
  });
export const productDetailComposition: ReturnType<typeof productDetailBuilder.build> = productDetailBuilder.build();
