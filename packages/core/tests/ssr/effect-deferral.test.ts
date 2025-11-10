import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/lib/store';
import { Effect } from '../../src/lib/effect';
import type { Reducer } from '../../src/lib/types';

interface TestState {
  count: number;
  data: string | null;
}

type TestAction =
  | { type: 'increment' }
  | { type: 'loadData' }
  | { type: 'dataLoaded'; data: string };

describe('Effect deferral configuration', () => {
  describe('in browser environment (default behavior)', () => {
    it('executes effects normally by default', async () => {
      let effectRan = false;

      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'loadData') {
          return [
            state,
            Effect.run((dispatch) => {
              effectRan = true;
              dispatch({ type: 'dataLoaded', data: 'test' });
            })
          ];
        }
        if (action.type === 'dataLoaded') {
          return [{ ...state, data: action.data }, Effect.none()];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'loadData' });

      // Wait for effect
      await new Promise(resolve => setTimeout(resolve, 50));

      // Effect should have run in browser
      expect(effectRan).toBe(true);
      expect(store.state.data).toBe('test');
    });

    it('Effect.none always works', () => {
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'increment') {
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'increment' });

      expect(store.state.count).toBe(1);
    });

    it('state updates work independently of effects', () => {
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            { ...state, count: state.count + 1 },
            Effect.run(() => {
              // Some side effect
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'increment' });
      store.dispatch({ type: 'increment' });
      store.dispatch({ type: 'increment' });

      // State updates should work regardless of effects
      expect(store.state.count).toBe(3);
    });
  });

  describe('SSR configuration', () => {
    it('accepts ssr.deferEffects config', () => {
      const reducer: Reducer<TestState, TestAction> = (state) => [state, Effect.none()];

      // Should not throw
      const store = createStore({
        initialState: { count: 0, data: null },
        reducer,
        ssr: {
          deferEffects: true
        }
      });

      expect(store.state).toEqual({ count: 0, data: null });
    });

    it('accepts ssr.deferEffects: false', () => {
      const reducer: Reducer<TestState, TestAction> = (state) => [state, Effect.none()];

      // Should not throw
      const store = createStore({
        initialState: { count: 0, data: null },
        reducer,
        ssr: {
          deferEffects: false
        }
      });

      expect(store.state).toEqual({ count: 0, data: null });
    });

    it('works without ssr config (undefined)', () => {
      const reducer: Reducer<TestState, TestAction> = (state) => [state, Effect.none()];

      // Should not throw
      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
        // No ssr config
      });

      expect(store.state).toEqual({ count: 0, data: null });
    });
  });

  describe('effect execution behavior', () => {
    it('Effect.batch works correctly', async () => {
      let effect1Ran = false;
      let effect2Ran = false;

      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'loadData') {
          return [
            state,
            Effect.batch(
              Effect.run(() => { effect1Ran = true; }),
              Effect.fireAndForget(() => { effect2Ran = true; })
            )
          ];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'loadData' });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Both effects should run in browser
      expect(effect1Ran).toBe(true);
      expect(effect2Ran).toBe(true);
    });

    it('Effect.fireAndForget works correctly', async () => {
      let effectRan = false;

      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            { ...state, count: state.count + 1 },
            Effect.fireAndForget(() => {
              effectRan = true;
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'increment' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(effectRan).toBe(true);
      expect(store.state.count).toBe(1);
    });

    it('Effect.afterDelay works correctly', async () => {
      let effectRan = false;

      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            { ...state, count: state.count + 1 },
            Effect.afterDelay(20, () => {
              effectRan = true;
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = createStore({
        initialState: { count: 0, data: null },
        reducer
      });

      store.dispatch({ type: 'increment' });

      // Should not have run yet
      expect(effectRan).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(effectRan).toBe(true);
    });
  });
});
