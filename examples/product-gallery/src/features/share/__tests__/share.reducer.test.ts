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
    it('calls dismiss when method is selected', () => {
      let dismissCalled = false;
      const deps: ShareDependencies = {
        dismiss: () => {
          dismissCalled = true;
        }
      };

      const state: ShareState = { productId: 'prod-1', selectedMethod: 'email' };
      shareReducer(state, { type: 'shareButtonTapped' }, deps);

      expect(dismissCalled).toBe(true);
    });

    it('does not dismiss when no method selected', () => {
      let dismissCalled = false;
      const deps: ShareDependencies = {
        dismiss: () => {
          dismissCalled = true;
        }
      };

      shareReducer(initialState, { type: 'shareButtonTapped' }, deps);

      expect(dismissCalled).toBe(false);
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
    it('calls dismiss dependency', () => {
      let dismissCalled = false;
      const deps: ShareDependencies = {
        dismiss: () => {
          dismissCalled = true;
        }
      };

      shareReducer(initialState, { type: 'cancelButtonTapped' }, deps);

      expect(dismissCalled).toBe(true);
    });
  });
});
