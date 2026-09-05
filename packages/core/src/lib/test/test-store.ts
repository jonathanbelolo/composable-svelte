/**
 * TestStore for testing reducers and effects.
 *
 * Provides a specialized store for testing that enables:
 * - send/receive pattern for asserting on effect-dispatched actions
 * - Exhaustiveness checking (ensures all actions are asserted)
 * - Synchronous and async action handling
 * - Fake timer support for testing time-based effects
 * - Clear, helpful error messages
 *
 * ## Basic Usage
 *
 * ```typescript
 * const store = createTestStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer
 * });
 *
 * // Send user action
 * await store.send({ type: 'incrementTapped' }, (state) => {
 *   expect(state.count).toBe(1);
 * });
 *
 * // Receive effect-dispatched action
 * await store.receive({ type: 'animationCompleted' }, (state) => {
 *   expect(state.isAnimating).toBe(false);
 * });
 *
 * // Assert all actions handled
 * store.assertNoPendingActions();
 * ```
 *
 * ## Testing Time-Based Effects (Fake Timers)
 *
 * TestStore integrates with Vitest's fake timers to test delays, debounces, and timeouts
 * without waiting for real time to pass.
 *
 * ### Setup Requirements
 *
 * 1. **Enable fake timers in a hook** (not at the top level of a setup file —
 *    the test module binds the real clock when it loads, and refuses to load
 *    while the clock is faked):
 * ```typescript
 * beforeEach(() => {
 *   vi.useFakeTimers();
 * });
 *
 * afterEach(() => {
 *   vi.useRealTimers(); // restoreAllMocks() does not undo useFakeTimers()
 * });
 * ```
 *
 * 2. **Use `advanceTime()` to progress virtual time:**
 * ```typescript
 * await store.send({ type: 'hoverStarted' });
 *
 * // Advance 300ms to trigger afterDelay effect
 * await store.advanceTime(300);
 *
 * await store.receive({ type: 'delayCompleted' });
 * ```
 *
 * ### How Fake Timers Work
 *
 * - `advanceTime(ms)` calls `vi.advanceTimersByTime(ms)` to fire setTimeout/setInterval
 * - After advancing timers, flushes microtask queue for async effects
 * - `receive()` and `finish()` wait on the *real* clock, notified as actions
 *   arrive and effects settle; they never advance the fake one. A test that
 *   needs a timer to fire advances it with `advanceTime(ms)` — exactly; a
 *   `receive()` that waits for an action a timer would have delivered times
 *   out, naming the timer and its due time.
 *
 * ### Complete Example: Testing Tooltip with Hover Delay
 *
 * ```typescript
 * describe('Tooltip with hover delay', () => {
 *   beforeEach(() => {
 *     vi.useFakeTimers();
 *   });
 *
 *   afterEach(() => {
 *     vi.useRealTimers();
 *   });
 *
 *   it('shows tooltip after delay', async () => {
 *     const store = createTestStore({
 *       initialState: initialTooltipState,
 *       reducer: tooltipReducer,
 *       dependencies: { hoverDelay: 300 }
 *     });
 *
 *     // User hovers
 *     await store.send({ type: 'hoverStarted', content: 'Save' }, (state) => {
 *       expect(state.isWaitingToShow).toBe(true);
 *     });
 *
 *     // Advance time to trigger delay effect
 *     await store.advanceTime(300);
 *
 *     // Delay effect fires delayCompleted action
 *     await store.receive({ type: 'delayCompleted' }, (state) => {
 *       expect(state.isWaitingToShow).toBe(false);
 *       expect(state.presentation.status).toBe('presenting');
 *     });
 *
 *     // Advance time for animation duration
 *     await store.advanceTime(150);
 *
 *     await store.receive({
 *       type: 'presentation',
 *       event: { type: 'presentationCompleted' }
 *     }, (state) => {
 *       expect(state.presentation.status).toBe('presented');
 *     });
 *
 *     await store.finish(); // Verify no pending actions
 *   });
 * });
 * ```
 *
 * ### Important Notes on Fake Timers
 *
 * 1. **Effects still execute asynchronously**: Even with fake timers, effect callbacks
 *    (e.g., `Effect.cancellable()`) execute asynchronously. `receive()` waits for the
 *    action on the real clock, notified as it arrives.
 *
 * 2. **Guard patterns for cancelled effects**: If your reducer has guards (e.g., checking
 *    `isWaitingToShow` before processing `delayCompleted`), the action will still be
 *    dispatched but the reducer will return the same state unchanged. Your test should
 *    receive it and verify state didn't change from what it was before:
 *
 *    ```typescript
 *    // User hovers, then cancels before delay completes
 *    await store.send({ type: 'hoverStarted', content: 'Save' });
 *    await store.send({ type: 'hoverEnded' }, (state) => {
 *      expect(state.isWaitingToShow).toBe(false);
 *      expect(state.content).toBe(null);
 *    });
 *
 *    // Advance past the original delay time
 *    await store.advanceTime(300); // Timer still fires!
 *
 *    // Action is dispatched but reducer guard returns unchanged state
 *    await store.receive({ type: 'delayCompleted' }, (state) => {
 *      // State remains unchanged - still cancelled
 *      expect(state.isWaitingToShow).toBe(false);
 *      expect(state.content).toBe(null);
 *    });
 *    ```
 *
 * 3. **`finish()`**: waits for every effect to settle (a hung one fails by kind
 *    and id), fails on a timer still armed under fake timers (advance the clock
 *    or cancel the effect), reports a rejected executor, and asserts no
 *    received action is unasserted. A test with a deliberately long-lived
 *    effect ends with the `send()` that cancels it, or with `destroy()`.
 *
 * ## Partial Action Matching
 *
 * `receive()` supports partial matching with nested objects:
 *
 * ```typescript
 * // Matches actions with matching type and nested event
 * await store.receive({
 *   type: 'presentation',
 *   event: { type: 'presentationCompleted' }
 * });
 * ```
 *
 * Top-level keys are partial; a nested value is compared structurally, as a
 * whole, with JSON semantics — key order ignored, a `Date` by its instant,
 * `undefined` properties omitted.
 *
 * ## Exhaustiveness Checking
 *
 * By default (`exhaustivity: 'on'`), TestStore ensures all received actions are
 * asserted, in the order the effects delivered them: `receive()` must name the
 * next action in the queue, and `send()` refuses to run while an earlier one is
 * still unasserted. When the order between concurrent effects is not the
 * point, `receive([a, b])` accepts the next two in either order:
 *
 * ```typescript
 * await store.send({ type: 'loadData' });
 * await store.receive({ type: 'dataLoaded' });
 *
 * // If another action was received but not asserted:
 * store.assertNoPendingActions(); // ❌ Throws error
 *
 * // Disable exhaustiveness for specific tests:
 * store.exhaustivity = 'off';
 * store.assertNoPendingActions(); // ✅ Passes even with unasserted actions
 * ```
 *
 * ## Rejections and the test hook
 *
 * An executor that rejects fails the next `receive()`, `send()` or
 * `finish()`. A rejection nothing asks about fails the test that owns the
 * store from its own finish hook, which the first `send()`, `receive()` or
 * `finish()` registers while that test is current — so a store used only by
 * `dispatch()` from a dependency has no hook, and neither does one used
 * outside a test, where the rejection is rethrown as an unhandled rejection.
 * `it.concurrent` is not supported: the hook binds to the current test.
 */

import type { Reducer, Effect, Dispatch } from '../types.js';
import { stableStringify } from '../utils/stable-stringify.js';
import { realClearTimeout, realSetTimeout, sleep, timersAreFaked } from './real-timers.js';

/**
 * Configuration for TestStore.
 */
export interface TestStoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
}

/**
 * Assertion function for state.
 */
export type StateAssertion<State> = (state: State) => void | Promise<void>;

/**
 * Partial action matcher for receive assertions.
 */
export type PartialAction<Action> = Partial<Action> & { type: string };

/** A timer the test clock holds for this store, so `finish()` can name it. */
interface PendingTimer {
  readonly kind: 'AfterDelay' | 'Debounced' | 'Throttled';
  readonly id: string | undefined;
  readonly due: number;
  readonly handle: ReturnType<typeof setTimeout>;
}

/** The real-clock poll between notifications, in milliseconds. */
const SAFETY_TICK_MS = 10;

const json = (value: unknown): string => JSON.stringify(value);

/**
 * TestStore for testing reducers and effects.
 *
 * @example
 * ```typescript
 * const store = new TestStore({ initialState, reducer });
 *
 * await store.send({ type: 'incrementTapped' }, (state) => {
 *   expect(state.count).toBe(1);
 * });
 *
 * await store.receive({ type: 'animationCompleted' }, (state) => {
 *   expect(state.isAnimating).toBe(false);
 * });
 *
 * store.assertNoPendingActions();
 * ```
 */
export class TestStore<State, Action, Dependencies = any> {
  private _state: State;

  /**
   * Current state (read-only).
   *
   * Readable because every documented testing example reads it — asserting on
   * state is what `TestStore` is for. It was `private`, which TypeScript erases,
   * so tests ran fine and only consumers who typecheck their own tests ever saw
   * it; that accounted for 74 of the errors hidden behind core's untypechecked
   * test suite.
   *
   * A getter rather than a field, mirroring `store.svelte.ts`: making it a
   * mutable public field would have let `store.state = x` bypass the reducer
   * silently, which is the one invariant a test store exists to hold.
   */
  get state(): State {
    return this._state;
  }
  private reducer: Reducer<State, Action, Dependencies>;
  private dependencies: Dependencies;
  private actionHistory: Action[] = [];
  private receivedActions: Action[] = [];
  /** Effects whose promise has not settled — what `finish()` waits for. */
  private _inFlight = 0;
  /** What is running, by kind and id, for `finish()`'s message. */
  private _running = new Map<symbol, string>();
  /** Executors that rejected and have not yet failed a `receive()`, `send()` or `finish()`. */
  private _failures: unknown[] = [];
  /**
   * Every timer this store holds on the test clock — AfterDelay, Debounced,
   * Throttled — so `finish()` knows what is pending and `destroy()` disarms
   * all of it. The first form tracked AfterDelay only: an armed debounce
   * passed `finish()` and then fired into the next test (R1-REVIEW 1.6).
   */
  private _timers = new Set<PendingTimer>();
  private _debounceTimers = new Map<string, PendingTimer>();
  private _throttleState = new Map<string, { lastRun: number; timer?: PendingTimer }>();
  private _subscriptionCleanups = new Map<string, () => void | Promise<void>>();
  /** In-flight cancellables by id, so re-registering one aborts its predecessor. */
  private _inFlightEffects = new Map<string, AbortController>();
  /**
   * The store's lifetime, as `store.svelte.ts` has one: `Run`, `AfterDelay`,
   * `Debounced` and `Throttled` executors receive its signal, and `destroy()`
   * aborts it. The first form handed those executors no signal at all while
   * the documentation said it did (R1-REVIEW 1.5).
   */
  private _lifetime = new AbortController();
  private _destroyed = false;
  /** Waiters notified whenever something they might be waiting for happened. */
  private _waiters = new Set<() => void>();
  /** The test finish hook: unregistered, being registered, armed, or unavailable (no test context). */
  private _hook: 'none' | 'pending' | 'armed' | 'unavailable' = 'none';
  private _hookReady: Promise<void> | null = null;

  /**
   * Control exhaustiveness checking for received actions.
   * Default is 'on' to catch unhandled actions in tests.
   */
  public exhaustivity: 'on' | 'off' = 'on';

  constructor(config: TestStoreConfig<State, Action, Dependencies>) {
    this._state = config.initialState;
    this.reducer = config.reducer;
    this.dependencies = config.dependencies ?? ({} as Dependencies);
  }

  /**
   * Send an action and optionally assert state changes.
   *
   * With exhaustivity on, every action an effect has delivered must have been
   * asserted with `receive()` before the next `send()` — TCA's rule, and the
   * one that makes a test's transcript complete. The assertion runs on the
   * state the reducer returned, before the effect executes, so an effect that
   * dispatches synchronously cannot make it see a later state
   * (AUDIT-2026-09-03-FINDINGS N9).
   *
   * @param action - The action to dispatch
   * @param assert - Optional state assertion
   */
  async send(
    action: Action,
    assert?: StateAssertion<State>
  ): Promise<void> {
    this._assertAlive('send');
    await this._ensureHooked();
    this._throwFailures();
    // Operands ordered unlike assertNoPendingActions()'s, which the mutation
    // baseline (M1) anchors on by exact text.
    if (this.receivedActions.length > 0 && this.exhaustivity === 'on') {
      throw new Error(
        `send(${JSON.stringify((action as { type?: unknown }).type)}) called with ` +
        `${this.receivedActions.length} unasserted received action(s):\n` +
        `${this._describeQueue()}\n` +
        `Assert them with receive() first, or set store.exhaustivity = 'off'.`
      );
    }

    this.actionHistory.push(action);

    const [newState, effect] = this.reducer(this._state, action, this.dependencies);
    this._state = newState;

    if (assert) {
      await assert(this._state);
    }

    if (effect._tag !== 'None') {
      this._executeEffect(effect);
    }
  }

  /**
   * Wait for and assert an action was received from effects.
   *
   * With exhaustivity on, the matched action must be the *next* one the
   * effects delivered: if the next action does not match, `receive()` fails at
   * once, naming both — whether or not a later action matches — so a test
   * cannot skip past an action it did not expect. With an array, the next N
   * actions must be the N partials in any order; an action that matches none
   * of them fails at once. Set `exhaustivity = 'off'` to match anywhere in the
   * queue.
   *
   * Waiting never moves the fake clock: an action a timer would deliver is
   * received after `advanceTime(ms)`, and the timeout message names the timer.
   *
   * Top-level keys are partial; a nested value is compared structurally, as a
   * whole, with JSON semantics.
   *
   * @param partialAction - Partial action to match (must have type field), or several
   * @param assert - Optional state assertion, run once after every action is consumed
   * @param timeout - Timeout in milliseconds of real time (default: 1000)
   * @throws {Error} If the action is not received within the timeout, or received out of order
   */
  async receive(partialAction: PartialAction<Action>, assert?: StateAssertion<State>, timeout?: number): Promise<void>;
  async receive(partialActions: PartialAction<Action>[], assert?: StateAssertion<State>, timeout?: number): Promise<void>;
  async receive(
    partialAction: PartialAction<Action> | PartialAction<Action>[],
    assert?: StateAssertion<State>,
    timeout: number = 1000
  ): Promise<void> {
    this._assertAlive('receive');
    await this._ensureHooked();
    this._throwFailures();

    if (Array.isArray(partialAction)) {
      if (partialAction.length === 0) {
        throw new TypeError('[TestStore] receive([]) names no action; pass at least one partial.');
      }
      await this._until(
        () => this._claimMany(partialAction),
        timeout,
        () => this._timeoutMessage(`Expected to receive actions matching ${json(partialAction)}`, timeout)
      );
    } else {
      await this._until(
        () => this._claimOne(partialAction),
        timeout,
        () => this._timeoutMessage(`Expected to receive action matching ${json(partialAction)}`, timeout)
      );
    }

    if (assert) {
      await assert(this._state);
    }
  }

  /** The single-partial step: consumed, waiting, or a failure. */
  private _claimOne(partial: PartialAction<Action>): true | undefined {
    this._throwFailures();
    if (this.receivedActions.length === 0) return undefined;

    if (this.exhaustivity === 'on') {
      const head = this.receivedActions[0]!;
      if (this._matchesPartialAction(head, partial)) {
        this.receivedActions.shift();
        return true;
      }
      // The queue already holds the answer: not a reason to keep waiting.
      const later = this.receivedActions.findIndex((action) => this._matchesPartialAction(action, partial));
      throw new Error(
        `Expected to receive ${json(partial)} next, but the next received action was ${json(head)} ` +
          (later === -1 ? '(no later action matches either).\n' : `(the match was at position ${later}).\n`) +
          `Received actions, in order:\n${this._describeQueue()}\n` +
          `Assert them in order, or set store.exhaustivity = 'off'.`
      );
    }

    const index = this.receivedActions.findIndex((action) => this._matchesPartialAction(action, partial));
    if (index === -1) return undefined;
    this.receivedActions.splice(index, 1);
    return true;
  }

  /** The array step: the next N are a permutation of the partials, or a failure, or waiting. */
  private _claimMany(partials: PartialAction<Action>[]): true | undefined {
    this._throwFailures();

    if (this.exhaustivity === 'on') {
      const remaining = [...partials];
      let consumed = 0;
      for (const action of this.receivedActions) {
        if (remaining.length === 0) break;
        const k = remaining.findIndex((partial) => this._matchesPartialAction(action, partial));
        if (k === -1) {
          throw new Error(
            `Expected to receive one of ${json(remaining)} next, but the received action at position ${consumed} ` +
              `was ${json(action)}.\nReceived actions, in order:\n${this._describeQueue()}\n` +
              `Assert it, or set store.exhaustivity = 'off'.`
          );
        }
        remaining.splice(k, 1);
        consumed++;
      }
      if (remaining.length > 0) return undefined;
      this.receivedActions.splice(0, consumed);
      return true;
    }

    const taken = new Set<number>();
    for (const partial of partials) {
      const index = this.receivedActions.findIndex(
        (action, i) => !taken.has(i) && this._matchesPartialAction(action, partial)
      );
      if (index === -1) return undefined;
      taken.add(index);
    }
    this.receivedActions = this.receivedActions.filter((_, i) => !taken.has(i));
    return true;
  }

  /**
   * Wait on the real clock until `check` returns a value: it runs at once,
   * again whenever the store notifies (an action arrived, an effect settled, a
   * timer fired or was disarmed), and on a real safety tick; `undefined` keeps
   * waiting, a throw propagates at once, and the deadline is real time. The
   * first form used `vi.waitFor`, which under fake timers advances the fake
   * clock by its interval on every check — so `receive()` fired timers the
   * test never advanced, and a test that omitted `advanceTime()` passed
   * (R1-REVIEW 1.6).
   */
  private _until<T>(check: () => T | undefined, timeout: number, describeTimeout: () => string): Promise<T> {
    const first = check();
    if (first !== undefined) return Promise.resolve(first);

    return new Promise<T>((resolve, reject) => {
      let done = false;
      let tick: ReturnType<typeof setTimeout> | undefined;
      const stop = (): void => {
        done = true;
        this._waiters.delete(attempt);
        realClearTimeout(deadline);
        if (tick !== undefined) realClearTimeout(tick);
      };
      const attempt = (): void => {
        if (done) return;
        let result: T | undefined;
        try {
          result = check();
        } catch (error) {
          stop();
          reject(error);
          return;
        }
        if (result !== undefined) {
          stop();
          resolve(result);
        }
      };
      const deadline = realSetTimeout(() => {
        if (done) return;
        stop();
        reject(new Error(describeTimeout()));
      }, timeout);
      const scheduleTick = (): void => {
        tick = realSetTimeout(() => {
          attempt();
          if (!done) scheduleTick();
        }, SAFETY_TICK_MS);
      };
      this._waiters.add(attempt);
      scheduleTick();
    });
  }

  /** Wake every waiter; each re-runs its check. */
  private _notify(): void {
    for (const waiter of [...this._waiters]) waiter();
  }

  /** What a wait was waiting on, for its timeout message. */
  private _timeoutMessage(expectation: string, timeout: number): string {
    const timers = [...this._timers]
      .map((timer) => `  ${timer.kind}${timer.id !== undefined ? ` '${timer.id}'` : ''} due in ${timer.due - Date.now()} ms`)
      .join('\n');
    return (
      `${expectation} within ${timeout}ms.\n` +
      `Received actions, unasserted:\n${this.receivedActions.length > 0 ? this._describeQueue() : '  (none)'}\n` +
      `Effects in flight: ${this._inFlight > 0 ? [...this._running.values()].join(', ') : '(none)'}\n` +
      (this._timers.size > 0
        ? `Timers pending on the test clock — advance it with advanceTime(ms):\n${timers}\n`
        : 'Timers pending: (none)\n')
    );
  }

  /**
   * An executor that rejected fails the next `receive()`, `send()` or
   * `finish()`, with its message. The first form let the rejection escape the
   * process as an unhandled rejection while `finish()` passed
   * (AUDIT-2026-09-03-FINDINGS N9).
   */
  private _throwFailures(): void {
    if (this._failures.length === 0) return;
    const [first, ...rest] = this._failures.splice(0);
    const message = first instanceof Error ? first.message : String(first);
    throw new Error(
      `[TestStore] effect rejected: ${message}` +
        (rest.length > 0 ? ` (and ${rest.length} more)` : ''),
      { cause: first }
    );
  }

  /**
   * Register the owning test's finish hook once, while that test is current:
   * it destroys the store and throws any rejection nothing asked about. The
   * first form registered a hook at *rejection* time, which bound it to
   * whichever test happened to be current then — a late rejection failed the
   * wrong test, or none (R1-REVIEW 1.6).
   */
  private _ensureHooked(): Promise<void> {
    if (this._hook !== 'none') return this._hookReady ?? Promise.resolve();
    this._hook = 'pending';
    this._hookReady = import('vitest')
      .then(({ onTestFinished }) => {
        onTestFinished(() => {
          this.destroy();
          this._throwUnconsumed();
        });
        this._hook = 'armed';
      })
      .catch(() => {
        // No vitest, or no current test: rejections are rethrown instead.
        this._hook = 'unavailable';
      });
    return this._hookReady;
  }

  /** Thrown from the test's finish hook: a rejection nothing asked about. */
  private _throwUnconsumed(): void {
    if (this._failures.length === 0) return;
    const [first] = this._failures.splice(0);
    const message = first instanceof Error ? first.message : String(first);
    throw new Error(`[TestStore] effect rejected, and nothing asked: ${message}`, { cause: first });
  }

  /**
   * Register an effect promise: counted while running, named for `finish()`,
   * its rejection kept for the next call. Waiters are notified first, so a
   * `receive()` or `finish()` already waiting consumes the rejection; with no
   * test hook to report it otherwise, an unconsumed rejection is rethrown on
   * a microtask, as an unhandled rejection.
   */
  private _track(label: string, promise: Promise<void>): void {
    const key = Symbol(label);
    this._inFlight++;
    this._running.set(key, label);
    const settle = (): void => {
      this._inFlight--;
      this._running.delete(key);
    };
    promise.then(
      () => {
        settle();
        this._notify();
      },
      (error: unknown) => {
        settle();
        this._failures.push(error);
        this._notify();
        if (this._hook === 'armed' || this._hook === 'pending') return;
        queueMicrotask(() => {
          const index = this._failures.indexOf(error);
          if (index === -1) return;
          this._failures.splice(index, 1);
          throw error;
        });
      }
    );
  }

  /** Run an effect body now — its synchronous part included — and track what it returns. */
  private _run(label: string, body: () => void | Promise<void>): void {
    let result: Promise<void>;
    try {
      result = Promise.resolve(body());
    } catch (error) {
      result = Promise.reject(error);
    }
    this._track(label, result);
  }

  /** The unasserted received actions, one per line, for a message. */
  private _describeQueue(): string {
    return this.receivedActions.map((a, i) => `  ${i}: ${JSON.stringify(a)}`).join('\n');
  }

  /** Every timer on the test clock, one per line. */
  private _describeTimers(): string {
    return [...this._timers]
      .map((timer) => `  ${timer.kind}${timer.id !== undefined ? ` '${timer.id}'` : ''} due in ${timer.due - Date.now()} ms`)
      .join('\n');
  }

  /**
   * Assert no actions are pending.
   * Only fails when exhaustivity is 'on'.
   */
  assertNoPendingActions(): void {
    if (this.exhaustivity === 'on' && this.receivedActions.length > 0) {
      const types = this.receivedActions.map((a: any) => a.type);
      throw new Error(
        `Expected no pending actions, but found ${this.receivedActions.length} unasserted action(s):\n` +
        `Types: ${JSON.stringify(types)}\n` +
        `Full actions: ${JSON.stringify(this.receivedActions, null, 2)}`
      );
    }
  }

  /**
   * Complete the test: every effect has settled, no timer is pending, no
   * received action is unasserted, and no executor rejected.
   *
   * Effects still running are waited for, up to `timeout` of real time; a hung
   * one fails with a message naming it by kind and id — cancel it, or call
   * `destroy()` instead. A cancellable that was aborted (superseded, or
   * `Effect.cancel(id)`) is not waited for: its dispatches are gated off, and
   * a rejection after the abort is nobody's. A timer still armed on the test
   * clock — AfterDelay, Debounced or Throttled — fails under fake timers,
   * naming it and its due time (advance the clock with `advanceTime(ms)`
   * first), and is waited for under real timers. The first form did
   * `advanceTime(0)` and looked at the queue, so it passed with a `Run` still
   * in flight and a delay still armed (AUDIT-2026-09-03-FINDINGS N9, T6).
   *
   * @example
   * ```typescript
   * await store.send({ type: 'loadData' });
   * await store.receive({ type: 'dataLoaded' });
   * await store.finish(); // Verify test is complete
   * ```
   */
  async finish(timeout: number = 1000): Promise<void> {
    this._assertAlive('finish');
    await this._ensureHooked();
    this._throwFailures();
    await this.advanceTime(0);

    if (this._timers.size > 0) {
      if (timersAreFaked()) {
        throw new Error(
          `finish(): ${this._timers.size} timer(s) still pending under fake timers:\n${this._describeTimers()}\n` +
            `Advance the clock with advanceTime(ms) first, or assert that the effect was cancelled.`
        );
      }
      // Real timers: the only way to reach the point is to wait for it.
      const latest = Math.max(...[...this._timers].map((timer) => timer.due)) - Date.now();
      await sleep(Math.max(0, latest) + 50);
      await this.advanceTime(0);
    }

    await this._until(
      () => {
        this._throwFailures();
        return this._inFlight === 0 ? true : undefined;
      },
      timeout,
      () =>
        `finish(): ${this._inFlight} effect(s) still running after ${timeout}ms: ` +
        `${[...this._running.values()].join(', ')}. ` +
        `Cancel it (Effect.cancel(id) for a cancellable), or call store.destroy() instead.`
    );
    this._throwFailures();

    await this.advanceTime(0);
    this.assertNoPendingActions();
  }

  /**
   * Deliver an action from outside the reducer, exactly as an effect would.
   *
   * The action is recorded as *received* — so `receive()` matches it and
   * `assertNoPendingActions()` will flag it if you never assert on it — rather
   * than as a user action the way `send()` does. After `destroy()` it is
   * dropped, as the store drops it.
   *
   * This is what a dependency holding the parent's dispatch needs. The dismiss
   * dependency is the motivating case: it dispatches through the dispatch it
   * captured, deliberately bypassing the child's effect stream so `ifLet`
   * cannot wrap the dismiss a second time. Without a dispatch to capture there
   * is no way to observe a dismiss under `TestStore` at all.
   *
   * @example
   * ```typescript
   * let dispatch: Dispatch<ParentAction>;
   * const store = createTestStore({
   *   initialState,
   *   reducer,
   *   // Lazily, because the dependency has to exist before the store does.
   *   dependencies: { dismiss: dismissDependency((a) => dispatch(a), 'child') }
   * });
   * dispatch = (a) => store.dispatch(a);
   *
   * await store.send({ type: 'child', action: { type: 'presented', action } });
   * await store.receive({ type: 'child', action: { type: 'dismiss' } });
   * ```
   *
   * @param action - The action to deliver
   */
  dispatch(action: Action): void {
    if (this._destroyed) return;
    this.receivedActions.push(action);
    const [newState, newEffect] = this.reducer(this._state, action, this.dependencies);
    this._state = newState;

    if (newEffect._tag !== 'None') {
      this._executeEffect(newEffect);
    }
    this._notify();
  }

  getState(): State {
    return this._state;
  }

  /**
   * Get action history.
   */
  getHistory(): ReadonlyArray<Action> {
    return this.actionHistory;
  }

  /**
   * Stop the store: aborts the lifetime signal every `Run`, `AfterDelay`,
   * `Debounced` and `Throttled` executor received, aborts every in-flight
   * cancellable, disarms every timer so nothing fires into the next test,
   * runs every subscription cleanup (a rejecting one is recorded), and drops
   * every later `dispatch()`. Idempotent. `send()`, `receive()`, `finish()`
   * and `advanceTime()` throw after it. The owning test's finish hook calls
   * it, so a store that a test abandons mid-flight is stopped anyway.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._lifetime.abort();

    this._inFlightEffects.forEach((controller) => controller.abort());
    this._inFlightEffects.clear();

    for (const timer of [...this._timers]) this._disarm(timer);
    this._debounceTimers.clear();
    this._throttleState.clear();

    const cleanups = [...this._subscriptionCleanups.values()];
    this._subscriptionCleanups.clear();
    for (const cleanup of cleanups) {
      try {
        Promise.resolve(cleanup()).catch((error: unknown) => {
          this._failures.push(error);
        });
      } catch (error) {
        this._failures.push(error);
      }
    }
    this._notify();
  }

  private _assertAlive(method: string): void {
    if (this._destroyed) {
      throw new Error(`[TestStore] ${method}() used after destroy()`);
    }
  }

  /**
   * Advance virtual time for testing timeouts/intervals.
   *
   * IMPORTANT: Requires vi.useFakeTimers() to be called in your test setup.
   *
   * This method advances Vitest's fake timers and flushes the microtask queue.
   * Effects scheduled via setTimeout/afterDelay will execute during the advancement.
   *
   * @param ms - Number of milliseconds to advance the clock
   *
   * @example
   * ```typescript
   * beforeEach(() => {
   *   vi.useFakeTimers();
   * });
   *
   * it('handles delayed effects', async () => {
   *   const store = createTestStore({ initialState, reducer });
   *
   *   await store.send({ type: 'startTimer' });
   *
   *   // Advance 300ms to trigger afterDelay effect
   *   await store.advanceTime(300);
   *
   *   await store.receive({ type: 'timerCompleted' });
   * });
   * ```
   */
  async advanceTime(ms: number): Promise<void> {
    this._assertAlive('advanceTime');
    // Import vi dynamically to avoid issues in non-test environments
    const { vi } = await import('vitest');

    // Only advance virtual time when there is virtual time to advance.
    //
    // This used to call `advanceTimersByTime` whenever the method existed —
    // which it always does — and Vitest throws "a function to advance timers was
    // called but the timers APIs are not mocked" when they are not. So
    // `finish()`, whose documented job is "wait for pending effects and assert
    // none remain", threw in any test that had no reason to fake time at all.
    // Twenty-one documented examples in this repo were unrunnable because of it.
    if (typeof vi !== 'undefined' && vi.isFakeTimers?.()) {
      // Synchronous advancement: fires every timer due within `ms`.
      vi.advanceTimersByTime(ms);
    } else if (ms > 0) {
      // Real timers: the only way to reach the same point is to wait.
      await sleep(ms);
    }

    // Flush microtask queue to let async callbacks execute
    await Promise.resolve();
    await Promise.resolve(); // Double flush to handle nested promises
  }

  /** Arm a timer on the test clock, registered so `finish()` and `destroy()` see it. */
  private _arm(kind: PendingTimer['kind'], id: string | undefined, ms: number, fire: () => void): PendingTimer {
    const timer: PendingTimer = {
      kind,
      id,
      due: Date.now() + ms,
      handle: setTimeout(() => {
        this._timers.delete(timer);
        fire();
        this._notify();
      }, ms)
    };
    this._timers.add(timer);
    this._notify();
    return timer;
  }

  /** Disarm a timer; it leaves the registry and never fires. */
  private _disarm(timer: PendingTimer): void {
    clearTimeout(timer.handle);
    this._timers.delete(timer);
    this._notify();
  }

  /**
   * Execute an effect and track dispatched actions. Each kind is tracked on
   * its own, by name; the synchronous part of every executor runs now.
   */
  private _executeEffect(effect: Effect<Action>): void {
    const dispatch: Dispatch<Action> = (action: Action) => this.dispatch(action);
    const signal = this._lifetime.signal;

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        this._run('Run', () => effect.execute(dispatch, signal));
        break;

      case 'Cancellable': {
        // `Effect.cancel(id)` carries no work — it cancels. TestStore used to run
        // its no-op executor and stop there, so a reducer whose disconnect is
        // `Effect.cancel(subscriptionId)` tore nothing down under test while
        // doing so correctly in production. A consumer writing the obvious
        // TestStore disconnect test got a green vacuous pass.
        const cleanup = this._subscriptionCleanups.get(effect.id);
        if (typeof cleanup === 'function') {
          this._subscriptionCleanups.delete(effect.id);
          this._run(`Subscription '${effect.id}' cleanup`, cleanup);
        }
        // A debounce or throttle under this id is cancelled too, as the store does.
        this._clearTimers(effect.id);
        if (effect.cancelOnly) {
          // A bare `Effect.cancel(id)` must also abort an in-flight cancellable
          // registered under that id, not only tear down a subscription.
          this._inFlightEffects.get(effect.id)?.abort();
          this._inFlightEffects.delete(effect.id);
          break;
        }

        // Supersession, which TestStore used to not model at all. It ran
        // `effect.execute(dispatch)` with no controller, no registry and no
        // gating — so re-registering an id did not cancel the effect already
        // running under it, and both dispatched. A reducer using a fixed
        // cancellation id to make a second request supersede the first (the
        // session logout does; so does the login flow) behaved one way in
        // production and another under test, and the obvious supersession test
        // passed for the wrong reason or failed for a confusing one.
        this._inFlightEffects.get(effect.id)?.abort();

        const controller = new AbortController();
        this._inFlightEffects.set(effect.id, controller);

        // Gated exactly as the real store gates it: a cancelled effect's
        // actions are unwanted whether or not its author honoured the signal.
        const guardedDispatch: Dispatch<Action> = action => {
          if (controller.signal.aborted) return;
          dispatch(action);
        };

        let execution: Promise<void>;
        try {
          execution = Promise.resolve(effect.execute(guardedDispatch, controller.signal));
        } catch (error) {
          execution = Promise.reject(error);
        }
        execution = execution.finally(() => {
          // Only if still ours — a superseding effect owns the slot now.
          if (this._inFlightEffects.get(effect.id) === controller) {
            this._inFlightEffects.delete(effect.id);
          }
        });
        // An aborted cancellable leaves the in-flight count at abort time: its
        // dispatches are gated off, so nothing it does afterwards can reach
        // the test, and a rejection after the abort is nobody's. Without this
        // a superseded fetch that never settles held finish() until its
        // timeout (R1-REVIEW 1.6).
        const settledOrAborted = new Promise<void>((resolve, reject) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true });
          execution.then(resolve, (error: unknown) => {
            if (controller.signal.aborted) resolve();
            else reject(error);
          });
        });
        execution.catch(() => {});
        this._track(`Cancellable '${effect.id}'`, settledOrAborted);
        break;
      }

      case 'AfterDelay': {
        // Fires on the clock — fake or real; finish() knows it is pending.
        this._arm('AfterDelay', undefined, effect.ms, () => {
          this._run('AfterDelay', () => effect.execute(dispatch, signal));
        });
        break;
      }

      case 'Debounced': {
        const existing = this._debounceTimers.get(effect.id);
        if (existing !== undefined) this._disarm(existing);
        const timer = this._arm('Debounced', effect.id, effect.ms, () => {
          this._debounceTimers.delete(effect.id);
          this._run(`Debounced '${effect.id}'`, () => effect.execute(dispatch, signal));
        });
        this._debounceTimers.set(effect.id, timer);
        break;
      }

      case 'Throttled': {
        const now = Date.now();
        const throttle = this._throttleState.get(effect.id);
        if (!throttle || now - throttle.lastRun >= effect.ms) {
          // Leading edge: run now, drop a pending trailing call.
          if (throttle?.timer) this._disarm(throttle.timer);
          this._throttleState.set(effect.id, { lastRun: now });
          this._run(`Throttled '${effect.id}'`, () => effect.execute(dispatch, signal));
        } else if (!throttle.timer) {
          // Trailing edge: once, when the window closes.
          const timer = this._arm('Throttled', effect.id, effect.ms - (now - throttle.lastRun), () => {
            this._throttleState.set(effect.id, { lastRun: Date.now() });
            this._run(`Throttled '${effect.id}'`, () => effect.execute(dispatch, signal));
          });
          this._throttleState.set(effect.id, { lastRun: throttle.lastRun, timer });
        }
        break;
      }

      case 'Batch':
        for (const member of effect.effects) this._executeEffect(member);
        break;

      case 'FireAndForget':
        this._run('FireAndForget', () => effect.execute());
        break;

      case 'Subscription': {
        // Re-registering the same id replaces the previous subscription, as the
        // real store does.
        const previous = this._subscriptionCleanups.get(effect.id);
        if (typeof previous === 'function') {
          this._subscriptionCleanups.delete(effect.id);
          this._run(`Subscription '${effect.id}' cleanup`, previous);
        }
        this._run(`Subscription '${effect.id}' setup`, () => {
          this._subscriptionCleanups.set(effect.id, effect.setup(dispatch));
        });
        break;
      }

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }

  /** Drop the debounce timer and throttle timer registered under an id. */
  private _clearTimers(id: string): void {
    const timer = this._debounceTimers.get(id);
    if (timer !== undefined) {
      this._disarm(timer);
      this._debounceTimers.delete(id);
    }
    const throttle = this._throttleState.get(id);
    if (throttle?.timer) this._disarm(throttle.timer);
    this._throttleState.delete(id);
  }

  /**
   * Check if action matches partial action.
   *
   * Top-level keys are partial. A nested value is compared structurally, as a
   * whole, with JSON semantics — keys sorted, so `{ a: 1, b: 2 }` and
   * `{ b: 2, a: 1 }` are the same value; a `Date` by its instant; `undefined`
   * properties omitted. The first form compared `JSON.stringify` output, which
   * made key order a difference and the file header warn consumers off nested
   * matching altogether (T6); R1's walked `Object.keys`, so every `Date`
   * matched every other (R1-REVIEW 1.6).
   */
  private _matchesPartialAction(
    action: Action,
    partial: PartialAction<Action>
  ): boolean {
    return Object.entries(partial).every(([key, value]) => {
      const actionValue = (action as any)[key];

      // Structural equality for objects
      if (typeof value === 'object' && value !== null && typeof actionValue === 'object' && actionValue !== null) {
        return stableStringify(actionValue) === stableStringify(value);
      }

      // Shallow equality for primitives
      return actionValue === value;
    });
  }
}

/**
 * Create a TestStore (convenience function).
 *
 * @example
 * ```typescript
 * const store = createTestStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer
 * });
 * ```
 */
export function createTestStore<State, Action, Dependencies = any>(
  config: TestStoreConfig<State, Action, Dependencies>
): TestStore<State, Action, Dependencies> {
  return new TestStore(config);
}
