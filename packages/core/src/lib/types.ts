import type { EffectRuntime } from './execution/runtime.js';
import type { OwnerToken, SlotDescriptor, Lifecycle, ReplaceIntent, OwnerPath } from './execution/identity.js';
import type { ExecutionScheduler } from './execution/scheduler.js';

/**
 * Core type definitions for Composable Svelte.
 *
 * This module defines the foundational types for the architecture:
 * - Reducers: Pure functions that transform state based on actions
 * - Effects: Declarative descriptions of side effects
 * - Store: The runtime that manages state and executes effects
 * - Dependencies: External services injected into reducers
 */

/**
 * A function that dispatches an action to the store.
 *
 * @template Action - The action type
 */
export type Dispatch<Action> = (action: Action) => void;

/**
 * A function that selects a value from state.
 * Does NOT establish reactivity - use $derived in components for reactive values.
 *
 * @template State - The state type
 * @template Value - The selected value type
 */
export type Selector<State, Value> = (state: State) => Value;

/**
 * Function that executes an effect and may dispatch actions.
 *
 * Every executor started by Store or TestStore receives a `signal`.
 * `Effect.cancellable` receives its own signal, aborted by `Effect.cancel(id)`,
 * replacement under the same id, cancellation of an owning group, or `destroy()`.
 * In legacy execution, a `run`, `debounced`, `throttled` or `afterDelay` with a
 * group receives its own signal, aborted with the group or by `destroy()`;
 * without a group, it receives the store's lifetime signal, aborted only by
 * `destroy()`. Managed execution gives each executor its own signal, including
 * ungrouped work. Live work is aborted when its owner or group is retired or the
 * store is destroyed; normal completion retires ownership without aborting the
 * signal. `Effect.map` forwards the signal.
 *
 * The public signature keeps `signal` optional for compatibility with direct
 * executor invocation outside Store/TestStore, where a caller may omit it.
 * A callback may ignore the second parameter regardless of that optionality.
 * When using this signature, pass `signal ?? null` to fetch or narrow the
 * signal before passing it to a dependency that requires an AbortSignal.
 *
 * Observing it is optional: dispatches from a cancelled effect and from a
 * destroyed store are dropped regardless, so cancellation is correct without
 * cooperation. Using the signal additionally stops the work in flight.
 *
 * Under legacy execution (default), dispatch remains accepted from later
 * callbacks after an executor returns. Under managed execution
 * (`execution: { mode: 'managed' }`), an executor owns its dispatch capability
 * until its returned promise settles; a synchronous executor returning `void`
 * completes at the next promise checkpoint. Dispatch during the executor is
 * supported; callbacks invoked after completion are dropped and diagnosed.
 * Keep asynchronous work in the returned promise. Callback-based sources with
 * an independent lifetime belong in `Effect.subscription`, whose synchronous
 * setup returns cleanup.
 *
 * @template Action - The action type
 */
export type EffectExecutor<Action> = (
  dispatch: Dispatch<Action>,
  signal?: AbortSignal
) => void | Promise<void>;

/**
 * Function that sets up a long-running subscription and returns cleanup.
 *
 * @template Action - The action type that can be dispatched
 * @returns Cleanup function called when subscription is cancelled
 */
export type SubscriptionSetup<Action> = (dispatch: Dispatch<Action>) => SubscriptionCleanup;

/**
 * Function that cleans up a subscription's resources.
 */
export type SubscriptionCleanup = () => void | Promise<void>;

/**
 * A discriminated union representing all possible effect types.
 * Effects are declarative descriptions of side effects - they describe WHAT
 * to do, not HOW or WHEN. The Store executes them.
 *
 * @template Action - The action type that can be dispatched
 */
export type Effect<Action> = { readonly origin?: OwnerToken | undefined } & (
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action>; readonly groups?: EffectGroups }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void> }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<Action>[] }
  | {
      readonly _tag: 'Cancellable';
      readonly id: string;
      readonly execute: EffectExecutor<Action>;
      /**
       * Marks `Effect.cancel(id)` — a cancellation with no work of its own.
       *
       * Structural, because the store used to tell the two apart by stringifying
       * the executor and looking for `{}`. A real effect whose body happened to
       * contain an empty object literal was silently classified as a bare cancel
       * and never ran, and the check already needed to accept both `{}` and
       * `{ }` because the build reformats the no-op it was matching.
       */
      readonly cancelOnly?: true;
      readonly groups?: EffectGroups;
    }
  | { readonly _tag: 'Debounced'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action>; readonly groups?: EffectGroups }
  | { readonly _tag: 'Throttled'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action>; readonly groups?: EffectGroups }
  | { readonly _tag: 'AfterDelay'; readonly ms: number; readonly execute: EffectExecutor<Action>; readonly groups?: EffectGroups }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action>; readonly groups?: EffectGroups }
  /**
   * Cancel every effect in a group: abort its signal, disarm its timer, run
   * its subscription's cleanup, drop its later dispatches. Carries no action.
   */
  | { readonly _tag: 'CancelGroup'; readonly group: string });

/**
 * The cancellation groups an executor-bearing effect belongs to.
 *
 * A group is a path-shaped name. The navigation operators set it: an effect
 * produced under a presentation belongs to that presentation's field
 * (`'destination'`), and to its case (`'destination/addItem'`) and screen
 * (`'stack/2'`) beneath it; a lift prefixes what the child set. A dismiss, a
 * parent nulling the field, a case change, a pop or a shrinking `setPath`
 * cancels the group, so a child's in-flight effect cannot land after the
 * child is gone — the audit's N8, which R1 closed on the case *name* only
 * (R1-REVIEW 1.8). `Effect.inGroup` adds one by hand; `Effect.cancelGroup`
 * cancels one. Ids (`Effect.cancellable`, `Effect.cancel`) are untouched.
 *
 * Under legacy execution (default), group cancellation matches globally by
 * string name. Under managed execution (`execution: { mode: 'managed' }`),
 * groups and effect IDs are owner-local (scoped to the originating owner token).
 * Root group cancellation does not cancel child groups of the same name, and
 * removing or replacing a child composed through supported lifecycle composition
 * invalidates its owner and cancels all of its resources, including its groups.
 */
export type EffectGroups = readonly string[] | undefined;

/**
 * One member of the `Effect` union, by tag.
 *
 * The constructors below return these rather than the whole union. They always
 * did at runtime — `Effect.run()` has only ever produced a `Run` — but each was
 * annotated with `Effect<Action>`, so `Effect.run(fn).execute` did not
 * typecheck for a consumer any more than it did for the tests that navigate
 * these structures. Narrowing a return type is backwards compatible: every
 * member is still assignable to the union.
 */
export type EffectOfTag<Action, Tag extends Effect<Action>['_tag']> = Extract<
  Effect<Action>,
  { readonly _tag: Tag }
>;

/**
 * A pure function that transforms state based on an action.
 *
 * Requirements:
 * - MUST be pure (no side effects)
 * - MUST NOT mutate the input state
 * - MUST return a new state object (or same reference if unchanged)
 * - MUST return an Effect (even if Effect.none())
 *
 * @template State - The state type
 * @template Action - The action type
 * @template Dependencies - The dependencies type (default: any)
 *
 * @param state - Current state
 * @param action - The action that occurred
 * @param dependencies - Injected dependencies
 * @returns Tuple of [new state, effect to execute]
 *
 * @example
 * ```typescript
 * const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
 *   switch (action.type) {
 *     case 'incrementTapped':
 *       return [{ ...state, count: state.count + 1 }, Effect.none()];
 *     case 'decrementTapped':
 *       return [{ ...state, count: state.count - 1 }, Effect.none()];
 *     default:
 *       return [state, Effect.none()];
 *   }
 * };
 * ```
 */
export type Reducer<State, Action, Dependencies = any> = (
  state: State,
  action: Action,
  dependencies: Dependencies
) => readonly [State, Effect<Action>];

/**
 * Store execution options for opt-in managed mode.
 */
export interface ManagedReductionInput<State, Action, Dependencies> {
  readonly state: State;
  readonly action: Action;
  readonly dependencies: Dependencies;
  readonly lifecycle: Lifecycle;
  readonly reducer: Reducer<State, Action, Dependencies>;
}
/** Explicit work for an owner allocated by this turn; never rebind existing work. */
export interface CreatedOwnerEffect<Action> {
  readonly path: OwnerPath;
  readonly effect: Effect<Action>;
}
/** One child-domain action reduced by one exact owner during a managed turn. */
export interface OwnerActionDelivery {
  readonly owner: OwnerToken;
  readonly action: unknown;
}
/** Provisional internal composition seam; applications supply ordinary reducers. */
export type ManagedReductionAdapter<State, Action, Dependencies> = <Supplied extends Dependencies>(
  input: ManagedReductionInput<State, Action, Supplied>
) => readonly [State, Effect<Action>, (readonly ReplaceIntent[])?, (readonly CreatedOwnerEffect<Action>[])?, (readonly OwnerActionDelivery[])?];

export interface StoreExecutionConfig<State = any, Action = any, Dependencies = any> {
  readonly mode?: 'legacy' | 'managed' | undefined;
  readonly scheduler?: ExecutionScheduler | undefined;
  /** Managed-only retained root throttle channels; positive safe integer, default 1024.
   * Owned channels and identifier bytes are outside this entry-count limit.
   * Exceeding it reports RootThrottleCapacityError without evicting history.
   */
  readonly rootThrottleCapacity?: number | undefined;
  readonly slots?: SlotDescriptor<State> | undefined;
  /** Internal pure adapter: invoke the feature reducer once, stamp original owners. */
  readonly _reduce?: ManagedReductionAdapter<State, Action, Dependencies> | undefined;
  /** Internal pure first-state planner. Existing epochs are supplied; no reducer runs. */
  readonly _initial?: ((state: State, dependencies: Dependencies, lifecycle: Lifecycle) => readonly CreatedOwnerEffect<Action>[]) | undefined;
  /** Provisional application-owned activation policy, fixed at construction. */
  readonly _initialization?: (
    | { readonly mode: 'attached'; readonly startup?: Action | undefined; readonly startupDecision?: undefined }
    | { readonly mode: 'attached'; readonly startup?: undefined; readonly startupDecision: (state: State, dependencies: Dependencies) => Action | undefined }
  ) | undefined;
}

/**
 * Configuration for creating a Store.
 *
 * @template State - The state type
 * @template Action - The action type
 * @template Dependencies - The dependencies type (default: any)
 */
export interface StoreConfig<State, Action, Dependencies = any> {
  /**
   * The initial state of the store.
   */
  initialState: State;

  /**
   * The reducer that processes actions and produces new state.
   */
  reducer: Reducer<State, Action, Dependencies>;

  /**
   * Optional dependencies to inject into the reducer.
   * Use this for API clients, storage, UUID generators, etc.
   */
  dependencies?: Dependencies | undefined;

  /**
   * Maximum number of actions to keep in history.
   * When limit is reached, oldest actions are removed.
   * Default: unlimited in legacy mode; 100 in managed mode.
   * Set to 0 to disable history tracking.
   */
  maxHistorySize?: number;

  /**
   * Server-side rendering configuration.
   * Controls how the store behaves in server environments.
   */
  ssr?: {
    /**
     * Whether to defer effect execution on the server.
     * When true (default), effects are skipped during server-side rendering.
     * Set to false to allow specific effects to run on the server.
     *
     * Default: true
     */
    deferEffects?: boolean;
  };

  /**
   * Execution configuration for the store runtime.
   */
  execution?: StoreExecutionConfig<State, Action, Dependencies> | undefined;

  // TODO: Middleware support deferred to Phase 5
  // middleware?: Middleware<State, Action>[];

  // TODO: Redux DevTools integration deferred to Phase 5
  // devTools?: boolean;
}

/**
 * The Store interface - runtime for a feature.
 *
 * The store manages:
 * - Holding the current state
 * - Accepting actions via dispatch
 * - Running reducers to compute new state
 * - Executing effects
 * - Notifying subscribers of state changes
 * - Maintaining action history for debugging
 *
 * @template State - The state type
 * @template Action - The action type
 */
export interface Store<State, Action> {
  /**
   * Current state (read-only).
   * Reactive via $state.raw — works with both rune and subscription patterns.
   *
   * Access in components (either pattern works):
   * ```typescript
   * // Rune-based (recommended for Svelte 5)
   * const count = $derived(store.state.count);
   *
   * // Subscription-based (also works)
   * // {$store.count}
   * ```
   */
  readonly state: State;

  /**
   * Dispatch an action to update state.
   *
   * @param action - The action to dispatch
   *
   * @example
   * ```typescript
   * store.dispatch({ type: 'incrementTapped' });
   * ```
   */
  dispatch(action: Action): void;

  /**
   * Select a derived value from state (non-reactive).
   * Returns the current value but does NOT track changes.
   *
   * In Svelte 5 components, use $derived directly for reactive values:
   * ```typescript
   * const value = $derived(store.state.count);
   * ```
   *
   * This method is primarily useful for:
   * - Selecting values in effects/callbacks
   * - One-time value extraction
   * - Testing
   *
   * @param selector - Function to extract value from state
   * @returns The selected value
   */
  select<T>(selector: Selector<State, T>): T;

  /**
   * Subscribe to state changes.
   * The listener is called immediately with the current state,
   * then again whenever state changes.
   *
   * @param listener - Function called with new state
   * @returns Unsubscribe function
   */
  subscribe(listener: (state: State) => void): () => void;

  /**
   * Subscribe to action dispatches.
   * The listener receives the action and the resulting state after reduction.
   *
   * Required for Destination.on() reactive subscriptions (Phase 3).
   *
   * @param listener - Function called with action and resulting state
   * @returns Unsubscribe function
   */
  subscribeToActions?(listener: (action: Action, state: State) => void): () => void;

  /**
   * Get action history (for debugging/time-travel).
   */
  readonly history: ReadonlyArray<Action>;

  /**
   * Clean up resources: aborts every in-flight cancellable and the store's
   * lifetime signal (every other executor kind sees it), clears pending
   * delays, debounces and throttles so none fires, runs subscription
   * cleanups, and removes listeners. Idempotent: repeated calls do nothing.
   * A later `dispatch` is dropped; the first
   * is warned about once per store.
   */
  destroy(): void;

  /**
   * Internal execution runtime seam for test observation and diagnostics.
   */
  readonly _runtime?: EffectRuntime<Action> | undefined;
}

/**
 * Middleware API provided to middleware functions.
 *
 * @template State - The state type
 * @template Action - The action type
 */
export interface MiddlewareAPI<State, Action> {
  /**
   * Get the current state.
   */
  getState(): State;

  /**
   * Dispatch an action.
   */
  dispatch: Dispatch<Action>;
}

/**
 * Middleware function for intercepting actions.
 * Middleware can:
 * - Log actions
 * - Track analytics
 * - Persist state
 * - Block or transform actions
 *
 * @template State - The state type
 * @template Action - The action type
 *
 * @example
 * ```typescript
 * const loggerMiddleware: Middleware<State, Action> = (store) => (next) => (action) => {
 *   console.log('Dispatching:', action);
 *   next(action);
 *   console.log('New state:', store.getState());
 * };
 * ```
 */
export type Middleware<State, Action> = (
  store: MiddlewareAPI<State, Action>
) => (
  next: Dispatch<Action>
) => Dispatch<Action>;
