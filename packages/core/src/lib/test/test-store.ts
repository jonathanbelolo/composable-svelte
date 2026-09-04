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
 * 1. **Enable fake timers in your test setup:**
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
 * - `receive()` uses `vi.waitFor()` to poll for actions (effects execute asynchronously)
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
 *     vi.restoreAllMocks();
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
 *    (e.g., `Effect.cancellable()`) execute asynchronously. `receive()` polls for actions
 *    using `vi.waitFor()`.
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
 * 3. **`finish()` convenience method**: Equivalent to `await advanceTime(0); assertNoPendingActions()`
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
 * Nested values are compared structurally, key order ignored.
 *
 * ## Exhaustiveness Checking
 *
 * By default (`exhaustivity: 'on'`), TestStore ensures all received actions are
 * asserted, in the order the effects delivered them: `receive()` must name the
 * next action in the queue, and `send()` refuses to run while an earlier one is
 * still unasserted:
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
 */

import type { Reducer, Effect, Dispatch } from '../types.js';
import { stableStringify } from '../utils/stable-stringify.js';

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
  private pendingEffects: Promise<void>[] = [];
  private pendingTimers: number = 0; // Track number of scheduled timers
  private _subscriptionCleanups = new Map<string, () => void | Promise<void>>();
  /** In-flight cancellables by id, so re-registering one aborts its predecessor. */
  private _inFlightEffects = new Map<string, AbortController>();
  /**
   * Debounce timers and throttle state by id, modelled on the store's own —
   * both used to execute at once, every time, so `Effect.cancel(debounceId)`
   * was untestable and a debounce test could not tell one call from three
   * (AUDIT-2026-09-03-FINDINGS N9, T6). They run on the test clock: under
   * `vi.useFakeTimers()` advance it with `advanceTime(ms)`.
   */
  private _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _throttleState = new Map<string, { lastRun: number; timeout?: ReturnType<typeof setTimeout> }>();

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
      this.pendingEffects.push(this._executeEffect(effect));
    }
  }

  /**
   * Wait for and assert an action was received from effects.
   *
   * With exhaustivity on, the matched action must be the *next* one the
   * effects delivered: a partial that matches a later action while an earlier
   * one is still unasserted fails at once, naming both, so a test cannot skip
   * past an action it did not expect. Set `exhaustivity = 'off'` to match
   * anywhere in the queue.
   *
   * Partial matching compares nested values structurally, key order ignored.
   *
   * @param partialAction - Partial action to match (must have type field)
   * @param assert - Optional state assertion
   * @param timeout - Timeout in milliseconds (default: 1000)
   * @throws {Error} If action not received within timeout, or received out of order
   */
  async receive(
    partialAction: PartialAction<Action>,
    assert?: StateAssertion<State>,
    timeout: number = 1000
  ): Promise<void> {
    const { vi } = await import('vitest');
    let outOfOrder: Error | null = null;

    // Use vi.waitFor to poll for the action (like store.test.ts does)
    await vi.waitFor(() => {
      // Process any immediate effects
      while (this.pendingEffects.length > 0) {
        const pending = [...this.pendingEffects];
        this.pendingEffects = [];
        Promise.all(pending); // Fire and forget
      }

      // Find matching action
      const index = this.receivedActions.findIndex(action =>
        this._matchesPartialAction(action, partialAction)
      );

      if (index === -1) {
        const receivedTypes = this.receivedActions.map((a: any) => a.type);
        throw new Error(
          `Expected to receive action matching ${JSON.stringify(partialAction)}\n` +
          `Received actions: ${JSON.stringify(receivedTypes)}\n` +
          `Full actions: ${JSON.stringify(this.receivedActions, null, 2)}`
        );
      }

      if (index !== 0 && this.exhaustivity === 'on') {
        // Not a reason to keep polling: the queue already holds the answer.
        outOfOrder = new Error(
          `Expected to receive ${JSON.stringify(partialAction)} next, but the next ` +
          `received action was ${JSON.stringify(this.receivedActions[0])} ` +
          `(the match was at position ${index}).\n` +
          `Received actions, in order:\n${this._describeQueue()}\n` +
          `Assert them in order, or set store.exhaustivity = 'off'.`
        );
        return;
      }

      // Remove matched action
      this.receivedActions.splice(index, 1);
    }, { timeout });

    if (outOfOrder) throw outOfOrder;

    if (assert) {
      await assert(this._state);
    }
  }

  /** The unasserted received actions, one per line, for a message. */
  private _describeQueue(): string {
    return this.receivedActions.map((a, i) => `  ${i}: ${JSON.stringify(a)}`).join('\n');
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
   * Convenience method to complete the test.
   * Waits for any pending effects and asserts no actions remain.
   * Equivalent to: await advanceTime(0); assertNoPendingActions();
   *
   * @example
   * ```typescript
   * await store.send({ type: 'loadData' });
   * await store.receive({ type: 'dataLoaded' });
   * await store.finish(); // Verify test is complete
   * ```
   */
  async finish(): Promise<void> {
    await this.advanceTime(0);
    this.assertNoPendingActions();
  }

  /**
   * Get current state.
   */
  /**
   * Deliver an action from outside the reducer, exactly as an effect would.
   *
   * The action is recorded as *received* — so `receive()` matches it and
   * `assertNoPendingActions()` will flag it if you never assert on it — rather
   * than as a user action the way `send()` does.
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
    this.receivedActions.push(action);
    const [newState, newEffect] = this.reducer(this._state, action, this.dependencies);
    this._state = newState;

    if (newEffect._tag !== 'None') {
      this.pendingEffects.push(this._executeEffect(newEffect));
    }
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
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Flush microtask queue to let async callbacks execute
    await Promise.resolve();
    await Promise.resolve(); // Double flush to handle nested promises
  }

  /**
   * Execute an effect and track dispatched actions.
   */
  private async _executeEffect(effect: Effect<Action>): Promise<void> {
    const dispatch: Dispatch<Action> = (action: Action) => this.dispatch(action);

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        await effect.execute(dispatch);
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
          await cleanup();
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

        try {
          await effect.execute(guardedDispatch, controller.signal);
        } finally {
          // Only if still ours — a superseding effect owns the slot now.
          if (this._inFlightEffects.get(effect.id) === controller) {
            this._inFlightEffects.delete(effect.id);
          }
        }
        break;
      }

      case 'AfterDelay':
        // Schedule the effect to execute after delay using setTimeout
        // Don't track the promise - just let setTimeout fire naturally
        // When vi.advanceTimersByTime() is called, this will execute
        setTimeout(async () => {
          try {
            await effect.execute(dispatch);
          } catch (error) {
            console.error('[TestStore] Effect error:', error);
          }
        }, effect.ms);
        break;

      case 'Debounced': {
        const existing = this._debounceTimers.get(effect.id);
        if (existing !== undefined) clearTimeout(existing);
        const timer = setTimeout(() => {
          this._debounceTimers.delete(effect.id);
          this.pendingEffects.push(this._runLater(effect.execute, dispatch));
        }, effect.ms);
        this._debounceTimers.set(effect.id, timer);
        break;
      }

      case 'Throttled': {
        const now = Date.now();
        const throttle = this._throttleState.get(effect.id);
        if (!throttle || now - throttle.lastRun >= effect.ms) {
          // Leading edge: run now, drop a pending trailing call.
          if (throttle?.timeout) clearTimeout(throttle.timeout);
          this._throttleState.set(effect.id, { lastRun: now });
          await effect.execute(dispatch);
        } else if (!throttle.timeout) {
          // Trailing edge: once, when the window closes.
          const timeout = setTimeout(() => {
            this._throttleState.set(effect.id, { lastRun: Date.now() });
            this.pendingEffects.push(this._runLater(effect.execute, dispatch));
          }, effect.ms - (now - throttle.lastRun));
          this._throttleState.set(effect.id, { lastRun: throttle.lastRun, timeout });
        }
        break;
      }

      case 'Batch':
        await Promise.all(effect.effects.map(e => this._executeEffect(e)));
        break;

      case 'FireAndForget':
        await effect.execute();
        break;

      case 'Subscription': {
        // Re-registering the same id replaces the previous subscription, as the
        // real store does.
        const previous = this._subscriptionCleanups.get(effect.id);
        if (typeof previous === 'function') await previous();
        this._subscriptionCleanups.set(effect.id, effect.setup(dispatch));
        break;
      }

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }

  /** Run a timer-scheduled executor, reporting a failure the way AfterDelay does. */
  private async _runLater(
    execute: (dispatch: Dispatch<Action>) => void | Promise<void>,
    dispatch: Dispatch<Action>
  ): Promise<void> {
    try {
      await execute(dispatch);
    } catch (error) {
      console.error('[TestStore] Effect error:', error);
    }
  }

  /** Drop the debounce timer and throttle timeout registered under an id. */
  private _clearTimers(id: string): void {
    const timer = this._debounceTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._debounceTimers.delete(id);
    }
    const throttle = this._throttleState.get(id);
    if (throttle?.timeout) clearTimeout(throttle.timeout);
    this._throttleState.delete(id);
  }

  /**
   * Check if action matches partial action.
   *
   * Nested values are compared structurally with keys sorted, so
   * `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are the same value. The first form
   * compared `JSON.stringify` output, which made key order a difference and
   * the file header warn consumers off nested matching altogether (T6).
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
