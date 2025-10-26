// ============================================================================
// DeleteAlert Feature Types
// ============================================================================

export interface DeleteAlertState {
  productId: string;
}

export type DeleteAlertAction =
  | { type: 'confirmButtonTapped' }
  | { type: 'cancelButtonTapped' };

// ============================================================================
// Factory Functions
// ============================================================================

export function createDeleteAlertState(productId: string): DeleteAlertState {
  return { productId };
}
