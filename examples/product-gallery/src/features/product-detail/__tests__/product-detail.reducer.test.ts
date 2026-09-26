import { describe, it, expect } from 'vitest';
import { productDetailReducer, type ProductDetailDependencies } from '../product-detail.reducer.js';
import type { ProductDetailState } from '../product-detail.types.js';

describe('ProductDetail Reducer', () => {
  const initialState: ProductDetailState = {
    productId: 'prod-1',
    destination: null,
    presentation: { status: 'idle' }
  };

  const mockDeps: ProductDetailDependencies = {};

  describe('addToCartButtonTapped', () => {
    it('shows addToCart destination', () => {
      const [newState] = productDetailReducer(
        initialState,
        { type: 'addToCartButtonTapped' },
        mockDeps
      );

      expect(newState.destination?.type).toBe('addToCart');
      if (newState.destination?.type === 'addToCart') {
        expect(newState.destination.state.productId).toBe('prod-1');
        expect(newState.destination.state.quantity).toBe(1);
      }
    });
  });

  describe('shareButtonTapped', () => {
    it('shows share destination', () => {
      const [newState] = productDetailReducer(
        initialState,
        { type: 'shareButtonTapped' },
        mockDeps
      );

      expect(newState.destination?.type).toBe('share');
      if (newState.destination?.type === 'share') {
        expect(newState.destination.state.productId).toBe('prod-1');
        expect(newState.destination.state.selectedMethod).toBeNull();
      }
    });
  });

  describe('quickViewButtonTapped', () => {
    it('shows quickView destination', () => {
      const [newState] = productDetailReducer(
        initialState,
        { type: 'quickViewButtonTapped' },
        mockDeps
      );

      expect(newState.destination?.type).toBe('quickView');
      if (newState.destination?.type === 'quickView') {
        expect(newState.destination.state.productId).toBe('prod-1');
      }
    });
  });

  describe('deleteButtonTapped', () => {
    it('shows delete destination', () => {
      const [newState] = productDetailReducer(
        initialState,
        { type: 'deleteButtonTapped' },
        mockDeps
      );

      expect(newState.destination?.type).toBe('deleteAlert');
      if (newState.destination?.type === 'deleteAlert') {
        expect(newState.destination.state.productId).toBe('prod-1');
      }
    });
  });

  describe('infoButtonTapped', () => {
    it('shows info destination', () => {
      const [newState] = productDetailReducer(
        initialState,
        { type: 'infoButtonTapped' },
        mockDeps
      );

      expect(newState.destination?.type).toBe('info');
      if (newState.destination?.type === 'info') {
        expect(newState.destination.state.productId).toBe('prod-1');
      }
    });
  });

  describe('destination - addToCart flow', () => {
    it('observes the reducer-owned add output and starts dismissal', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'addToCart',
          state: { productId: 'prod-1', quantity: 3 }
        },
        presentation: {
          status: 'presented',
          content: {
            type: 'addToCart',
            state: { productId: 'prod-1', quantity: 3 }
          }
        }
      };

      const [newState, effect] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: {
              type: 'addToCart',
              action: { type: 'addConfirmed', productId: 'prod-1', quantity: 3 }
            }
          }
        },
        mockDeps
      );

      expect(newState.destination).toBe(state.destination);
      expect(newState.presentation.status).toBe('dismissing');
      expect(effect._tag).toBe('None');
    });
  });

  describe('destination - share flow', () => {
    it('observes share completion and dismisses', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'share',
          state: { productId: 'prod-1', selectedMethod: 'twitter' }
        },
        presentation: {
          status: 'presented',
          content: {
            type: 'share',
            state: { productId: 'prod-1', selectedMethod: 'twitter' }
          }
        }
      };

      const [newState] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: {
              type: 'share',
              action: { type: 'shareButtonTapped' }
            }
          }
        },
        mockDeps
      );

      // The reducer starts a dismissal animation rather than clearing the
      // destination outright; `destination` is nulled on `dismissalCompleted`.
      expect(newState.presentation.status).toBe('dismissing');
      expect(newState.destination).not.toBeNull();
    });
  });

  describe('destination - deleteAlert flow', () => {
    it('observes the reducer-owned delete output and starts dismissal', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'deleteAlert',
          state: {
            productId: 'prod-1'
          }
        },
        presentation: {
          status: 'presented',
          content: { type: 'deleteAlert', state: { productId: 'prod-1' } }
        }
      };

      const [newState, effect] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: {
              type: 'deleteAlert',
              action: { type: 'deleteConfirmed', productId: 'prod-1' }
            }
          }
        },
        mockDeps
      );

      expect(newState.destination).toBe(state.destination);
      expect(newState.presentation.status).toBe('dismissing');
      expect(effect._tag).toBe('None');
    });

    it('dismisses on delete cancel', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'deleteAlert',
          state: {
            productId: 'prod-1'
          }
        },
        presentation: {
          status: 'presented',
          content: { type: 'deleteAlert', state: { productId: 'prod-1' } }
        }
      };

      const [newState] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: {
              type: 'deleteAlert',
              action: { type: 'cancelButtonTapped' }
            }
          }
        },
        mockDeps
      );

      expect(newState.destination).toBe(state.destination);
      expect(newState.presentation.status).toBe('dismissing');
    });
  });

  describe('destination - dismiss', () => {
    it('retains the exact destination during dismissal and clears it on case-owned completion', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'info',
          state: { productId: 'prod-1' }
        },
        presentation: {
          status: 'presented',
          content: { type: 'info', state: { productId: 'prod-1' } }
        }
      };

      const [newState] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: { type: 'dismiss' }
        },
        mockDeps
      );

      expect(newState.destination).toBe(state.destination);
      expect(newState.presentation).toEqual({
        status: 'dismissing',
        content: state.destination,
        duration: 300
      });

      const [completed] = productDetailReducer(
        newState,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: { type: 'info', action: { type: 'dismissalCompleted' } }
          }
        },
        mockDeps
      );
      expect(completed.destination).toBeNull();
      expect(completed.presentation).toEqual({ status: 'idle' });
    });
  });
});
