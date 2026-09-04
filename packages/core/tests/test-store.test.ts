import { describe, it, expect, vi } from 'vitest';
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

describe('receive() and send() keep the transcript complete (N9, T1)', () => {
	// findIndex let receive() match an action anywhere in the queue, so a test
	// skipped past actions it never expected, and send() ran on top of
	// unasserted ones; both hid effects the test author did not know about.
	type State = { log: string[] };
	type Action = { type: 'go' } | { type: 'first' } | { type: 'second' } | { type: 'done' };
	const reducer: Reducer<State, Action> = (state, action) => {
		if (action.type === 'go') {
			return [
				state,
				Effect.run(async (dispatch) => {
					dispatch({ type: 'first' });
					dispatch({ type: 'second' });
				})
			];
		}
		return [{ log: [...state.log, action.type] }, Effect.none()];
	};

	it('receive() fails at once, naming both, when the match is not the next action', async () => {
		const store = new TestStore({ initialState: { log: [] }, reducer });
		await store.send({ type: 'go' });
		await store.advanceTime(0);

		await expect(store.receive({ type: 'second' })).rejects.toThrow(
			/Expected to receive \{"type":"second"\} next, but the next received action was \{"type":"first"\}/
		);
		// Nothing was consumed by the failed receive.
		await store.receive({ type: 'first' });
		await store.receive({ type: 'second' });
		await store.finish();
	});

	it('send() refuses to run over unasserted received actions', async () => {
		const store = new TestStore({ initialState: { log: [] }, reducer });
		await store.send({ type: 'go' });
		await store.advanceTime(0);

		await expect(store.send({ type: 'done' })).rejects.toThrow(
			/send\("done"\) called with 2 unasserted received action\(s\)/
		);
		await store.receive({ type: 'first' });
		await store.receive({ type: 'second' });
		await store.send({ type: 'done' }, (state) => expect(state.log).toEqual(['first', 'second', 'done']));
	});

	it("exhaustivity = 'off' keeps the old behaviour: match anywhere, send over leftovers", async () => {
		const store = new TestStore({ initialState: { log: [] }, reducer });
		store.exhaustivity = 'off';
		await store.send({ type: 'go' });
		await store.advanceTime(0);

		await store.receive({ type: 'second' });
		await store.send({ type: 'done' });
		expect(store.state.log).toEqual(['first', 'second', 'done']);
	});

	it('matches nested values structurally, whatever the key order', async () => {
		type NestedAction = { type: 'go' } | { type: 'event'; payload: { a: number; b: number } };
		const nested: Reducer<State, NestedAction> = (state, action) =>
			action.type === 'go'
				? [state, Effect.run(async (dispatch) => dispatch({ type: 'event', payload: { a: 1, b: 2 } }))]
				: [state, Effect.none()];
		const store = new TestStore({ initialState: { log: [] }, reducer: nested });
		await store.send({ type: 'go' });
		await store.receive({ type: 'event', payload: { b: 2, a: 1 } });
		await store.finish();
	});
});

describe("send()'s assertion sees the reducer's state, not the effect's (N9)", () => {
	it('an effect that dispatches synchronously cannot change what the assertion sees', async () => {
		type State = { phase: string };
		type Action = { type: 'start' } | { type: 'finished' };
		const reducer: Reducer<State, Action> = (state, action) => {
			if (action.type === 'start') {
				return [{ phase: 'started' }, Effect.run((dispatch) => { dispatch({ type: 'finished' }); })];
			}
			return [{ phase: 'finished' }, Effect.none()];
		};
		const store = new TestStore({ initialState: { phase: 'idle' }, reducer });

		await store.send({ type: 'start' }, (state) => {
			expect(state.phase).toBe('started');
		});
		await store.receive({ type: 'finished' }, (state) => {
			expect(state.phase).toBe('finished');
		});
		await store.finish();
	});
});

describe('Debounced and Throttled run on the test clock (N9, T6)', () => {
	// Both executed at once, every time, so Effect.cancel(debounceId) was
	// untestable and three rapid calls looked like three debounces.
	type State = { fired: string[] };
	type Action = { type: 'type'; value: string } | { type: 'cancel' } | { type: 'fired'; value: string };
	const reducer: Reducer<State, Action> = (state, action) => {
		switch (action.type) {
			case 'type':
				return [state, Effect.debounced('search', 300, (dispatch) => dispatch({ type: 'fired', value: action.value }))];
			case 'cancel':
				return [state, Effect.cancel('search')];
			case 'fired':
				return [{ fired: [...state.fired, action.value] }, Effect.none()];
		}
	};

	it('a debounce fires once, after its delay', async () => {
		vi.useFakeTimers();
		try {
			const store = new TestStore({ initialState: { fired: [] }, reducer });
			await store.send({ type: 'type', value: 'a' });
			await store.advanceTime(299);
			store.assertNoPendingActions();
			await store.advanceTime(1);
			await store.receive({ type: 'fired', value: 'a' });
			await store.finish();
		} finally {
			vi.useRealTimers();
		}
	});

	it('a second call inside the window supersedes the first', async () => {
		vi.useFakeTimers();
		try {
			const store = new TestStore({ initialState: { fired: [] }, reducer });
			await store.send({ type: 'type', value: 'a' });
			await store.advanceTime(100);
			await store.send({ type: 'type', value: 'ab' });
			await store.advanceTime(300);
			await store.receive({ type: 'fired', value: 'ab' }, (state) => expect(state.fired).toEqual(['ab']));
			await store.finish();
		} finally {
			vi.useRealTimers();
		}
	});

	it('Effect.cancel(id) prevents a pending debounce', async () => {
		vi.useFakeTimers();
		try {
			const store = new TestStore({ initialState: { fired: [] }, reducer });
			await store.send({ type: 'type', value: 'a' });
			await store.send({ type: 'cancel' });
			await store.advanceTime(1000);
			await store.finish();
			expect(store.state.fired).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('a throttle runs on the leading edge, and the first call inside the window runs when it closes', async () => {
		vi.useFakeTimers();
		try {
			type TAction = { type: 'move'; x: number } | { type: 'moved'; x: number };
			const throttled: Reducer<{ moved: number[] }, TAction> = (state, action) =>
				action.type === 'move'
					? [state, Effect.throttled('move', 100, (dispatch) => dispatch({ type: 'moved', x: action.x }))]
					: [{ moved: [...state.moved, action.x] }, Effect.none()];
			const store = new TestStore({ initialState: { moved: [] }, reducer: throttled });
			await store.send({ type: 'move', x: 1 });
			await store.receive({ type: 'moved', x: 1 });
			await store.send({ type: 'move', x: 2 });
			await store.send({ type: 'move', x: 3 });
			// As the store does it: the first call inside the window is the one
			// scheduled for the trailing edge; later calls in the window are dropped.
			await store.advanceTime(100);
			await store.receive({ type: 'moved', x: 2 }, (state) => expect(state.moved).toEqual([1, 2]));
			await store.finish();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('finish() waits for what is still running (N9, T6)', () => {
	type State = { n: number };
	type Action = { type: 'go' } | { type: 'late' };

	it('a Run that dispatches late is waited for, and its action then fails finish() by name', async () => {
		const reducer: Reducer<State, Action> = (state, action) =>
			action.type === 'go'
				? [state, Effect.run(async (dispatch) => { await new Promise((r) => setTimeout(r, 30)); dispatch({ type: 'late' }); })]
				: [{ n: state.n + 1 }, Effect.none()];
		const store = new TestStore({ initialState: { n: 0 }, reducer });
		await store.send({ type: 'go' });
		// advanceTime(0) alone saw nothing and the first form passed here.
		await expect(store.finish()).rejects.toThrow(/Expected no pending actions, but found 1 unasserted action\(s\):\nTypes: \["late"\]/);
	});

	it('a Run that never settles fails finish() with a message, not a test timeout', async () => {
		const reducer: Reducer<State, Action> = (state, action) =>
			action.type === 'go' ? [state, Effect.run(() => new Promise<void>(() => {}))] : [state, Effect.none()];
		const store = new TestStore({ initialState: { n: 0 }, reducer });
		await store.send({ type: 'go' });
		await expect(store.finish(100)).rejects.toThrow(/finish\(\): 1 effect\(s\) still running after 100ms/);
	});

	it('an AfterDelay still pending under fake timers fails finish() until the clock is advanced', async () => {
		vi.useFakeTimers();
		try {
			const reducer: Reducer<State, Action> = (state, action) =>
				action.type === 'go' ? [state, Effect.afterDelay(200, (dispatch) => dispatch({ type: 'late' }))] : [{ n: state.n + 1 }, Effect.none()];
			const store = new TestStore({ initialState: { n: 0 }, reducer });
			await store.send({ type: 'go' });
			await expect(store.finish()).rejects.toThrow(/1 AfterDelay effect\(s\) still pending under fake timers/);
			await store.advanceTime(200);
			await store.receive({ type: 'late' });
			await store.finish();
		} finally {
			vi.useRealTimers();
		}
	});

	it('an AfterDelay under real timers is waited for', async () => {
		const reducer: Reducer<State, Action> = (state, action) =>
			action.type === 'go' ? [state, Effect.afterDelay(30, (dispatch) => dispatch({ type: 'late' }))] : [{ n: state.n + 1 }, Effect.none()];
		const store = new TestStore({ initialState: { n: 0 }, reducer });
		await store.send({ type: 'go' });
		await expect(store.finish()).rejects.toThrow(/Types: \["late"\]/);
	});
});

describe('a rejecting executor fails the test, not the process (N9)', () => {
	type State = { n: number };
	type Action = { type: 'go' };

	it('finish() throws with the error\'s message', async () => {
		const reducer: Reducer<State, Action> = (state) => [state, Effect.run(async () => { throw new Error('backend down'); })];
		const store = new TestStore({ initialState: { n: 0 }, reducer });
		await store.send({ type: 'go' });
		await expect(store.finish()).rejects.toThrow(/\[TestStore\] effect rejected: backend down/);
	});

	it('receive() and send() report it too', async () => {
		const reducer: Reducer<State, Action> = (state) => [state, Effect.run(async () => { throw new Error('backend down'); })];
		const store = new TestStore({ initialState: { n: 0 }, reducer });
		await store.send({ type: 'go' });
		await store.advanceTime(0);
		await expect(store.send({ type: 'go' })).rejects.toThrow(/effect rejected: backend down/);
	});
});

