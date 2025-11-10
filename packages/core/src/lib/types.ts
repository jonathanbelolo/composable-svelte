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
 * @template Action - The action type
 */
export type EffectExecutor<Action> = (
  dispatch: Dispatch<Action>
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
export type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void> }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<Action>[] }
  | { readonly _tag: 'Cancellable'; readonly id: string; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Debounced'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Throttled'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'AfterDelay'; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action> };

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
  dependencies?: Dependencies;

  /**
   * Maximum number of actions to keep in history.
   * When limit is reached, oldest actions are removed.
   * Default: unlimited (all actions retained).
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
   * In Svelte 5, this uses $state for reactivity.
   *
   * Access in components:
   * ```typescript
   * const count = $derived(store.state.count);
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
   * Clean up resources.
   * Cancels all in-flight effects and clears subscriptions.
   */
  destroy(): void;
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
