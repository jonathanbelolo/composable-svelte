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
 * ## Cleanup settlement and cancellation
 *
 * `destroy()` is synchronous and idempotent. `destroyAndSettle(timeout = 1000)`
 * also waits for outstanding subscription cleanup and reports failures through
 * its promise, even on a dispatch-only store. Its deadline is real time; it
 * never advances fake time. Start it, advance the test's fake clock as needed,
 * then await it. A timeout names pending subscriptions, which remain observed
 * and may be awaited again. Abandoned executor promises are excluded.
 *
 * Automatic test teardown remains best-effort for legacy compatibility: it
 * waits up to 50ms on real time (one real deadline checkpoint under fake timers)
 * and reports recorded errors with the "and nothing asked" diagnostic. Pending
 * cleanup alone cannot fail a legacy test. Use the explicit method when cleanup
 * settlement is part of the test contract; late failures after that best-effort
 * window have no owning-test guarantee.
 *
 * Both Cancellable and grouped Run drop asynchronous post-abort rejections in
 * TestStore. Production instead logs non-AbortError failures. Synchronous throws
 * during self-cancellation are reported by both. Shared managed-executor parity
 * is a separate contract; this legacy difference is deliberate.
 *
 * ## Subscription Dispatch Gating
 *
 * TestStore gates dispatches from subscription callbacks. Once a subscription is
 * cancelled (via `Effect.cancel`, group cancellation, replacement, or store
 * destruction), dispatches from retained callbacks are dropped to match runtime
 * store behavior.
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

import type { Reducer, Effect, Dispatch, StoreExecutionConfig } from '../types.js';
import type { ResourceRecord } from '../execution/resources.js';
import { EffectRuntime, type RuntimeEvent } from '../execution/runtime.js';
import { TurnQueue, type TurnEnvelope, type TurnEvent } from '../execution/turn-queue.js';
import { DeterministicScheduler, type ExecutionScheduler } from '../execution/scheduler.js';
import { stableStringify } from '../utils/stable-stringify.js';
import { realClearTimeout, realSetTimeout, sleep, timersAreFaked } from './real-timers.js';

type TestLifecycle = Pick<typeof import('vitest'), 'onTestFinished'>;
/**
 * Vitest's lifecycle, resolved while this module evaluates (top-level await). Every importer,
 * including a cold `await import()` inside a running test, therefore sees it before its first
 * TestStore call, and the owning test's cleanup hook registers synchronously with that call.
 * Undefined outside Vitest, where rejections are rethrown instead.
 */
const testLifecycle: TestLifecycle | undefined = await import('vitest').then(
  (module): TestLifecycle => module,
  () => undefined
);
import { createStagedCoordinator } from '../routing/staged/coordinator.js';
import type {
  ApplicationStaging,
  ProtocolDiagnostic,
  ProtocolEvent,
  RequestHandle,
  RequestId,
  RequestResult,
  SourceAuthorityInput,
  StagedRequestOptions,
  StagedRouteCoordinator,
  StagingEligibility,
  TransactionId,
  VisualCuePort,
  VisualTerminalReason
} from '../routing/staged/types.js';
import { isOwnerLive, type OwnerToken } from '../execution/identity.js';
import { isCapturedView, capturedView, registerManagedRoot, type Access } from '../execution/store-access.js';
import type { ChildView } from '../navigation/managed-integration.js';
import { TestStagingFixture, connectStagingFixture, createStagingFixture } from './staged-fixtures.js';

const STAGED_REQUEST_OPTION_KEYS: ReadonlySet<string> = new Set(['return', 'onUnavailable', 'motion', 'placement']);
/** Explicit root request options: a plain object carrying only request option keys. */
function isStagedRequestOptions(value: object): value is StagedRequestOptions {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && STAGED_REQUEST_OPTION_KEYS.has(key));
}

/**
 * Options for TestStore staging configuration.
 */
export interface TestStoreStagingOptions<State, Action, Intent> {
  staging: ApplicationStaging<State, Action, Intent>;
  serialize: (state: State) => string;
  destination?: ((url: string) => string) | undefined;
  outletAttached?: boolean | undefined;
  eligibility?: StagingEligibility | undefined;
  cueMode?: 'auto' | 'manual' | undefined;
  report?: ((error: unknown) => void) | undefined;
}

/**
 * Configuration for TestStore.
 */
export interface TestStoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  /** Opt-in production-equivalent FIFO execution. Default remains legacy. */
  execution?: StoreExecutionConfig<State, Action, Dependencies> | undefined;
  maxHistorySize?: number | undefined;
  /** Explicit staging configuration for staged routing tests. */
  staging?: TestStoreStagingOptions<State, Action, any> | undefined;
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
  /** Leaves the timer's cancellation groups; set when it belongs to any. */
  leave: () => void;
}

type Disposer = () => void;

/** The real-clock poll between notifications, in milliseconds. */
const SAFETY_TICK_MS = 10;

const json = (value: unknown): string => JSON.stringify(value);

class CleanupSettlementTimeout extends Error {}

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
  private _managedQueue: TurnQueue<State, Action, Dependencies> | undefined;
  private _managedRuntime: EffectRuntime<Action> | undefined;
  private _managedScheduler: ExecutionScheduler | undefined;
  private _executionConfig: StoreExecutionConfig<State, Action, Dependencies> | undefined;
  private _receivedSnapshots: State[] = [];
  /** Event projection for diagnostic labels only; runtime owns liveness and cancellation. */
  private _observedResources = new Map<symbol, ResourceRecord>();
  private _sentTurns = new Map<TurnEnvelope<Action>, {resolve: (state: State) => void; reject: (error: unknown) => void}>();

  /** Internal shared-runtime observation, matching the production adapter. */
  get _runtime(): EffectRuntime<Action> | undefined { return this._managedRuntime; }

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
  /** Cleanup settlement is distinct from abandoned executor settlement. */
  private _pendingCleanups = new Map<Promise<void>, string>();
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
  /**
   * Cancellation groups, as the store keeps them (`types.ts` `EffectGroups`):
   * every disposer leaves its groups first, then acts. A cancelled member
   * leaves the in-flight count and the timer registry at once.
   */
  private _groupMembers = new Map<string, Set<Disposer>>();
  /** Waiters notified whenever something they might be waiting for happened. */
  private _waiters = new Set<() => void>();
  /** The test finish hook: unregistered, being registered, armed, or unavailable (no test context). */
  private _hook: 'none' | 'pending' | 'armed' | 'unavailable' = 'none';
  private _hookReady: Promise<void> | null = null;
  /** The registered managed root access; staging uses it exactly as production uses `managedRootAccess`. */
  private _managedAccess: Access<Action> | undefined;
  /** The production coordinator; reachable publicly only through the tracked `_stagedFacade`. */
  private _stagedCoordinator: StagedRouteCoordinator<unknown> | undefined;
  private _stagedFacade: StagedRouteCoordinator<unknown> | undefined;
  private _stagingFixture: TestStagingFixture | undefined;
  private _stagedSerialize: ((state: unknown) => string) | undefined;
  private _fixtureConnections = new Map<TestStagingFixture, () => void>();
  private _protocolEvents: ProtocolEvent[] = [];
  private _unassertedProtocolEvents: ProtocolEvent[] = [];
  /** Every staged request made through this store or its coordinator, for finish(). */
  private _stagedRequests: RequestHandle[] = [];
  private _protocolDiagnostics: ProtocolDiagnostic[] = [];

  /**
   * Integration seam for binding rigs (`setEligibility`, `setVisualPort`, status). Requests made
   * through it are tracked by `finish()` like `request()`; prefer the TestStore methods in tests.
   */
  get stagedCoordinator(): StagedRouteCoordinator<unknown> | undefined { return this._stagedFacade; }
  /** Active staging eligibility fixture if created or provided. */
  get stagingFixture(): TestStagingFixture | undefined { return this._stagingFixture; }
  /** Exhaustive transcript of all protocol events emitted by the staged coordinator. */
  get protocolEvents(): ReadonlyArray<ProtocolEvent> { return this._protocolEvents; }
  /** Unasserted protocol events waiting for receiveProtocol assertions. */
  get unassertedProtocolEvents(): ReadonlyArray<ProtocolEvent> { return this._unassertedProtocolEvents; }

  /**
   * Control exhaustiveness checking for received actions.
   * Default is 'on' to catch unhandled actions in tests.
   */
  public exhaustivity: 'on' | 'off' = 'on';

  constructor(config: TestStoreConfig<State, Action, Dependencies>) {
    if (config.staging && config.execution?.mode !== 'managed') {
      if (config.execution?.mode !== undefined) {
        throw new TypeError(`[TestStore] staging requires managed execution; remove execution.mode: '${config.execution.mode}' or set it to 'managed'`);
      }
      config = { ...config, execution: { ...config.execution, mode: 'managed' } };
    }
    if (config.execution?.mode !== 'managed' && config.execution &&
        (config.execution.scheduler !== undefined || config.execution.slots !== undefined || config.execution._reduce !== undefined || config.execution._initial !== undefined || config.execution._initialization !== undefined || config.execution.rootThrottleCapacity !== undefined)) {
      throw new TypeError('Managed execution options require execution.mode: managed');
    }
    this._state = config.initialState;
    this.reducer = config.reducer;
    this.dependencies = config.dependencies ?? ({} as Dependencies);
    this._executionConfig = config.execution;
    if (config.execution?.mode === 'managed') {
      this._managedScheduler = config.execution.scheduler ?? new DeterministicScheduler();
      this._managedRuntime = new EffectRuntime<Action>({
        scheduler: this._managedScheduler,
        rootThrottleCapacity: config.execution.rootThrottleCapacity,
        dispatch: (action, origin) => {
          try { this._managedQueue!.enqueue({action, origin, source: 'effect'}); }
          catch (error) { this._managedRuntime!.reportFailure(error, 'reduction'); }
        },
        isServer: () => false,
        onEvent: event => this._observeRuntime(event),
        // Execution/cleanup failures already arrive as typed events; diagnostic sink
        // failures use onError and must not disappear only in the testing adapter.
        onError: (error, context) => { if (context === 'observer') this._recordManagedFailure(error); }
      });
      this._managedQueue = new TurnQueue({
        initialState: config.initialState,
        reducer: config.reducer,
        dependencies: config.dependencies,
        execution: config.execution,
        maxHistorySize: config.maxHistorySize,
        runtime: this._managedRuntime,
        onStateCommitted: state => { this._state = state; },
        onTurn: event => this._observeTurn(event),
        onSubscriberError: error => this._recordManagedFailure(error)
      });
      this._managedAccess = this._createManagedAccess(config.execution);
      registerManagedRoot(this as any, this._managedAccess);
    }
    if (config.staging) {
      this.enableStaging(config.staging);
    }
  }

  private _createManagedAccess(executionConfig: StoreExecutionConfig<State, Action, Dependencies> | undefined = this._executionConfig): Access<Action> {
    const queue = this._managedQueue!;
    const runtime = this._managedRuntime!;
    const scheduler = this._managedScheduler!;
    return {
      execution: {
        _reduce: executionConfig?._reduce,
        slots: executionConfig?.slots
      },
      scheduler,
      registerResource: options => runtime.resourceScope.createRecord(options),
      activateInitialization: claim => queue.activateInitialization(claim),
      releaseInitialization: claim => queue.releaseInitialization(claim),
      isLive: () => !this._destroyed && !queue.isDestroyed && !runtime.isDisposed,
      lifecycle: () => queue.getLifecycle(),
      enqueue: (action, origin) => queue.enqueue({ action, origin, source: 'external' }),
      enqueueObserved: (action, origin, observer) => queue.enqueueObserved(action, origin, observer),
      enqueueInspection: (resolve, origin, observer) => queue.enqueueInspection(resolve, origin, observer),
      subscribe: (origin, listener) => {
        const report = (error: unknown) => this._recordManagedFailure(error);
        const notify = () => {
          try { void Promise.resolve(listener()).catch(report); }
          catch (error) { report(error); }
        };
        if (queue.isDestroyed || runtime.isDisposed || !isOwnerLive(queue.getLifecycle(), origin)) {
          notify();
          return () => {};
        }
        const record = runtime.resourceScope.createRecord({
          ownerToken: origin, kind: 'subscription', description: 'ChildView'
        });
        let manuallyStopped = false;
        const stop = this.subscribe(() => { if (record.live) notify(); });
        record.addCleanup(() => {
          stop();
          if (!manuallyStopped) notify();
        });
        return () => { manuallyStopped = true; record.dispose(); };
      },
      subscribeActions: (origin, listener) => {
        if (queue.isDestroyed || runtime.isDisposed || !isOwnerLive(queue.getLifecycle(), origin))
          return () => {};
        return queue.subscribeOwnerDeliveries((deliveryOwner, action) => {
          if (deliveryOwner === origin) listener(action);
        });
      }
    };
  }

  /** Internal qualification harness; application activation belongs to the host owner. */
  _activateInitialization(claim: { readonly live: boolean }): void {
    if (!this._managedQueue) throw new Error('Initialization requires managed execution');
    void this._ensureHooked();
    this._managedQueue.activateInitialization(claim);
  }
  _releaseInitialization(claim: { readonly live: boolean }): void { this._managedQueue?.releaseInitialization(claim); }

  private _observeTurn(event: TurnEvent<State, Action>): void {
    const sent = this._sentTurns.get(event.envelope);
    if (sent) {
      this._sentTurns.delete(event.envelope);
      if (event.type === 'committed') sent.resolve(event.state);
      else sent.reject(event.type === 'rejected' ? event.error : new Error(`[TestStore] send turn dropped: ${event.reason}`));
    } else if (event.type === 'committed') {
      this.receivedActions.push(event.envelope.action);
      this._receivedSnapshots.push(event.state);
    }
    this._notify();
  }

  private _observeRuntime(event: RuntimeEvent): void {
    if (event.type === 'failure') this._recordManagedFailure(event.error, event.phase === 'cleanup');
    if (event.type === 'started') {
      this._observedResources.set(event.record.uid, event.record);
      void event.record.cleanupSettlement.then(() => this._notify());
    } else if (event.type === 'settled') this._observedResources.delete(event.record.uid);
    this._notify();
  }

  private _recordManagedFailure(error: unknown, cleanup = false): void {
    this._failures.push(error);
    this._notify();
    if (this._hook === 'armed' || this._hook === 'pending' || (cleanup && this._destroyed)) return;
    queueMicrotask(() => {
      const index = this._failures.indexOf(error);
      if (index === -1) return;
      this._failures.splice(index, 1);
      throw error;
    });
  }

  /** Managed subscriptions use the same queue and committed snapshots as production. */
  subscribe(listener: (state: State) => void): () => void {
    if (!this._managedQueue) throw new Error('[TestStore] subscribe requires managed execution');
    return this._managedQueue.subscribe(listener);
  }

  subscribeToActions(listener: (action: Action, state: State) => void): () => void {
    if (!this._managedQueue) throw new Error('[TestStore] subscribeToActions requires managed execution');
    return this._managedQueue.subscribeToActions(listener);
  }

  /**
   * Enable staged routing with the production coordinator (`createStagedCoordinator`) over this
   * store's registered root access, FIFO queue and scheduler, as `createApplication` does.
   *
   * Eligibility defaults to a connected `TestStagingFixture`; cues default to manual. The returned
   * coordinator is an integration seam for binding rigs (for example `bindManagedRootRoute`'s
   * `staging` callback); requests made through it are tracked by `finish()` like `request()`.
   */
  enableStaging<Intent>(options: TestStoreStagingOptions<State, Action, Intent>): StagedRouteCoordinator<Intent> {
    if (this._destroyed) {
      throw new Error('[TestStore] enableStaging() called after store was destroyed');
    }
    if (this._stagedCoordinator) {
      throw new Error('[TestStore] staging is already enabled on this store');
    }
    if (!this._managedQueue || !this._managedAccess) {
      throw new Error('[TestStore] enableStaging() requires managed execution mode (configure execution: { mode: \'managed\' } or pass staging in TestStoreConfig)');
    }
    const coordinator = createStagedCoordinator<State, Action, Intent>({
      access: this._managedAccess,
      state: () => this._state,
      subscribe: listener => this.subscribe(listener),
      staging: options.staging,
      serialize: options.serialize,
      destination: options.destination ?? (url => url),
      cueMode: options.cueMode ?? 'manual',
      report: options.report ?? (error => { this._recordManagedFailure(error); })
    });
    coordinator.subscribe(event => {
      this._protocolEvents.push(event);
      this._unassertedProtocolEvents.push(event);
      this._notify();
    });
    coordinator.subscribeDiagnostics(diagnostic => {
      this._protocolDiagnostics.push(diagnostic);
      this._notify();
    });
    const facade = this._trackedCoordinator(coordinator);
    this._stagedCoordinator = coordinator as unknown as StagedRouteCoordinator<unknown>;
    this._stagedFacade = facade as unknown as StagedRouteCoordinator<unknown>;
    this._stagedSerialize = options.serialize as (state: unknown) => string;
    coordinator.setOutletAttached(options.outletAttached ?? true);
    this.setEligibility(options.eligibility ?? createStagingFixture());
    return facade;
  }

  /**
   * The coordinator surface with request tracking; eligibility goes through `setEligibility`.
   * Every control that can start staged work first arms the owning test's automatic cleanup,
   * so a test driving only this seam still gets finish()'s staged checks and destruction.
   */
  private _trackedCoordinator<Intent>(coordinator: StagedRouteCoordinator<Intent>): StagedRouteCoordinator<Intent> {
    const store = this;
    const arm = () => { void store._ensureHooked(); };
    return Object.freeze({
      request(intent: Intent, source: SourceAuthorityInput, options?: StagedRequestOptions): RequestHandle {
        arm();
        const handle = coordinator.request(intent, source, options);
        store._stagedRequests = store._stagedRequests.filter(request => request.status === 'pending');
        store._stagedRequests.push(handle);
        return handle;
      },
      cue: (transaction: TransactionId) => { arm(); coordinator.cue(transaction); },
      visualTerminal: (transaction: TransactionId, reason: VisualTerminalReason) => { arm(); coordinator.visualTerminal(transaction, reason); },
      cancel: (transaction: TransactionId, owner: OwnerToken | undefined) => { arm(); coordinator.cancel(transaction, owner); },
      get status() { return coordinator.status; },
      subscribe: (listener: (event: ProtocolEvent) => void) => coordinator.subscribe(listener),
      subscribeDiagnostics: (listener: (event: ProtocolDiagnostic) => void) => coordinator.subscribeDiagnostics(listener),
      setOutletAttached: (attached: boolean) => coordinator.setOutletAttached(attached),
      setVisualPort: (port: VisualCuePort | undefined) => coordinator.setVisualPort(port),
      setEligibility: (eligibility: StagingEligibility | undefined) => store.setEligibility(eligibility),
      epoch: () => coordinator.epoch(),
      dispose: () => coordinator.dispose()
    });
  }

  private _requireStaging(method: string): StagedRouteCoordinator<unknown> {
    if (!this._stagedCoordinator) {
      throw new Error(`[TestStore] ${method}() requires staging to be enabled (use enableStaging or config.staging)`);
    }
    return this._stagedCoordinator;
  }

  /**
   * Request a staged navigation, as `useStagedRoute` does: from the root, or from a captured
   * feature view of this store (`request(intent, view, options)`), which binds the request to that
   * view's owner. Any other source object is rejected rather than treated as root options.
   */
  request<Intent = unknown>(intent: Intent, options?: StagedRequestOptions): RequestHandle;
  request<Intent = unknown>(intent: Intent, from: ChildView<unknown, unknown>, options?: StagedRequestOptions): RequestHandle;
  request<Intent = unknown>(
    intent: Intent,
    fromOrOptions?: ChildView<unknown, unknown> | StagedRequestOptions,
    maybeOptions?: StagedRequestOptions
  ): RequestHandle {
    this._assertAlive('request');
    this._requireStaging('request');
    void this._ensureHooked();
    this._throwFailures();
    const { source, options } = this._stagedSource(fromOrOptions, maybeOptions);
    if (this.exhaustivity === 'on') {
      if (this.receivedActions.length > 0) this.assertNoPendingActions();
      if (this._unassertedProtocolEvents.length > 0) this.assertNoPendingProtocolEvents();
    }
    return this._stagedFacade!.request(intent, source, options);
  }

  /** Production source rule (`application/routing.ts` sourceFrom) with explicit root options. */
  private _stagedSource(
    from: object | undefined,
    options: StagedRequestOptions | undefined
  ): { source: SourceAuthorityInput; options: StagedRequestOptions } {
    if (from === undefined) return { source: {}, options: options ?? {} };
    if (typeof from !== 'object' || from === null) {
      throw new TypeError('[TestStore] Staged route source must be a captured feature view of this store');
    }
    if (isCapturedView(from)) {
      return { source: this._viewAuthority(from), options: options ?? {} };
    }
    if (options === undefined && isStagedRequestOptions(from)) return { source: {}, options: from };
    throw new TypeError(
      '[TestStore] Staged route source must be a captured feature view of this store; ' +
        'root requests pass only request options (return, onUnavailable, motion, placement).'
    );
  }

  private _viewAuthority(view: object): SourceAuthorityInput & { owner: OwnerToken } {
    const capture = capturedView(view);
    if (capture.root !== this) throw new TypeError('[TestStore] Staged route source belongs to another store');
    return {
      owner: capture.origin,
      ownerLive: () => capture.isLive(),
      observeRetirement: (retired: () => void) => {
        let active = true;
        const record = capture.registerResource({
          kind: 'subscription',
          description: 'Staged route request owner',
          cleanup: () => { if (active) retired(); }
        });
        return () => { active = false; record.dispose(); };
      }
    };
  }

  /**
   * Deliver a manual cue: appends a commit control for the transaction (default: the pending one).
   * A cue for a transaction that is no longer pending is a no-op diagnostic.
   */
  cue(transaction?: TransactionId): void {
    this._assertAlive('cue');
    const coordinator = this._requireStaging('cue');
    void this._ensureHooked();
    this._throwFailures();
    const tx = transaction ?? coordinator.status.pending;
    if (tx === undefined) {
      throw new Error('[TestStore] cue() called with no pending transaction and no transaction ID specified');
    }
    coordinator.cue(tx);
  }

  /**
   * Explicit owner-bound cancel of a staged transaction (default: the pending one). Pass the
   * captured view that issued the request; root-owned transactions take no view.
   */
  cancelStaged(transaction?: TransactionId, from?: ChildView<unknown, unknown>): void {
    this._assertAlive('cancelStaged');
    const coordinator = this._requireStaging('cancelStaged');
    void this._ensureHooked();
    this._throwFailures();
    const owner = from === undefined ? undefined : this._stagedSource(from, {}).source.owner;
    const tx = transaction ?? coordinator.status.pending;
    if (tx === undefined) {
      throw new Error('[TestStore] cancelStaged() called with no pending transaction and no transaction ID specified');
    }
    coordinator.cancel(tx, owner);
  }

  /** Attach or detach the managed route outlet (attached by default). Detaching cancels pending work. */
  setOutletAttached(attached: boolean): void {
    this._requireStaging('setOutletAttached').setOutletAttached(attached);
  }

  /**
   * Replace the history binding eligibility. A `TestStagingFixture` is connected to this store's
   * committed turns so it records exact history results; any other eligibility (for example a real
   * binding's) is used as is.
   */
  setEligibility(eligibility: StagingEligibility | undefined): void {
    const coordinator = this._requireStaging('setEligibility');
    if (eligibility instanceof TestStagingFixture && !this._fixtureConnections.has(eligibility)) {
      const serialize = this._stagedSerialize!;
      this._fixtureConnections.set(eligibility, eligibility[connectStagingFixture]({
        state: () => this._state,
        subscribe: listener => this.subscribe(listener as (state: State) => void),
        serialize: state => serialize(state)
      }));
    }
    this._stagingFixture = eligibility instanceof TestStagingFixture ? eligibility : undefined;
    coordinator.setEligibility(eligibility);
  }

  /**
   * Send an action and optionally assert state changes.
   *
   * With exhaustivity on, every action an effect has delivered must have been
   * asserted with `receive()` before the next `send()` — TCA's rule, and the
   * one that makes a test's transcript complete. The assertion runs on the
   * state the reducer returned. Legacy execution asserts before executing the
   * effect; managed execution records each committed snapshot and immediately
   * continues the production FIFO drain. Awaiting a managed assertion never
   * suspends effect execution, and synchronous dispatch cannot change its snapshot
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
    if (this._managedQueue) {
      // Hook registration and assertion promises never hold up production turn execution.
      void this._ensureHooked();
      this._throwFailures();
      if (this.exhaustivity === 'on' && this.receivedActions.length) this.assertNoPendingActions();
      const envelope: TurnEnvelope<Action> = {action, source: 'external'};
      let resolve!: (state: State) => void, reject!: (error: unknown) => void;
      const committed = new Promise<State>((yes, no) => { resolve = yes; reject = no; });
      this._sentTurns.set(envelope, {resolve, reject});
      try { this._managedQueue.enqueue(envelope); }
      catch (error) {
        this._sentTurns.delete(envelope); reject(error);
        await committed.catch(() => {});
        await this._ensureHooked();
        throw error;
      }
      const snapshot = await committed;
      await this._ensureHooked();
      if (assert) await assert(snapshot);
      return;
    }
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

    let claimed: {snapshot: State};
    if (Array.isArray(partialAction)) {
      if (partialAction.length === 0) {
        throw new TypeError('[TestStore] receive([]) names no action; pass at least one partial.');
      }
      claimed = await this._until(
        () => this._claimMany(partialAction),
        timeout,
        () => this._timeoutMessage(`Expected to receive actions matching ${json(partialAction)}`, timeout)
      );
    } else {
      claimed = await this._until(
        () => this._claimOne(partialAction),
        timeout,
        () => this._timeoutMessage(`Expected to receive action matching ${json(partialAction)}`, timeout)
      );
    }

    if (assert) {
      await assert(this._managedQueue ? claimed.snapshot : this._state);
    }
  }

  /** The single-partial step: consumed, waiting, or a failure. */
  private _claimOne(partial: PartialAction<Action>): {snapshot: State} | undefined {
    this._throwFailures();
    if (this.receivedActions.length === 0) return undefined;

    if (this.exhaustivity === 'on') {
      const head = this.receivedActions[0]!;
      if (this._matchesPartialAction(head, partial)) {
        this.receivedActions.shift();
        return {snapshot: this._managedQueue ? this._receivedSnapshots.shift()! : this._state};
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
    return {snapshot: this._managedQueue ? this._receivedSnapshots.splice(index, 1)[0]! : this._state};
  }

  /** The array step: the next N are a permutation of the partials, or a failure, or waiting. */
  private _claimMany(partials: PartialAction<Action>[]): {snapshot: State} | undefined {
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
      const snapshots = this._receivedSnapshots.splice(0, consumed);
      return {snapshot: this._managedQueue ? snapshots[consumed - 1]! : this._state};
    }

    const taken = new Set<number>();
    for (const partial of partials) {
      const index = this.receivedActions.findIndex(
        (action, i) => !taken.has(i) && this._matchesPartialAction(action, partial)
      );
      if (index === -1) return undefined;
      taken.add(index);
    }
    const snapshot = this._managedQueue ? this._receivedSnapshots[Math.max(...taken)]! : this._state;
    this.receivedActions = this.receivedActions.filter((_, i) => !taken.has(i));
    this._receivedSnapshots = this._receivedSnapshots.filter((_, i) => !taken.has(i));
    return {snapshot};
  }

  /**
   * Wait for and assert on protocol events emitted by the staged routing coordinator.
   *
   * With exhaustivity on, the matched event must be the next one emitted.
   * Top-level keys are partial; nested objects are compared structurally.
   *
   * @param expected - Expected protocol event partial or matcher, or array of them
   * @param assert - Optional assertion callback run with the matched event
   * @param timeout - Timeout in milliseconds of real time (default: 1000)
   */
  async receiveProtocol(
    expected: Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean),
    assert?: (event: ProtocolEvent) => void | Promise<void>,
    timeout?: number
  ): Promise<ProtocolEvent>;
  async receiveProtocol(
    expected: (Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean))[],
    assert?: (event: ProtocolEvent) => void | Promise<void>,
    timeout?: number
  ): Promise<ProtocolEvent[]>;
  async receiveProtocol(
    expected: Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean) | (Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean))[],
    assert?: (event: ProtocolEvent) => void | Promise<void>,
    timeout: number = 1000
  ): Promise<ProtocolEvent | ProtocolEvent[]> {
    this._assertAlive('receiveProtocol');
    if (!this._stagedCoordinator) {
      throw new Error('[TestStore] receiveProtocol() requires staging to be enabled');
    }
    await this._ensureHooked();
    this._throwFailures();

    if (Array.isArray(expected)) {
      if (expected.length === 0) {
        throw new TypeError('[TestStore] receiveProtocol([]) names no event; pass at least one.');
      }
      const claimed = await this._until(
        () => this._claimManyProtocol(expected),
        timeout,
        () => this._timeoutMessage(`Expected to receive protocol events matching ${json(expected)}`, timeout)
      );
      if (assert) {
        for (const event of claimed) {
          await assert(event);
        }
      }
      return claimed;
    }

    const claimed = await this._until(
      () => this._claimOneProtocol(expected),
      timeout,
      () => this._timeoutMessage(`Expected to receive protocol event matching ${json(expected)}`, timeout)
    );
    if (assert) {
      await assert(claimed);
    }
    return claimed;
  }

  private _matchesPartialObject(actual: unknown, expected: unknown): boolean {
    if (typeof expected === 'function') {
      try { return Boolean((expected as any)(actual)); } catch { return false; }
    }
    if (expected === actual) return true;
    if (typeof expected !== 'object' || expected === null) {
      return actual === expected;
    }
    if (typeof actual !== 'object' || actual === null) {
      return false;
    }
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length) return false;
      return expected.every((val, idx) => this._matchesPartialObject(actual[idx], val));
    }
    if (expected instanceof Date || actual instanceof Date) {
      return expected instanceof Date && actual instanceof Date && expected.getTime() === actual.getTime();
    }
    if (expected instanceof Error) {
      if (!(actual instanceof Error)) return false;
      return actual.name === expected.name && actual.message === expected.message;
    }
    return Object.entries(expected).every(([key, value]) => {
      return this._matchesPartialObject((actual as any)[key], value);
    });
  }

  private _matchesProtocolEvent(
    event: ProtocolEvent,
    matcher: Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean)
  ): boolean {
    return this._matchesPartialObject(event, matcher);
  }

  private _claimOneProtocol(
    expected: Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean)
  ): ProtocolEvent | undefined {
    this._throwFailures();
    if (this._unassertedProtocolEvents.length === 0) return undefined;

    if (this.exhaustivity === 'on') {
      const head = this._unassertedProtocolEvents[0]!;
      if (this._matchesProtocolEvent(head, expected)) {
        return this._unassertedProtocolEvents.shift()!;
      }
      const later = this._unassertedProtocolEvents.findIndex(e => this._matchesProtocolEvent(e, expected));
      throw new Error(
        `Expected protocol event ${json(expected)} next, but received ${json(head)} ` +
          (later === -1 ? '(no later event matches either).\n' : `(match was at position ${later}).\n`) +
          `Unasserted protocol events, in order:\n${this._describeProtocolQueue()}\n` +
          `Assert them in order, or set store.exhaustivity = 'off'.`
      );
    }

    const index = this._unassertedProtocolEvents.findIndex(e => this._matchesProtocolEvent(e, expected));
    if (index === -1) return undefined;
    return this._unassertedProtocolEvents.splice(index, 1)[0]!;
  }

  private _claimManyProtocol(
    expected: (Partial<ProtocolEvent> | ((event: ProtocolEvent) => boolean))[]
  ): ProtocolEvent[] | undefined {
    this._throwFailures();

    if (this.exhaustivity === 'on') {
      const remaining = [...expected];
      let consumed = 0;
      for (const event of this._unassertedProtocolEvents) {
        if (remaining.length === 0) break;
        const k = remaining.findIndex(m => this._matchesProtocolEvent(event, m));
        if (k === -1) {
          throw new Error(
            `Expected to receive one of ${json(remaining)} next, but the protocol event at position ${consumed} was ${json(event)}.\n` +
            `Unasserted protocol events, in order:\n${this._describeProtocolQueue()}\n` +
            `Assert it, or set store.exhaustivity = 'off'.`
          );
        }
        remaining.splice(k, 1);
        consumed++;
      }
      if (remaining.length > 0) return undefined;
      return this._unassertedProtocolEvents.splice(0, consumed);
    }

    const taken = new Set<number>();
    const claimed: ProtocolEvent[] = [];
    for (const matcher of expected) {
      const index = this._unassertedProtocolEvents.findIndex((e, i) => !taken.has(i) && this._matchesProtocolEvent(e, matcher));
      if (index === -1) return undefined;
      taken.add(index);
      claimed.push(this._unassertedProtocolEvents[index]!);
    }
    const indicesDesc = [...taken].sort((a, b) => b - a);
    for (const i of indicesDesc) {
      this._unassertedProtocolEvents.splice(i, 1);
    }
    return claimed;
  }

  private _describeProtocolQueue(): string {
    return this._unassertedProtocolEvents.map((e, i) => `  ${i}: ${JSON.stringify(e)}`).join('\n');
  }

  /**
   * Assert no protocol events are pending.
   * Fails only when exhaustivity is 'on'.
   */
  assertNoPendingProtocolEvents(): void {
    if (this.exhaustivity === 'on' && this._unassertedProtocolEvents.length > 0) {
      throw new Error(
        `Expected no pending protocol events, but found ${this._unassertedProtocolEvents.length} unasserted event(s):\n` +
        this._describeProtocolQueue()
      );
    }
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
  private _until<T>(check: () => T | undefined, timeout: number, describeTimeout: () => string, timeoutError: (message: string) => Error = message => new Error(message)): Promise<T> {
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
        reject(timeoutError(describeTimeout()));
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
    if (this._managedRuntime) {
      const details = this._describeManagedResources();
      return (
        `${expectation} within ${timeout}ms.\n` +
        `Received actions: ${this._describeQueue()}\n` +
        `Managed resources pending: ${this._managedRuntime.pendingWorkCount}.` +
        (details ? `\n${details}\n` : ' ') +
        `Advance the injected scheduler explicitly for timer or frame work.\n` +
        `If the expected callback belongs to cancelled or retired work, managed dispatch drops it; assert the surviving state instead of receiving that callback. ` +
        `Already queued actions still require the reducer's request acceptance checks. ` +
        `See the installed guide: node_modules/@composable-svelte/core/docs/testing-owned-work.md (relative to your project).`
      );
    }
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

  private _describeManagedResources(): string {
    if (!this._managedRuntime) return '';
    const live = [...this._observedResources.values()].filter((record) => record.live);
    const cleanups = this._managedRuntime.resourceScope.pendingCleanupCount;
    const lines: string[] = [];
    for (const record of live) {
      lines.push(`  ${this._formatObservedResource(record)}`);
    }
    if (cleanups > 0) {
      lines.push(`  Pending cleanup(s): ${cleanups}`);
    }
    return lines.join('\n');
  }

  private _formatObservedResource(record: ResourceRecord): string {
    const parts = [record.kind ?? 'resource', record.description];
    if (record.id !== undefined) parts.push(record.id);
    return parts.filter(Boolean).join(' ');
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
    // Synchronous, so the hook belongs to the test that is current at this call, before any
    // staged or effect work it starts can outlive that test.
    try {
      if (!testLifecycle) throw new Error('Vitest is not available');
      testLifecycle.onTestFinished(async () => {
        await this._onTestCleanup();
      });
      this._hook = 'armed';
    } catch {
      // No vitest, or no current test: rejections are rethrown instead.
      this._hook = 'unavailable';
    }
    this._hookReady = Promise.resolve();
    return this._hookReady;
  }

  /**
   * Automatic test cleanup executed on onTestFinished. For a store the test did not destroy,
   * it applies finish()'s staged checks with the same rules (pending requests, transactions and
   * staged deadlines always; unasserted protocol events only with exhaustivity on), then
   * destroys, settles cleanups and reports unconsumed rejections.
   */
  private async _onTestCleanup(): Promise<void> {
    let stagedError: unknown;
    if (!this._destroyed) {
      try { this._assertStagedFinish(); }
      catch (error) { stagedError = error; }
    }
    this.destroy();
    // Legacy hooks are best-effort: they must not require consumers to
    // advance fake time after the test body or await an arbitrary close.
    // Explicit destroyAndSettle remains the strict, caller-budgeted API.
    try {
      await this._waitForCleanups(timersAreFaked() ? 0 : 50);
    } catch (error) {
      if (!(error instanceof CleanupSettlementTimeout)) throw error;
    }
    if (stagedError) throw stagedError;
    this._throwUnconsumed();
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
  private _track(label: string, promise: Promise<void>, kind: 'effect' | 'cleanup' = 'effect'): void {
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
        if (this._hook === 'armed' || this._hook === 'pending' || (kind === 'cleanup' && this._destroyed)) return;
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

  /** Observe every cleanup, including one started before destroy(). */
  private _runCleanup(label: string, body: () => void | Promise<void>): void {
    let result: Promise<void>;
    try {
      result = Promise.resolve(body());
    } catch (error) {
      result = Promise.reject(error);
    }
    this._track(label, result, 'cleanup');
    const observed = result.then(() => {}, () => {}).then(() => {
      this._pendingCleanups.delete(observed);
      this._notify();
    });
    this._pendingCleanups.set(observed, label);
  }

  private _joinGroups(groups: readonly string[] | undefined, dispose: Disposer): () => void {
    if (!groups || groups.length === 0) return () => {};
    for (const group of groups) {
      let members = this._groupMembers.get(group);
      if (!members) {
        members = new Set();
        this._groupMembers.set(group, members);
      }
      members.add(dispose);
    }
    return () => {
      for (const group of groups) {
        const members = this._groupMembers.get(group);
        if (!members) continue;
        members.delete(dispose);
        if (members.size === 0) this._groupMembers.delete(group);
      }
    };
  }

  private _cancelGroup(group: string): void {
    const members = this._groupMembers.get(group);
    if (!members) return;
    this._groupMembers.delete(group);
    for (const dispose of [...members]) dispose();
    this._notify();
  }

  /**
   * Run an executor under its own controller when it belongs to a group —
   * the group's disposer aborts it, its dispatches are gated, and an aborted
   * one leaves the in-flight count at once, as an aborted cancellable does —
   * and under the lifetime signal otherwise.
   */
  private _runExecutor(label: string, groups: readonly string[] | undefined, execute: (dispatch: Dispatch<Action>, signal: AbortSignal) => void | Promise<void>): void {
    const dispatch: Dispatch<Action> = (action: Action) => this.dispatch(action);
    if (!groups || groups.length === 0) {
      this._run(label, () => execute(dispatch, this._lifetime.signal));
      return;
    }
    const controller = new AbortController();
    const gatedDispatch: Dispatch<Action> = (action) => {
      if (controller.signal.aborted) return;
      dispatch(action);
    };
    let leave = (): void => {};
    leave = this._joinGroups(groups, () => {
      leave();
      controller.abort();
    });
    let synchronousError: unknown = undefined;
    let threwSynchronously = false;
    let execution: Promise<void>;
    try {
      execution = Promise.resolve(execute(gatedDispatch, controller.signal));
    } catch (error) {
      synchronousError = error;
      threwSynchronously = true;
      execution = Promise.reject(error);
    }
    execution = execution.finally(() => leave());
    const settledOrAborted = new Promise<void>((resolve, reject) => {
      if (controller.signal.aborted) {
        if (threwSynchronously) reject(synchronousError);
        else resolve();
        return;
      }
      const onAbort = () => resolve();
      controller.signal.addEventListener('abort', onAbort, { once: true });
      execution.then(() => {
        controller.signal.removeEventListener('abort', onAbort);
        resolve();
      }, (error: unknown) => {
        controller.signal.removeEventListener('abort', onAbort);
        if (controller.signal.aborted) resolve();
        else reject(error);
      });
    });
    execution.catch(() => {});
    this._track(label, settledOrAborted);
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
    if (this._managedRuntime) {
      await this._ensureHooked();
      await Promise.resolve();
      this._throwFailures();
      const timers = [...this._observedResources.values()].filter(record => record.live && record.kind === 'timer');
      if (timers.length && (this._managedScheduler instanceof DeterministicScheduler || timersAreFaked())) {
        throw new Error(`[TestStore] finish(): ${timers.length} pending timer(s): ${timers.map(record => `${record.description} ${record.id ?? ''}`).join(', ')}; advance explicitly or cancel.`);
      }
      await this._until(
        () => {
          this._throwFailures();
          return this._managedRuntime!.pendingWorkCount === 0 ? true : undefined;
        },
        timeout,
        () => {
          const details = this._describeManagedResources();
          return `[TestStore] finish(): ${this._managedRuntime!.pendingWorkCount} managed resource(s) still pending after ${timeout}ms${details ? `:\n${details}` : ''}\n` +
            `Resolve the controlled service or cancel through its owning feature; identical local keys in sibling owners are independent. ` +
            `For teardown, use destroyAndSettle() and settle any asynchronous cleanup. ` +
            `See the installed guide: node_modules/@composable-svelte/core/docs/testing-owned-work.md (relative to your project).`;
        }
      );
      this._throwFailures();
      this.assertNoPendingActions();
      this._assertStagedFinish();
      return;
    }
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
    this._assertStagedFinish();
  }

  /**
   * Staged items finish() and automatic cleanup name, each independently: requests without a
   * terminal result, the pending transaction, installed staged deadlines (the coordinator's own,
   * not unrelated scheduler timers) and, with exhaustivity on, unasserted protocol events.
   */
  private _assertStagedFinish(): void {
    const coordinator = this._stagedCoordinator;
    if (!coordinator) return;
    const items: string[] = [];
    for (const request of this._stagedRequests) {
      if (request.status === 'pending') items.push(`staged request ${request.id} lacks a terminal result`);
    }
    const pending = coordinator.status.pending;
    if (pending !== undefined) items.push(`transaction ${pending} is still pending; cue, cancel, or advance to its deadline`);
    for (const transaction of coordinator.status.pendingDeadlines()) {
      items.push(`staged deadline timer remains for transaction ${transaction}`);
    }
    if (this.exhaustivity === 'on' && this._unassertedProtocolEvents.length > 0) {
      items.push(`${this._unassertedProtocolEvents.length} protocol event(s) not asserted:\n${this._describeProtocolQueue()}`);
    }
    if (items.length === 0) return;
    throw new Error(
      `[TestStore] finish(): staged routing is not settled:\n${items.map(item => `- ${item}`).join('\n')}\n` +
        `Advance or cue pending work, assert protocol events with receiveProtocol(), or set store.exhaustivity = 'off' for unasserted events only.`
    );
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
    if (this._managedQueue) { this._managedQueue.enqueue({action, source: 'external'}); return; }
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
    return this._managedQueue?.history ?? this.actionHistory;
  }

  /**
   * Stop the store: aborts the lifetime signal every `Run`, `AfterDelay`,
   * `Debounced` and `Throttled` executor received, aborts every in-flight
   * cancellable, disarms every timer so nothing fires into the next test,
   * runs every subscription cleanup (a rejecting one is recorded), and drops
   * every later `dispatch()`. Idempotent. `send()`, `receive()`, `finish()`
   * and `advanceTime()` throw after it. The owning test's finish hook initiates
   * teardown and best-effort cleanup settlement, so a store that a test abandons mid-flight is stopped anyway.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._stagedCoordinator) {
      this._stagedCoordinator.dispose();
    }
    for (const disconnect of this._fixtureConnections.values()) disconnect();
    this._fixtureConnections.clear();
    if (this._managedQueue) { this._managedQueue.destroy(); this._notify(); return; }
    this._lifetime.abort();

    for (const group of [...this._groupMembers.keys()]) this._cancelGroup(group);

    this._inFlightEffects.forEach((controller) => controller.abort());
    this._inFlightEffects.clear();

    for (const timer of [...this._timers]) this._disarm(timer);
    this._debounceTimers.clear();
    this._throttleState.clear();

    const cleanups = [...this._subscriptionCleanups.entries()];
    this._subscriptionCleanups.clear();
    for (const [id, cleanup] of cleanups) {
      this._runCleanup(`Subscription '${id}' destroy cleanup`, cleanup);
    }
    this._notify();
  }

  /**
   * Stop the store and observe subscription cleanups, including cleanup already
   * started by cancellation or replacement. The deadline uses real time even
   * under fake timers; it never advances the test clock. A timed-out cleanup is
   * still observed and can be awaited again. Abandoned executor promises are
   * deliberately excluded. The owning test's hook uses a separate best-effort checkpoint.
   */
  async destroyAndSettle(timeout = 1000): Promise<void> {
    if (this._managedQueue) {
      const hooked = this._ensureHooked();
      this.destroy();
      await hooked;
      await this._waitForCleanups(timeout);
      this._throwFailures();
      return;
    }
    // Arms synchronously before destroy can invoke a rejecting cleanup, even
    // for stores previously used only through dispatch().
    await this._ensureHooked();
    this.destroy();
    await this._waitForCleanups(timeout);
    this._throwFailures();
  }

  private _waitForCleanups(timeout: number): Promise<true> {
    if (this._managedRuntime) return this._until(
      () => this._managedRuntime!.resourceScope.pendingCleanupCount === 0 ? true : undefined,
      timeout,
      () => `[TestStore] destroyAndSettle() timed out with ${this._managedRuntime!.resourceScope.pendingCleanupCount} pending managed cleanup(s)`,
      message => new CleanupSettlementTimeout(message)
    );
    return this._until(
      () => this._pendingCleanups.size === 0 ? true : undefined,
      timeout,
      () => `[TestStore] destroyAndSettle() timed out with ${this._pendingCleanups.size} pending subscription cleanup(s):\n` +
        [...this._pendingCleanups.values()].map(label => `  ${label}`).join('\n') +
        (timersAreFaked() ? '\nA cleanup waiting on fake timers needs the test to advance that clock; this method never advances it.' : ''),
      message => new CleanupSettlementTimeout(message)
    );
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
    if (this._managedScheduler instanceof DeterministicScheduler) {
      await this._managedScheduler.advanceTime(ms);return;
    }
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
      if (this._managedRuntime) await vi.advanceTimersByTimeAsync(ms);
      else vi.advanceTimersByTime(ms);
    } else if (ms > 0) {
      // Real timers: the only way to reach the same point is to wait.
      await sleep(ms);
    }

    // Flush microtask queue to let async callbacks execute
    await Promise.resolve();
    await Promise.resolve(); // Double flush to handle nested promises
  }

  /**
   * Arm a timer on the test clock, registered so `finish()` and `destroy()`
   * see it; in a group, the group's disposer disarms it.
   */
  private _arm(
    kind: PendingTimer['kind'],
    id: string | undefined,
    ms: number,
    groups: readonly string[] | undefined,
    fire: () => void
  ): PendingTimer {
    const timer: PendingTimer = {
      kind,
      id,
      due: Date.now() + ms,
      handle: setTimeout(() => {
        this._timers.delete(timer);
        timer.leave();
        fire();
        this._notify();
      }, ms),
      leave: () => {}
    };
    timer.leave = this._joinGroups(groups, () => {
      timer.leave();
      this._disarm(timer);
    });
    this._timers.add(timer);
    this._notify();
    return timer;
  }

  /** Disarm a timer; it leaves the registry and its groups, and never fires. */
  private _disarm(timer: PendingTimer): void {
    clearTimeout(timer.handle);
    this._timers.delete(timer);
    timer.leave();
    this._notify();
  }

  /**
   * Execute an effect and track dispatched actions. Each kind is tracked on
   * its own, by name; the synchronous part of every executor runs now.
   */
  private _executeEffect(effect: Effect<Action>): void {
    if (this._destroyed) return;
    const dispatch: Dispatch<Action> = (action: Action) => this.dispatch(action);
    const signal = this._lifetime.signal;

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        this._runExecutor('Run', effect.groups, effect.execute);
        break;

      case 'CancelGroup':
        this._cancelGroup(effect.group);
        break;

      case 'Cancellable': {
        // Snapshot and detach all predecessors before any user abort/cleanup
        // callback. New work installed by those callbacks survives this cancel.
        const existing = this._inFlightEffects.get(effect.id);
        const cleanup = this._subscriptionCleanups.get(effect.id);
        const previousTimer = this._debounceTimers.get(effect.id);
        const previousThrottle = this._throttleState.get(effect.id);
        this._inFlightEffects.delete(effect.id);
        this._subscriptionCleanups.delete(effect.id);
        this._debounceTimers.delete(effect.id);
        this._throttleState.delete(effect.id);
        if (previousTimer !== undefined) this._disarm(previousTimer);
        if (previousThrottle?.timer !== undefined) this._disarm(previousThrottle.timer);

        const controller = effect.cancelOnly ? undefined : new AbortController();
        let leaveGroups = (): void => {};
        const retire = () => {
          leaveGroups();
          if (controller && this._inFlightEffects.get(effect.id) === controller) this._inFlightEffects.delete(effect.id);
        };
        if (controller) {
          this._inFlightEffects.set(effect.id, controller);
          leaveGroups = this._joinGroups(effect.groups, () => controller.abort());
          controller.signal.addEventListener('abort', retire, { once: true });
        }
        existing?.abort();
        if (typeof cleanup === 'function') this._runCleanup(`Subscription '${effect.id}' cleanup`, cleanup);
        if (!controller) break;
        if (this._destroyed || controller.signal.aborted || this._inFlightEffects.get(effect.id) !== controller) {
          controller.abort();
          break;
        }

        // Gated exactly as the real store gates it: a cancelled effect's
        // actions are unwanted whether or not its author honoured the signal.
        const guardedDispatch: Dispatch<Action> = action => {
          if (controller.signal.aborted) return;
          dispatch(action);
        };

        let synchronousError: unknown = undefined;
        let threwSynchronously = false;
        let execution: Promise<void>;
        try {
          execution = Promise.resolve(effect.execute(guardedDispatch, controller.signal));
        } catch (error) {
          synchronousError = error;
          threwSynchronously = true;
          execution = Promise.reject(error);
        }
        execution = execution.finally(() => {
          controller.signal.removeEventListener('abort', retire);
          retire();
        });
        // An aborted cancellable leaves the in-flight count at abort time: its
        // dispatches are gated off, so nothing it does afterwards can reach
        // the test, and a rejection after the abort is nobody's. Without this
        // a superseded fetch that never settles held finish() until its
        // timeout (R1-REVIEW 1.6).
        const settledOrAborted = new Promise<void>((resolve, reject) => {
          if (controller.signal.aborted) {
            if (threwSynchronously) reject(synchronousError);
            else resolve();
            return;
          }
          const onAbort = () => resolve();
          controller.signal.addEventListener('abort', onAbort, { once: true });
          execution.then(() => {
            controller.signal.removeEventListener('abort', onAbort);
            resolve();
          }, (error: unknown) => {
            controller.signal.removeEventListener('abort', onAbort);
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
        this._arm('AfterDelay', undefined, effect.ms, effect.groups, () => {
          this._runExecutor('AfterDelay', effect.groups, effect.execute);
        });
        break;
      }

      case 'Debounced': {
        const existing = this._debounceTimers.get(effect.id);
        if (existing !== undefined) this._disarm(existing);
        const timer = this._arm('Debounced', effect.id, effect.ms, effect.groups, () => {
          this._debounceTimers.delete(effect.id);
          this._runExecutor(`Debounced '${effect.id}'`, effect.groups, effect.execute);
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
          this._runExecutor(`Throttled '${effect.id}'`, effect.groups, effect.execute);
        } else if (!throttle.timer) {
          // Trailing edge: once, when the window closes.
          const timer = this._arm('Throttled', effect.id, effect.ms - (now - throttle.lastRun), effect.groups, () => {
            this._throttleState.set(effect.id, { lastRun: Date.now() });
            this._runExecutor(`Throttled '${effect.id}'`, effect.groups, effect.execute);
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
        const previous = this._subscriptionCleanups.get(effect.id);
        this._run(`Subscription '${effect.id}' setup`, () => {
          let live = true;
          let leave = (): void => {};
          let cleanup: (() => void | Promise<void>) | undefined;
          const teardown = (): void | Promise<void> => {
            if (!live) return;
            live = false;
            leave();
            if (this._subscriptionCleanups.get(effect.id) === teardown) this._subscriptionCleanups.delete(effect.id);
            const dispose = cleanup;
            cleanup = undefined;
            if (typeof dispose === 'function') return dispose();
          };
          this._subscriptionCleanups.set(effect.id, teardown);
          leave = this._joinGroups(effect.groups, () => this._runCleanup(`Subscription '${effect.id}' cleanup`, teardown));
          if (typeof previous === 'function') this._runCleanup(`Subscription '${effect.id}' cleanup`, previous);
          // Identity is a defensive ownership check alongside the liveness gate.
          if (!live || this._destroyed || this._subscriptionCleanups.get(effect.id) !== teardown) {
            this._runCleanup(`Subscription '${effect.id}' cleanup`, teardown);
            return;
          }
          const gatedDispatch: Dispatch<Action> = action => {
            if (live && !this._destroyed) dispatch(action);
          };
          try {
            const returnedCleanup = effect.setup(gatedDispatch);
            if (returnedCleanup && typeof (returnedCleanup as unknown as { then?: unknown }).then === 'function') {
              this._runCleanup(`Subscription '${effect.id}' cleanup`, teardown);
              // Async setup is invalid, but still observe its promise and
              // dispose any cleanup function it eventually supplies.
              this._run(`Subscription '${effect.id}' invalid setup`, () =>
                Promise.resolve(returnedCleanup).then(value => {
                  if (typeof value === 'function') this._runCleanup(`Subscription '${effect.id}' late setup cleanup`, value);
                }, () => {})
              );
              throw new TypeError(`Subscription '${effect.id}' setup must return a cleanup function synchronously; received a Promise`);
            }
            if (!live) {
              if (typeof returnedCleanup === 'function') this._runCleanup(`Subscription '${effect.id}' cleanup`, returnedCleanup);
            } else cleanup = returnedCleanup;
          } catch (error) {
            this._runCleanup(`Subscription '${effect.id}' cleanup`, teardown);
            throw error;
          }
        });
        break;
      }

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
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
