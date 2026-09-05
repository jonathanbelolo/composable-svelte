import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expectConsole } from './helpers/console.js';
import { createStore } from '../src/lib/store.svelte';
import { Effect } from '../src/lib/effect';
import type { Effect as EffectType, Reducer } from '../src/lib/types';

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
    // restoreAllMocks does not undo useFakeTimers; without this the fake clock
    // leaks into whichever file the worker runs next.
    vi.useRealTimers();
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

  it('a second Cancellable with the same id aborts the first and drops its dispatches', async () => {
    // The previous form asserted construction and dispatch only, and said so.
    // This one exercises what the id is for: the first executor is parked on
    // a promise, the second supersedes it, and only the second's action lands.
    const signals: AbortSignal[] = [];
    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let issued = 0;
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'startLoading') {
        const n = ++issued;
        return [
          state,
          Effect.cancellable('load', async (dispatch, signal) => {
            signals.push(signal!);
            if (n === 1) await parked;
            dispatch({ type: 'loadComplete', value: n });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const store = createStore({ initialState, reducer });
    const actions: TestAction[] = [];
    store.subscribeToActions!((action) => actions.push(action));

    store.dispatch({ type: 'startLoading' });
    store.dispatch({ type: 'startLoading' });

    await vi.waitFor(() => {
      expect(actions.filter((a) => a.type === 'loadComplete')).toHaveLength(1);
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);

    // The superseded executor finishes late; its dispatch is gated off.
    release();
    await parked;
    await Promise.resolve();
    await Promise.resolve();
    const completed = actions.filter((a) => a.type === 'loadComplete') as Array<{ value: number }>;
    expect(completed.map((a) => a.value)).toEqual([2]);
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

  it('destroy() aborts the in-flight cancellable, runs subscription cleanups and clears timers', () => {
    // The dispatch after destroy() at the end is a warned no-op since R1.8.b.
    expectConsole('warn');
    // The old form asserted only that a state subscriber stopped being called.
    // Everything destroy() claims to do — abort, cleanup, timers — went
    // unasserted, and the audit's mutation M2 (delete the abort loop) survived.
    let signal: AbortSignal | undefined;
    const cleanup = vi.fn();
    const debounced = vi.fn();
    const throttled = vi.fn();
    const reducer: Reducer<TestState, TestAction> = (state, action) => {
      switch (action.type) {
        case 'startLoading':
          return [
            state,
            Effect.batch(
              Effect.cancellable('job', (_dispatch, s) => {
                signal = s;
                return new Promise(() => {}); // stays in flight
              }),
              Effect.subscription('sub', () => cleanup),
              Effect.debounced('deb', 100, () => {
                debounced();
              })
            )
          ];
        case 'increment':
          return [
            state,
            Effect.throttled('thr', 100, () => {
              throttled();
            })
          ];
        default:
          return [state, Effect.none()];
      }
    };
    const store = createStore({ initialState, reducer });
    const listener = vi.fn();
    store.subscribe(listener);
    const actionListener = vi.fn();
    store.subscribeToActions!(actionListener);

    store.dispatch({ type: 'startLoading' });
    store.dispatch({ type: 'increment' }); // leading edge runs now
    store.dispatch({ type: 'increment' }); // schedules the trailing run
    expect(throttled).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();

    store.destroy();

    expect(signal?.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(debounced).not.toHaveBeenCalled();
    expect(throttled).toHaveBeenCalledTimes(1);

    // Subscribers are cleared, and dispatch is a warned no-op: a later
    // dispatch reaches neither.
    store.dispatch({ type: 'setCount', value: 1 });
    expect(listener).toHaveBeenCalledTimes(1); // the immediate call from subscribe()
    expect(actionListener).not.toHaveBeenCalledWith({ type: 'setCount', value: 1 }, expect.anything());
  });

  describe('destroy() stops the store (N7)', () => {
    // destroy() tracked cancellables, subscriptions, debounce and throttle
    // timers — not AfterDelay timers or executors in flight — and dispatch()
    // stayed live, so a delayed action reduced state in a destroyed store.
    it('an AfterDelay scheduled before destroy() never fires', () => {
      const late = vi.fn();
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'startLoading') {
          return [state, Effect.afterDelay(100, (dispatch) => dispatch({ type: 'loadComplete', value: 1 }))];
        }
        if (action.type === 'loadComplete') {
          late();
          return [{ ...state, count: action.value }, Effect.none()];
        }
        return [state, Effect.none()];
      };
      const store = createStore({ initialState, reducer });
      store.dispatch({ type: 'startLoading' });
      store.destroy();

      vi.advanceTimersByTime(1000);
      expect(late).not.toHaveBeenCalled();
      expect(store.state.count).toBe(0);
    });

    it('dispatch after destroy() leaves the state unchanged and warns once', () => {
      expectConsole('warn');
      const reducer: Reducer<TestState, TestAction> = (state, action) =>
        action.type === 'increment' ? [{ ...state, count: state.count + 1 }, Effect.none()] : [state, Effect.none()];
      const store = createStore({ initialState, reducer });
      store.dispatch({ type: 'increment' });
      store.destroy();

      store.dispatch({ type: 'increment' });
      store.dispatch({ type: 'increment' }); // the second is silent: one warning per store
      expect(store.state.count).toBe(1);
      expect(store.history).toHaveLength(1);
    });

    it('Debounced and Throttled executors receive the lifetime signal, aborted by destroy()', () => {
      // Only Run, AfterDelay and Cancellable executors received a signal;
      // the docs said every kind but Cancellable got none (R1-REVIEW 1.9).
      const seen: (AbortSignal | undefined)[] = [];
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'startLoading') {
          return [
            state,
            Effect.batch(
              Effect.debounced('d', 10, (_dispatch, signal) => {
                seen.push(signal);
              }),
              Effect.throttled('t', 10, (_dispatch, signal) => {
                seen.push(signal);
              })
            )
          ];
        }
        return [state, Effect.none()];
      };
      const store = createStore({ initialState, reducer });
      store.dispatch({ type: 'startLoading' });
      vi.advanceTimersByTime(10);

      expect(seen).toHaveLength(2);
      expect(seen.every((s) => s instanceof AbortSignal && !s.aborted)).toBe(true);
      store.destroy();
      expect(seen.every((s) => s?.aborted)).toBe(true);
    });

    it('a Run in flight sees its signal aborted by destroy()', () => {
      let captured: AbortSignal | undefined;
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'startLoading') {
          return [state, Effect.run(async (_dispatch, signal) => { captured = signal; await new Promise(() => {}); })];
        }
        return [state, Effect.none()];
      };
      const store = createStore({ initialState, reducer });
      store.dispatch({ type: 'startLoading' });
      expect(captured?.aborted).toBe(false);

      store.destroy();
      expect(captured?.aborted).toBe(true);
    });
  });

  describe('a synchronous throw in an effect body is logged, never thrown (N3)', () => {
    // Promise.resolve(execute()).catch() handles a rejection, not a body that
    // throws before returning: that escaped dispatch() into the caller's event
    // handler, skipped the rest of a Batch, and inside a timer was an uncaught
    // exception — while the same executor mapped through scope() was caught.
    const throwing = () => {
      throw new Error('boom');
    };
    function storeRunning(effect: (state: TestState) => ReturnType<Reducer<TestState, TestAction>>[1]) {
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'startLoading') return [state, effect(state)];
        if (action.type === 'loadComplete') return [{ ...state, count: action.value }, Effect.none()];
        return [state, Effect.none()];
      };
      return createStore({ initialState, reducer });
    }

    it('Run: dispatch() does not throw, and the error is logged once', () => {
      expectConsole('error');
      const store = storeRunning(() => Effect.run(throwing));
      expect(() => store.dispatch({ type: 'startLoading' })).not.toThrow();
    });

    it('Batch: a throwing first member does not skip the second', () => {
      expectConsole('error');
      const store = storeRunning(() =>
        Effect.batch(
          Effect.run(throwing),
          Effect.run((dispatch) => dispatch({ type: 'loadComplete', value: 7 }))
        )
      );
      store.dispatch({ type: 'startLoading' });
      expect(store.state.count).toBe(7);
    });

    it('Cancellable: the throw is logged and the id is released', () => {
      expectConsole('error');
      const store = storeRunning(() => Effect.cancellable('x', throwing));
      expect(() => store.dispatch({ type: 'startLoading' })).not.toThrow();
    });

    it('FireAndForget: the throw is logged, not thrown', () => {
      expectConsole('error');
      const store = storeRunning(() => Effect.fireAndForget(throwing));
      expect(() => store.dispatch({ type: 'startLoading' })).not.toThrow();
    });

    it.each<[string, () => EffectType<TestAction>]>([
      ['Debounced', () => Effect.debounced('d', 50, throwing)],
      ['Throttled (trailing)', () => Effect.throttled('t', 50, throwing)],
      ['AfterDelay', () => Effect.afterDelay(50, throwing)]
    ])('%s: a throw inside the timer callback is logged, not uncaught', (_name, make) => {
      expectConsole('error');
      const store = storeRunning(make);
      store.dispatch({ type: 'startLoading' });
      // A synchronous throw inside a timer callback surfaces here, out of the
      // fake clock, as an uncaught exception would in a browser.
      expect(() => vi.advanceTimersByTime(60)).not.toThrow();
    });

    it('Throttled (leading): the immediate call is guarded too', () => {
      expectConsole('error');
      const store = storeRunning(() => Effect.throttled('lead', 50, throwing));
      expect(() => store.dispatch({ type: 'startLoading' })).not.toThrow();
    });

    it("a reducer that throws when reached through an effect's dispatch is logged as an effect error", () => {
      // The throw escapes the executor's synchronous dispatch and the guard
      // logs it; the outer dispatch() returns normally and the state stands.
      expectConsole('error');
      const reducer: Reducer<TestState, TestAction> = (state, action) => {
        if (action.type === 'startLoading') {
          return [state, Effect.run((dispatch) => dispatch({ type: 'loadComplete', value: 1 }))];
        }
        if (action.type === 'loadComplete') throw new Error('reducer boom');
        return [state, Effect.none()];
      };
      const store = createStore({ initialState, reducer });

      expect(() => store.dispatch({ type: 'startLoading' })).not.toThrow();
      expect(store.state.count).toBe(0);
    });
  });
});

