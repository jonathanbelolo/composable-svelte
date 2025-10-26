import { describe, it, expect } from 'vitest';
import { productDetailReducer, type ProductDetailDependencies } from '../product-detail.reducer.js';
import type { ProductDetailState } from '../product-detail.types.js';
import { Effect } from '@composable-svelte/core';

describe('ProductDetail Reducer', () => {
  const initialState: ProductDetailState = {
    productId: 'prod-1',
    destination: null
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

      expect(newState.destination?.type).toBe('delete');
      if (newState.destination?.type === 'delete') {
        expect(newState.destination.productId).toBe('prod-1');
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
        expect(newState.destination.productId).toBe('prod-1');
      }
    });
  });

  describe('destination - addToCart flow', () => {
    it('observes addToCart completion and dismisses', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'addToCart',
          state: { productId: 'prod-1', quantity: 3 }
        }
      };

      let cartAdded = false;
      const deps: ProductDetailDependencies = {
        onCartItemAdded: (productId, quantity) => {
          cartAdded = true;
          expect(productId).toBe('prod-1');
          expect(quantity).toBe(3);
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
              action: { type: 'addButtonTapped' }
            }
          }
        },
        deps
      );

      expect(newState.destination).toBeNull();
      expect(effect._tag).toBe('Batch');
    });
  });

  describe('destination - share flow', () => {
    it('observes share completion and dismisses', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'share',
          state: { productId: 'prod-1', selectedMethod: 'twitter' }
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

      expect(newState.destination).toBeNull();
    });
  });

  describe('destination - delete flow', () => {
    it('observes delete confirmation and calls onProductDeleted', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'delete',
          productId: 'prod-1'
        }
      };

      let productDeleted = false;
      const deps: ProductDetailDependencies = {
        onProductDeleted: (productId) => {
          productDeleted = true;
          expect(productId).toBe('prod-1');
        }
      };

      const [newState] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: { type: 'deleteConfirmed' }
          }
        },
        deps
      );

      expect(newState.destination).toBeNull();
    });

    it('dismisses on delete cancel', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'delete',
          productId: 'prod-1'
        }
      };

      const [newState] = productDetailReducer(
        state,
        {
          type: 'destination',
          action: {
            type: 'presented',
            action: { type: 'deleteCancelled' }
          }
        },
        mockDeps
      );

      expect(newState.destination).toBeNull();
    });
  });

  describe('destination - dismiss', () => {
    it('dismisses any destination on dismiss action', () => {
      const state: ProductDetailState = {
        productId: 'prod-1',
        destination: {
          type: 'info',
          productId: 'prod-1'
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

      expect(newState.destination).toBeNull();
    });
  });
});
