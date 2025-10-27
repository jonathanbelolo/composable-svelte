import { describe, it, expect } from 'vitest';
import { addToCartReducer, type AddToCartDependencies } from '../add-to-cart.reducer.js';
import type { AddToCartState } from '../add-to-cart.types.js';

describe('AddToCart Reducer', () => {
  const initialState: AddToCartState = {
    productId: 'prod-1',
    quantity: 1
  };

  const mockDeps: AddToCartDependencies = {
    dismiss: () => {}
  };

  describe('incrementQuantity', () => {
    it('increments quantity by 1', () => {
      const [newState] = addToCartReducer(initialState, { type: 'incrementQuantity' }, mockDeps);

      expect(newState.quantity).toBe(2);
    });

    it('increments from higher quantity', () => {
      const state: AddToCartState = { productId: 'prod-1', quantity: 5 };
      const [newState] = addToCartReducer(state, { type: 'incrementQuantity' }, mockDeps);

      expect(newState.quantity).toBe(6);
    });
  });

  describe('decrementQuantity', () => {
    it('decrements quantity by 1', () => {
      const state: AddToCartState = { productId: 'prod-1', quantity: 3 };
      const [newState] = addToCartReducer(state, { type: 'decrementQuantity' }, mockDeps);

      expect(newState.quantity).toBe(2);
    });

    it('does not decrement below 1', () => {
      const [newState] = addToCartReducer(initialState, { type: 'decrementQuantity' }, mockDeps);

      expect(newState.quantity).toBe(1);
    });

    it('enforces minimum of 1 even from 0', () => {
      const state: AddToCartState = { productId: 'prod-1', quantity: 0 };
      const [newState] = addToCartReducer(state, { type: 'decrementQuantity' }, mockDeps);

      expect(newState.quantity).toBe(1);
    });
  });

  describe('addButtonTapped', () => {
    it('returns state unchanged - parent observes action', () => {
      const [newState] = addToCartReducer(initialState, { type: 'addButtonTapped' }, mockDeps);
      // Child doesn't change state - parent observes and handles dismissal
      expect(newState).toEqual(initialState);
    });
  });

  describe('cancelButtonTapped', () => {
    it('returns state unchanged - parent observes action', () => {
      const [newState] = addToCartReducer(initialState, { type: 'cancelButtonTapped' }, mockDeps);
      // Child doesn't change state - parent observes and handles dismissal
      expect(newState).toEqual(initialState);
    });
  });
});
