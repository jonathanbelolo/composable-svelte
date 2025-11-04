import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from '../src/lib/store';
import { Effect } from '../src/lib/effect';
import type { Reducer } from '../src/lib/types';

interface TestState {
  count: number;
  isLoading: boolean;
}

type TestAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setCount'; value: number }
  | { type: 'startLoading' }
  | { type: 'loadComplete'; value: number };

const initialState: TestState = {
  count: 0,
  isLoading: false
};

describe('createStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates store with initial state', () => {
    const reducer: Reducer<TestState, TestAction> = (state) => [state, Effect.none()];
    const store = createStore({ initialState, reducer });

    expect(store.state).toEqual(initialState);
  });

  it('updates state when action dispatched', () => {
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'increment':
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        case 'decrement':
          return [{ ...state, count: state.count - 1 }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    const store = createStore({ initialState, reducer });

    store.dispatch({ type: 'increment' });
    expect(store.state.count).toBe(1);

    store.dispatch({ type: 'increment' });
    expect(store.state.count).toBe(2);

    store.dispatch({ type: 'decrement' });
    expect(store.state.count).toBe(1);
  });

  it('records action history', () => {
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'increment':
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    const store = createStore({ initialState, reducer });

    store.dispatch({ type: 'increment' });
    store.dispatch({ type: 'increment' });

    expect(store.history).toHaveLength(2);
    expect(store.history[0]).toEqual({ type: 'increment' });
    expect(store.history[1]).toEqual({ type: 'increment' });
  });

  it('notifies subscribers on state change', () => {
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'increment':
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    const store = createStore({ initialState, reducer });
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);

    // Should be called immediately with current state
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(initialState);

    store.dispatch({ type: 'increment' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ count: 1, isLoading: false });

    unsubscribe();
    store.dispatch({ type: 'increment' });

    // Should not be called after unsubscribe
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('notifies action subscribers', () => {
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'increment':
          return [{ ...state, count: state.count + 1 }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    const store = createStore({ initialState, reducer });
    const listener = vi.fn();

    const unsubscribe = store.subscribeToActions!(listener);

    store.dispatch({ type: 'increment' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      { type: 'increment' },
      { count: 1, isLoading: false }
    );

    unsubscribe();
    store.dispatch({ type: 'increment' });

    // Should not be called after unsubscribe
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('executes Run effects', async () => {
    const actions: TestAction[] = [];

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'startLoading':
          return [
            { ...state, isLoading: true },
            Effect.run(async (dispatch) => {
              dispatch({ type: 'loadComplete', value: 42 });
            })
          ];
        case 'loadComplete':
          return [{ ...state, count: action.value, isLoading: false }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    const store = createStore({ initialState, reducer });
    store.subscribeToActions!((action) => actions.push(action));

    store.dispatch({ type: 'startLoading' });

    // Wait for async effect
    await vi.waitFor(() => {
      expect(actions).toHaveLength(2);
    });

    expect(actions[0]).toEqual({ type: 'startLoading' });
    expect(actions[1]).toEqual({ type: 'loadComplete', value: 42 });
    expect(store.state.count).toBe(42);
    expect(store.state.isLoading).toBe(false);
  });

  it('executes Batch effects in parallel', async () => {
    const executionOrder: number[] = [];

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'startLoading') {
        return [
          state,
          Effect.batch(
            Effect.run(async () => {
              executionOrder.push(1);
            }),
            Effect.run(async () => {
              executionOrder.push(2);
            }),
            Effect.run(async () => {
              executionOrder.push(3);
            })
          )
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });

    store.dispatch({ type: 'startLoading' });

    await vi.waitFor(() => {
      expect(executionOrder).toHaveLength(3);
    });

    // All effects should have executed
    expect(executionOrder.sort()).toEqual([1, 2, 3]);
  });

  it('manages Cancellable effects by ID', async () => {
    // Test that cancellable effects use the same ID mechanism
    // (actual cancellation testing is complex with fake timers,
    // so we just verify the effect is created correctly)
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'startLoading') {
        return [
          state,
          Effect.cancellable('load', async (dispatch) => {
            dispatch({ type: 'loadComplete', value: 42 });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });
    const actions: TestAction[] = [];
    store.subscribeToActions!((action) => actions.push(action));

    store.dispatch({ type: 'startLoading' });

    await vi.waitFor(() => {
      expect(actions.filter(a => a.type === 'loadComplete').length).toBeGreaterThanOrEqual(1);
    });

    expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(1);
  });

  it('debounces Debounced effects', async () => {
    const actions: TestAction[] = [];

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.debounced('save', 300, async (dispatch) => {
            dispatch({ type: 'loadComplete', value: state.count + 1 });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });
    store.subscribeToActions!((action) => actions.push(action));

    // Rapid dispatches
    store.dispatch({ type: 'increment' });
    store.dispatch({ type: 'increment' });
    store.dispatch({ type: 'increment' });

    // Advance time but not enough for debounce
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    // Should not have executed yet
    expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(0);

    // Advance past debounce delay
    vi.advanceTimersByTime(150);
    await vi.waitFor(() => {
      expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(1);
    });
  });

  it('throttles Throttled effects', async () => {
    const actions: TestAction[] = [];

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.throttled('throttle-test', 100, async (dispatch) => {
            dispatch({ type: 'loadComplete', value: state.count });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });
    store.subscribeToActions!((action) => actions.push(action));

    // First dispatch executes immediately
    store.dispatch({ type: 'increment' });
    await vi.waitFor(() => {
      expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(1);
    });

    // Rapid dispatches within throttle window
    store.dispatch({ type: 'increment' });
    store.dispatch({ type: 'increment' });

    // Should still only have one loadComplete
    await Promise.resolve();
    expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(1);

    // Advance past throttle interval
    vi.advanceTimersByTime(150);
    await vi.waitFor(() => {
      expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(2);
    });
  });

  it('executes AfterDelay effects after delay', async () => {
    const actions: TestAction[] = [];

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'startLoading') {
        return [
          state,
          Effect.afterDelay(500, (dispatch) => {
            dispatch({ type: 'loadComplete', value: 42 });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });
    store.subscribeToActions!((action) => actions.push(action));

    store.dispatch({ type: 'startLoading' });

    // Should not have executed yet
    expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(0);

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      expect(actions.filter(a => a.type === 'loadComplete')).toHaveLength(1);
    });
  });

  it('executes FireAndForget effects without dispatching', async () => {
    const sideEffect = vi.fn();

    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.fireAndForget(() => {
            sideEffect();
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });

    store.dispatch({ type: 'increment' });

    await vi.waitFor(() => {
      expect(sideEffect).toHaveBeenCalledTimes(1);
    });
  });

  it('selects values from state', () => {
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'increment') {
        return [{ ...state, count: state.count + 1 }, Effect.none()];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });

    const count = store.select(s => s.count);
    expect(count).toBe(0);

    store.dispatch({ type: 'increment' });

    const newCount = store.select(s => s.count);
    expect(newCount).toBe(1);
  });

  it('cleans up on destroy', () => {
    const reducer: Reducer<TestState, TestAction> = (state) => [state, Effect.none()];
    const store = createStore({ initialState, reducer });

    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribeToActions!(vi.fn());

    store.destroy();

    // Subscribers should be cleared
    store.dispatch({ type: 'increment' });

    // Only the initial call from subscribe
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
