import { describe, it, expect, vi } from 'vitest';
import { shareReducer, type ShareDependencies } from '../share.reducer.js';
import type { ShareState } from '../share.types.js';

describe('Share Reducer', () => {
  const initialState: ShareState = {
    productId: 'prod-1',
    selectedMethod: null
  };

  const mockDeps: ShareDependencies = {
    dismiss: () => {}
  };

  describe('methodSelected', () => {
    it('selects email method', () => {
      const [newState] = shareReducer(
        initialState,
        { type: 'methodSelected', method: 'email' },
        mockDeps
      );

      expect(newState.selectedMethod).toBe('email');
    });

    it('selects twitter method', () => {
      const [newState] = shareReducer(
        initialState,
        { type: 'methodSelected', method: 'twitter' },
        mockDeps
      );

      expect(newState.selectedMethod).toBe('twitter');
    });

    it('can change selected method', () => {
      const state: ShareState = { productId: 'prod-1', selectedMethod: 'email' };
      const [newState] = shareReducer(
        state,
        { type: 'methodSelected', method: 'facebook' },
        mockDeps
      );

      expect(newState.selectedMethod).toBe('facebook');
    });

    it('selects all methods', () => {
      const methods: Array<'email' | 'twitter' | 'facebook' | 'link'> = [
        'email',
        'twitter',
        'facebook',
        'link'
      ];

      methods.forEach((method) => {
        const [newState] = shareReducer(
          initialState,
          { type: 'methodSelected', method },
          mockDeps
        );
        expect(newState.selectedMethod).toBe(method);
      });
    });
  });

  describe('shareButtonTapped', () => {
    it('returns state unchanged when method is selected - parent observes', () => {
      const state: ShareState = { productId: 'prod-1', selectedMethod: 'email' };
      const [newState] = shareReducer(state, { type: 'shareButtonTapped' }, mockDeps);

      // Child doesn't change state - parent observes and handles dismissal
      expect(newState).toEqual(state);
    });

    it('returns state unchanged when no method selected', () => {
      const [newState] = shareReducer(initialState, { type: 'shareButtonTapped' }, mockDeps);

      // No method selected, state remains unchanged
      expect(newState).toEqual(initialState);
    });

    it('logs share action', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const state: ShareState = { productId: 'prod-1', selectedMethod: 'twitter' };

      shareReducer(state, { type: 'shareButtonTapped' }, mockDeps);

      expect(consoleLogSpy).toHaveBeenCalledWith('[Share] Sharing via twitter');
      consoleLogSpy.mockRestore();
    });
  });

  describe('cancelButtonTapped', () => {
    it('returns state unchanged - parent observes action', () => {
      const [newState] = shareReducer(initialState, { type: 'cancelButtonTapped' }, mockDeps);

      // Child doesn't change state - parent observes and handles dismissal
      expect(newState).toEqual(initialState);
    });
  });
});
