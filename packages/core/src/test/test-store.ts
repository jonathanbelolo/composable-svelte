/**
 * TestStore for testing reducers and effects.
 *
 * Provides a specialized store for testing that enables:
 * - send/receive pattern for asserting on effect-dispatched actions
 * - Exhaustiveness checking (ensures all actions are asserted)
 * - Synchronous and async action handling
 * - Clear, helpful error messages
 */

import type { Reducer, Effect, Dispatch } from '../types.js';

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
  private state: State;
  private reducer: Reducer<State, Action, Dependencies>;
  private dependencies: Dependencies;
  private actionHistory: Action[] = [];
  private receivedActions: Action[] = [];
  private pendingEffects: Promise<void>[] = [];

  /**
   * Control exhaustiveness checking for received actions.
   * Default is 'on' to catch unhandled actions in tests.
   */
  public exhaustivity: 'on' | 'off' = 'on';

  constructor(config: TestStoreConfig<State, Action, Dependencies>) {
    this.state = config.initialState;
    this.reducer = config.reducer;
    this.dependencies = config.dependencies ?? ({} as Dependencies);
  }

  /**
   * Send an action and optionally assert state changes.
   *
   * @param action - The action to dispatch
   * @param assert - Optional state assertion
   */
  async send(
    action: Action,
    assert?: StateAssertion<State>
  ): Promise<void> {
    this.actionHistory.push(action);

    const [newState, effect] = this.reducer(this.state, action, this.dependencies);
    this.state = newState;

    if (effect._tag !== 'None') {
      this.pendingEffects.push(this._executeEffect(effect));
    }

    if (assert) {
      await assert(this.state);
    }
  }

  /**
   * Wait for and assert an action was received from effects.
   *
   * @param partialAction - Partial action to match (must have type field)
   * @param assert - Optional state assertion
   * @param timeout - Timeout in milliseconds (default: 1000)
   * @throws {Error} If action not received within timeout
   */
  async receive(
    partialAction: PartialAction<Action>,
    assert?: StateAssertion<State>,
    timeout: number = 1000
  ): Promise<void> {
    const startTime = Date.now();

    // Wait for any pending effects (effects may spawn new effects)
    while (this.pendingEffects.length > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        throw new Error(
          `Timeout waiting for effects after ${timeout}ms\n` +
          `Expected action: ${JSON.stringify(partialAction)}\n` +
          `Pending effects: ${this.pendingEffects.length}\n` +
          `Received actions so far: ${JSON.stringify(this.receivedActions.map((a: any) => a.type))}`
        );
      }

      const pending = [...this.pendingEffects];
      this.pendingEffects = [];

      // Add small delay to prevent tight loop
      await Promise.race([
        Promise.all(pending),
        new Promise(resolve => setTimeout(resolve, 10))
      ]);
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

    // Remove matched action
    this.receivedActions.splice(index, 1);

    if (assert) {
      await assert(this.state);
    }
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
  getState(): State {
    return this.state;
  }

  /**
   * Get action history.
   */
  getHistory(): ReadonlyArray<Action> {
    return this.actionHistory;
  }

  /**
   * Advance virtual time (for testing timeouts/intervals).
   * Note: Only increments virtual time counter. Actual timer control
   * requires fake timer implementation (e.g., vi.useFakeTimers()).
   */
  async advanceTime(ms: number): Promise<void> {
    // Wait for any scheduled effects to complete
    while (this.pendingEffects.length > 0) {
      const pending = [...this.pendingEffects];
      this.pendingEffects = [];
      await Promise.all(pending);
    }
  }

  /**
   * Execute an effect and track dispatched actions.
   */
  private async _executeEffect(effect: Effect<Action>): Promise<void> {
    const dispatch: Dispatch<Action> = (action: Action) => {
      this.receivedActions.push(action);
      const [newState, newEffect] = this.reducer(this.state, action, this.dependencies);
      this.state = newState;

      if (newEffect._tag !== 'None') {
        this.pendingEffects.push(this._executeEffect(newEffect));
      }
    };

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
      case 'Cancellable':
      case 'Debounced':
      case 'Throttled':
      case 'AfterDelay':
        await effect.execute(dispatch);
        break;

      case 'Batch':
        await Promise.all(effect.effects.map(e => this._executeEffect(e)));
        break;

      case 'FireAndForget':
        await effect.execute();
        break;

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }

  /**
   * Check if action matches partial action.
   */
  private _matchesPartialAction(
    action: Action,
    partial: PartialAction<Action>
  ): boolean {
    return Object.entries(partial).every(([key, value]) => {
      return (action as any)[key] === value;
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
