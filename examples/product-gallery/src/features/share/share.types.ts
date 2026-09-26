// ============================================================================
// Share Feature Types
// ============================================================================

export type ShareMethod = 'email' | 'twitter' | 'facebook' | 'link';

export interface ShareState {
  productId: string;
  selectedMethod: ShareMethod | null;
}

export type ShareAction =
  | { type: 'methodSelected'; method: ShareMethod }
  | { type: 'shareButtonTapped' }
  | { type: 'cancelButtonTapped' }
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };

// ============================================================================
// Factory Functions
// ============================================================================

export function createShareState(productId: string): ShareState {
  return {
    productId,
    selectedMethod: null
  };
}
