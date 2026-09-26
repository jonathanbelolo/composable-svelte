// ============================================================================
// DeleteAlert Feature Types
// ============================================================================

export interface DeleteAlertState {
  productId: string;
}

export type DeleteAlertAction =
  | { type: 'confirmButtonTapped' }
  | { type: 'cancelButtonTapped' }
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' }
  | { type: 'deleteConfirmed'; productId: string };

// ============================================================================
// Factory Functions
// ============================================================================

export function createDeleteAlertState(productId: string): DeleteAlertState {
  return { productId };
}
