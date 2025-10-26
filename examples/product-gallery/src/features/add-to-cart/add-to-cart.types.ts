// ============================================================================
// AddToCart Feature Types
// ============================================================================

export interface AddToCartState {
  productId: string;
  quantity: number;
}

export type AddToCartAction =
  | { type: 'incrementQuantity' }
  | { type: 'decrementQuantity' }
  | { type: 'addButtonTapped' }
  | { type: 'cancelButtonTapped' };

// ============================================================================
// Factory Functions
// ============================================================================

export function createAddToCartState(productId: string): AddToCartState {
  return {
    productId,
    quantity: 1
  };
}
