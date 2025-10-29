import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
import type { AddToCartState, AddToCartAction } from '../add-to-cart/add-to-cart.types.js';
import type { ShareState, ShareAction } from '../share/share.types.js';
import type { QuickViewState, QuickViewAction } from '../quick-view/quick-view.types.js';
import type { DeleteAlertState, DeleteAlertAction } from '../delete-alert/delete-alert.types.js';

// ============================================================================
// ProductDetail Feature Types
// ============================================================================

export interface ProductDetailState {
  productId: string;
  destination: ProductDetailDestination | null;
  presentation: PresentationState<ProductDetailDestination>;
}

export type ProductDetailDestination =
  | { type: 'addToCart'; state: AddToCartState }
  | { type: 'share'; state: ShareState }
  | { type: 'quickView'; state: QuickViewState }
  | { type: 'deleteAlert'; state: DeleteAlertState }
  | { type: 'info'; productId: string };

export type PresentationEvent =
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };

export type ProductDetailAction =
  | { type: 'addToCartButtonTapped' }
  | { type: 'shareButtonTapped' }
  | { type: 'quickViewButtonTapped' }
  | { type: 'deleteButtonTapped' }
  | { type: 'infoButtonTapped' }
  | { type: 'destination'; action: PresentationAction<ProductDetailDestinationAction> }
  | { type: 'presentation'; event: PresentationEvent };

export type ProductDetailDestinationAction =
  | { type: 'addToCart'; action: AddToCartAction }
  | { type: 'share'; action: ShareAction }
  | { type: 'quickView'; action: QuickViewAction }
  | { type: 'deleteAlert'; action: DeleteAlertAction };

// ============================================================================
// Factory Functions
// ============================================================================

export function createProductDetailState(productId: string): ProductDetailState {
  return {
    productId,
    destination: null,
    presentation: { status: 'idle' }
  };
}
