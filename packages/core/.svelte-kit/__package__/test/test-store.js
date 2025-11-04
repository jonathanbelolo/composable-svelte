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
 *   vi.restoreAllMocks();
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
 * Deep equality is performed using JSON serialization. For complex objects,
 * consider checking state directly instead.
 *
 * ## Exhaustiveness Checking
 *
 * By default (`exhaustivity: 'on'`), TestStore ensures all received actions are asserted:
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
export class TestStore {
    constructor(config) {
        this.actionHistory = [];
        this.receivedActions = [];
        this.pendingEffects = [];
        this.pendingTimers = 0; // Track number of scheduled timers
        this._subscriptionCleanups = new Map();
        /**
         * Control exhaustiveness checking for received actions.
         * Default is 'on' to catch unhandled actions in tests.
         */
        this.exhaustivity = 'on';
        this.state = config.initialState;
        this.reducer = config.reducer;
        this.dependencies = config.dependencies ?? {};
    }
    /**
     * Send an action and optionally assert state changes.
     *
     * @param action - The action to dispatch
     * @param assert - Optional state assertion
     */
    async send(action, assert) {
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
     * ⚠️ WARNING: Partial matching with nested objects DOES NOT work reliably in browser tests!
     * See the file header documentation for details and recommended patterns.
     *
     * RECOMMENDED: Use type-only matching + state assertions:
     * ```typescript
     * await store.receive({ type: 'actionName' });
     * expect(store.state.someField).toBe(expectedValue);
     * ```
     *
     * AVOID in browser tests:
     * ```typescript
     * await store.receive({ type: 'actionName', nested: { field: 'value' } }); // ❌ Fails!
     * ```
     *
     * @param partialAction - Partial action to match (must have type field)
     * @param assert - Optional state assertion
     * @param timeout - Timeout in milliseconds (default: 1000)
     * @throws {Error} If action not received within timeout
     */
    async receive(partialAction, assert, timeout = 1000) {
        const { vi } = await import('vitest');
        // Use vi.waitFor to poll for the action (like store.test.ts does)
        await vi.waitFor(() => {
            // Process any immediate effects
            while (this.pendingEffects.length > 0) {
                const pending = [...this.pendingEffects];
                this.pendingEffects = [];
                Promise.all(pending); // Fire and forget
            }
            // Find matching action
            const index = this.receivedActions.findIndex(action => this._matchesPartialAction(action, partialAction));
            if (index === -1) {
                const receivedTypes = this.receivedActions.map((a) => a.type);
                throw new Error(`Expected to receive action matching ${JSON.stringify(partialAction)}\n` +
                    `Received actions: ${JSON.stringify(receivedTypes)}\n` +
                    `Full actions: ${JSON.stringify(this.receivedActions, null, 2)}`);
            }
            // Remove matched action
            this.receivedActions.splice(index, 1);
        }, { timeout });
        if (assert) {
            await assert(this.state);
        }
    }
    /**
     * Assert no actions are pending.
     * Only fails when exhaustivity is 'on'.
     */
    assertNoPendingActions() {
        if (this.exhaustivity === 'on' && this.receivedActions.length > 0) {
            const types = this.receivedActions.map((a) => a.type);
            throw new Error(`Expected no pending actions, but found ${this.receivedActions.length} unasserted action(s):\n` +
                `Types: ${JSON.stringify(types)}\n` +
                `Full actions: ${JSON.stringify(this.receivedActions, null, 2)}`);
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
    async finish() {
        await this.advanceTime(0);
        this.assertNoPendingActions();
    }
    /**
     * Get current state.
     */
    getState() {
        return this.state;
    }
    /**
     * Get action history.
     */
    getHistory() {
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
    async advanceTime(ms) {
        // Import vi dynamically to avoid issues in non-test environments
        const { vi } = await import('vitest');
        // Check if vi is available (jsdom mode has it, browser mode doesn't)
        if (typeof vi !== 'undefined' && vi.advanceTimersByTime) {
            // Use synchronous timer advancement (this fires all timers up to ms)
            vi.advanceTimersByTime(ms);
        }
        // Flush microtask queue to let async callbacks execute
        await Promise.resolve();
        await Promise.resolve(); // Double flush to handle nested promises
    }
    /**
     * Execute an effect and track dispatched actions.
     */
    async _executeEffect(effect) {
        const dispatch = (action) => {
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
                await effect.execute(dispatch);
                break;
            case 'AfterDelay':
                // Schedule the effect to execute after delay using setTimeout
                // Don't track the promise - just let setTimeout fire naturally
                // When vi.advanceTimersByTime() is called, this will execute
                setTimeout(async () => {
                    try {
                        await effect.execute(dispatch);
                    }
                    catch (error) {
                        console.error('[TestStore] Effect error:', error);
                    }
                }, effect.ms);
                break;
            case 'Debounced':
            case 'Throttled':
                // For now, execute immediately (proper debounce/throttle would need more complex timer management)
                await effect.execute(dispatch);
                break;
            case 'Batch':
                await Promise.all(effect.effects.map(e => this._executeEffect(e)));
                break;
            case 'FireAndForget':
                await effect.execute();
                break;
            case 'Subscription':
                // Set up subscription and store cleanup
                const cleanup = effect.setup(dispatch);
                this._subscriptionCleanups.set(effect.id, cleanup);
                break;
            default:
                // Exhaustiveness check
                const _exhaustive = effect;
                throw new Error(`Unhandled effect type: ${_exhaustive._tag}`);
        }
    }
    /**
     * Check if action matches partial action.
     * Supports nested object matching via deep equality.
     */
    _matchesPartialAction(action, partial) {
        return Object.entries(partial).every(([key, value]) => {
            const actionValue = action[key];
            // Deep equality for objects
            if (typeof value === 'object' && value !== null && typeof actionValue === 'object' && actionValue !== null) {
                return JSON.stringify(actionValue) === JSON.stringify(value);
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
export function createTestStore(config) {
    return new TestStore(config);
}
