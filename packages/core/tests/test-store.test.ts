import { describe, it, expect } from 'vitest';
import { TestStore, createTestStore } from '../src/test/test-store';
import { Effect } from '../src/effect';
import type { Reducer } from '../src/types';

interface CounterState {
  count: number;
  isLoading: boolean;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'loadTapped' }
  | { type: 'loadCompleted'; value: number };

const initialState: CounterState = {
  count: 0,
  isLoading: false
};

describe('TestStore', () => {
  describe('send()', () => {
    it('sends action and asserts state', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        switch (action.type) {
          case 'increment':
            return [{ ...state, count: state.count + 1 }, Effect.none()];
          default:
            return [state, Effect.none()];
        }
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' }, (state) => {
        expect(state.count).toBe(1);
      });

      await store.send({ type: 'increment' }, (state) => {
        expect(state.count).toBe(2);
      });
    });

    it('executes effects immediately', async () => {
      vi.useFakeTimers();

      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        switch (action.type) {
          case 'loadTapped':
            return [
              { ...state, isLoading: true },
              Effect.run(async (dispatch) => {
                dispatch({ type: 'loadCompleted', value: 42 });
              })
            ];
          case 'loadCompleted':
            return [
              { ...state, count: action.value, isLoading: false },
              Effect.none()
            ];
          default:
            return [state, Effect.none()];
        }
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'loadTapped' });

      // Effects execute and state is updated immediately in TestStore
      // (after effects complete, isLoading will be false)
      await store.advanceTime(0); // Wait for effects
      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().count).toBe(42);

      vi.useRealTimers();
    });
  });

  describe('receive()', () => {
    it('waits for and asserts effect-dispatched actions', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        switch (action.type) {
          case 'loadTapped':
            return [
              { ...state, isLoading: true },
              Effect.run(async (dispatch) => {
                dispatch({ type: 'loadCompleted', value: 42 });
              })
            ];
          case 'loadCompleted':
            return [
              { ...state, count: action.value, isLoading: false },
              Effect.none()
            ];
          default:
            return [state, Effect.none()];
        }
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'loadTapped' });

      await store.receive({ type: 'loadCompleted' }, (state) => {
        expect(state.count).toBe(42);
        expect(state.isLoading).toBe(false);
      });
    });

    it('matches partial actions', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            state,
            Effect.run(async (dispatch) => {
              dispatch({ type: 'loadCompleted', value: 100 });
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });

      // Match with full action
      await store.receive({ type: 'loadCompleted', value: 100 });
    });

    it('throws error if action not received', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state) => {
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });

      await expect(async () => {
        await store.receive({ type: 'loadCompleted' });
      }).rejects.toThrow('Expected to receive action matching');
    });

    it('handles nested effect dispatches', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        switch (action.type) {
          case 'increment':
            return [
              state,
              Effect.run(async (dispatch) => {
                dispatch({ type: 'loadTapped' });
              })
            ];
          case 'loadTapped':
            return [
              state,
              Effect.run(async (dispatch) => {
                dispatch({ type: 'loadCompleted', value: 42 });
              })
            ];
          case 'loadCompleted':
            return [{ ...state, count: action.value }, Effect.none()];
          default:
            return [state, Effect.none()];
        }
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });

      await store.receive({ type: 'loadTapped' });
      await store.receive({ type: 'loadCompleted' });

      expect(store.getState().count).toBe(42);
    });
  });

  describe('assertNoPendingActions()', () => {
    it('passes when no pending actions in exhaustive mode', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            { ...state, count: state.count + 1 },
            Effect.run(async (dispatch) => {
              dispatch({ type: 'loadCompleted', value: 1 });
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });
      await store.receive({ type: 'loadCompleted' });

      expect(() => store.assertNoPendingActions()).not.toThrow();
    });

    it('throws when pending actions in exhaustive mode', async () => {
      vi.useFakeTimers();

      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            state,
            Effect.run(async (dispatch) => {
              dispatch({ type: 'loadCompleted', value: 1 });
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });

      // Wait for effects but don't receive
      await store.advanceTime(0);

      expect(() => store.assertNoPendingActions()).toThrow(
        'Expected no pending actions'
      );

      vi.useRealTimers();
    });

    it('passes with pending actions in non-exhaustive mode', async () => {
      vi.useFakeTimers();

      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        if (action.type === 'increment') {
          return [
            state,
            Effect.run(async (dispatch) => {
              dispatch({ type: 'loadCompleted', value: 1 });
            })
          ];
        }
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });
      store.exhaustivity = 'off';

      await store.send({ type: 'increment' });
      await store.advanceTime(0);

      expect(() => store.assertNoPendingActions()).not.toThrow();

      vi.useRealTimers();
    });
  });

  describe('getState()', () => {
    it('returns current state', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state, action) => {
        if (action.type === 'increment') {
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        }
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      expect(store.getState()).toEqual(initialState);

      await store.send({ type: 'increment' });

      expect(store.getState()).toEqual({ count: 1, isLoading: false });
    });
  });

  describe('getHistory()', () => {
    it('returns action history', async () => {
      const reducer: Reducer<CounterState, CounterAction> = (state) => {
        return [state, Effect.none()];
      };

      const store = new TestStore({ initialState, reducer });

      await store.send({ type: 'increment' });
      await store.send({ type: 'decrement' });

      const history = store.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ type: 'increment' });
      expect(history[1]).toEqual({ type: 'decrement' });
    });
  });

  describe('createTestStore()', () => {
    it('creates a TestStore instance', () => {
      const reducer: Reducer<CounterState, CounterAction> = (state) => {
        return [state, Effect.none()];
      };

      const store = createTestStore({ initialState, reducer });

      expect(store).toBeInstanceOf(TestStore);
      expect(store.getState()).toEqual(initialState);
    });
  });
});
