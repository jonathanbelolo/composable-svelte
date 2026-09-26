// ============================================================================
// QuickView Feature Types
// ============================================================================

export interface QuickViewState {
  productId: string;
}

export type QuickViewAction =
  | { type: 'closeButtonTapped' }
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };

// ============================================================================
// Factory Functions
// ============================================================================

export function createQuickViewState(productId: string): QuickViewState {
  return {
    productId
  };
}
