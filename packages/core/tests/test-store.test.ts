import { describe, it, expect } from 'vitest';
import { TestStore, createTestStore } from '../src/lib/test/test-store';
import { Effect } from '../src/lib/effect';
import type { Reducer } from '../src/lib/types';

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

      // A partial with a different value does not match, even though a
      // loadCompleted is pending — otherwise "partial" would mean "any action
      // of this type".
      await expect(
        store.receive({ type: 'loadCompleted', value: 999 }, undefined, 50)
      ).rejects.toThrow('Expected to receive action');

      // A subset of the fields does match.
      await store.receive({ type: 'loadCompleted' });
      store.assertNoPendingActions();
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
    });

    it('passes with pending actions in non-exhaustive mode', async () => {
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

describe('TestStore models cancellation the way the store does', () => {
  /**
   * TestStore used to run a cancellable as `effect.execute(dispatch)` — no
   * controller, no registry, no gating. So re-registering an id did not cancel
   * the effect already running under it, both dispatched, and the executor
   * received no signal.
   *
   * That is the one effect type whose entire purpose is cancellation, and it
   * meant any reducer using a fixed id to make a second request supersede the
   * first behaved one way in production and another under test. The session
   * logout does exactly that; so does the auth login flow.
   */
  interface RaceState {
    landed: string[];
  }
  type RaceAction = { type: 'start'; label: string } | { type: 'landed'; label: string };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('aborts the effect already running under the same id', async () => {
    const first = deferred<void>();
    const second = deferred<void>();

    const reducer: Reducer<RaceState, RaceAction, Record<string, never>> = (state, action) => {
      if (action.type === 'landed') {
        return [{ landed: [...state.landed, action.label] }, Effect.none()];
      }
      const gate = action.label === 'first' ? first.promise : second.promise;
      return [
        state,
        Effect.cancellable<RaceAction>('race', async (dispatch) => {
          await gate;
          dispatch({ type: 'landed', label: action.label });
        })
      ];
    };

    const store = createTestStore({
      initialState: { landed: [] } as RaceState,
      reducer,
      dependencies: {}
    });

    await store.send({ type: 'start', label: 'first' });
    await store.send({ type: 'start', label: 'second' });

    first.resolve();
    second.resolve();

    await store.receive({ type: 'landed' });

    expect(store.state.landed, 'the superseded effect still dispatched').toEqual(['second']);
    store.assertNoPendingActions();
  });

  it('hands the executor a signal, so it can cooperate', async () => {
    // The real store passes one; TestStore called `execute(dispatch)` with a
    // single argument, so `signal` was `undefined` and any executor forwarding
    // it to `fetch` was silently passing nothing under test.
    let received: AbortSignal | undefined;

    const reducer: Reducer<RaceState, RaceAction, Record<string, never>> = (state) => [
      state,
      Effect.cancellable<RaceAction>('sig', async (_dispatch, signal) => {
        received = signal;
      })
    ];

    const store = createTestStore({
      initialState: { landed: [] } as RaceState,
      reducer,
      dependencies: {}
    });

    await store.send({ type: 'start', label: 'x' });

    expect(received, 'no signal reached the executor').toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(false);
  });

  it('Effect.cancel aborts an in-flight cancellable, not only a subscription', async () => {
    const held = deferred<void>();
    let aborted = false;

    const reducer: Reducer<RaceState, RaceAction, Record<string, never>> = (state, action) => {
      if (action.type === 'landed') {
        return [{ landed: [...state.landed, action.label] }, Effect.none()];
      }
      if (action.label === 'stop') {
        return [state, Effect.cancel<RaceAction>('work')];
      }
      return [
        state,
        Effect.cancellable<RaceAction>('work', async (dispatch, signal) => {
          await held.promise;
          aborted = signal?.aborted ?? false;
          dispatch({ type: 'landed', label: 'work' });
        })
      ];
    };

    const store = createTestStore({
      initialState: { landed: [] } as RaceState,
      reducer,
      dependencies: {}
    });

    await store.send({ type: 'start', label: 'work' });
    await store.send({ type: 'start', label: 'stop' });

    held.resolve();
    await new Promise((r) => setTimeout(r, 10));

    expect(aborted, 'the signal was not aborted by Effect.cancel').toBe(true);
    expect(store.state.landed, 'a cancelled effect still dispatched').toEqual([]);
  });
});
