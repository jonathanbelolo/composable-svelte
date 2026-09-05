/**
 * Store implementation for Composable Svelte.
 *
 * The Store is the runtime that manages state, processes actions, and executes effects.
 * Uses $state.raw() for reactive state tracking across compiled library boundaries.
 * Consumers can use either $derived(store.state) or $store (subscribe-based) patterns.
 */

import type {
  Store,
  StoreConfig,
  Dispatch,
  Selector,
  MiddlewareAPI,
  Effect
} from './types.js';
import { isServer } from './ssr/utils.js';

/**
 * Create a Store for a feature.
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer,
 *   dependencies: { apiClient }
 * });
 * ```
 */
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  // $state.raw tracks reassignment only (no deep proxy) — ideal for immutable reducer state
  let state = $state.raw(config.initialState);

  // Action history for debugging/time-travel
  const actionHistory: Action[] = [];

  // In-flight effects for cancellation
  const inFlightEffects = new Map<string, AbortController>();

  // Subscription cleanup functions
  const subscriptionCleanups = new Map<string, () => void | Promise<void>>();

  // Debounce timers
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Throttle state
  const throttleState = new Map<string, { lastRun: number; timeout?: ReturnType<typeof setTimeout> }>();

  // Subscribers
  const subscribers = new Set<(state: State) => void>();

  // Action subscribers (for Destination.on() in Phase 3)
  const actionSubscribers = new Set<(action: Action, state: State) => void>();

  // Everything destroy() must stop that the maps above did not hold: the
  // AfterDelay timers, the executors in flight, and dispatch itself. The
  // first form left all three live, so a delayed action reduced state and
  // re-armed timers in a destroyed store (AUDIT-2026-09-03-FINDINGS N7).
  const delayTimers = new Set<ReturnType<typeof setTimeout>>();
  const lifetime = new AbortController();
  let destroyed = false;
  /** One warning per destroyed store; a later dispatch is silently dropped. */
  let warnedAfterDestroy = false;

  /**
   * Core dispatch logic (before middleware).
   */
  function dispatchCore(action: Action): void {
    if (destroyed) {
      if (!warnedAfterDestroy) {
        warnedAfterDestroy = true;
        console.warn(
          '[Composable Svelte] dispatch after destroy ignored:',
          (action as { type?: unknown } | null)?.type
        );
      }
      return;
    }

    // Record action (with optional size limit)
    if (config.maxHistorySize === undefined || config.maxHistorySize > 0) {
      actionHistory.push(action);

      // Trim history if it exceeds max size
      if (config.maxHistorySize !== undefined && actionHistory.length > config.maxHistorySize) {
        actionHistory.shift(); // Remove oldest action
      }
    }

    // Run reducer (pure function)
    const [newState, effect] = config.reducer(
      state,
      action,
      config.dependencies as Dependencies
    );

    // Update state (Svelte reactivity kicks in)
    const stateChanged = !Object.is(state, newState);
    if (stateChanged) {
      state = newState;

      // Notify subscribers
      subscribers.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          console.error('[Composable Svelte] Subscriber error:', error);
        }
      });
    }

    // Notify action subscribers
    actionSubscribers.forEach(listener => {
      try {
        listener(action, state);
      } catch (error) {
        console.error('[Composable Svelte] Action subscriber error:', error);
      }
    });

    // Execute effect asynchronously
    if (effect._tag !== 'None') {
      executeEffect(effect);
    }
  }

  // TODO: Middleware support deferred to Phase 5
  const dispatch: Dispatch<Action> = dispatchCore;

  /**
   * Execute an effect based on its type.
   */
  /**
   * Invoke a subscription cleanup without letting it take anything else down.
   *
   * Three failures this absorbs, all of which only became reachable once
   * cleanups started actually running:
   *
   * - a setup that returned nothing, which the documented consumer shape for a
   *   WebSocket dependency does. Calling `undefined` threw a *synchronous*
   *   TypeError the surrounding `.catch` could not see, so `destroy()` threw and
   *   every later teardown step — the remaining cleanups, the subscription map,
   *   the debounce and throttle timers, the subscriber list — was skipped.
   * - a cleanup that throws synchronously, which escaped through `dispatch()`
   *   and out of the caller's event handler, leaving the entry installed to
   *   throw again at destroy.
   * - a cleanup that rejects, which was already handled.
   */
  function runCleanup(cleanup: (() => void | Promise<void>) | undefined): void {
    if (typeof cleanup !== 'function') return;
    try {
      Promise.resolve(cleanup()).catch(error => {
        console.error('[Composable Svelte] Subscription cleanup error:', error);
      });
    } catch (error) {
      console.error('[Composable Svelte] Subscription cleanup error:', error);
    }
  }

  /**
   * Run an effect body without letting a synchronous throw out.
   *
   * `Promise.resolve(execute()).catch(…)` handles a rejection but not a body
   * that throws before returning: that escaped `dispatch()` into the caller's
   * event handler, skipped the rest of a `Batch`, and inside a debounce,
   * throttle or delay timer was an uncaught exception — while the same
   * executor mapped through `scope()` was caught, so behaviour depended on
   * composition depth (AUDIT-2026-09-03-FINDINGS N3).
   */
  function guarded(run: () => void | Promise<void>): void {
    try {
      Promise.resolve(run()).catch(error => {
        console.error('[Composable Svelte] Effect error:', error);
      });
    } catch (error) {
      console.error('[Composable Svelte] Effect error:', error);
    }
  }

  function executeEffect(effect: Effect<Action>): void {
    // Check if we should defer effects (SSR)
    const deferEffects = config.ssr?.deferEffects ?? true; // Default to true
    if (isServer() && deferEffects) {
      // Skip effect execution on server
      return;
    }

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        // The store's lifetime signal: aborted by destroy(), for an executor
        // that awaits something and wants to stop.
        guarded(() => effect.execute(dispatch, lifetime.signal));
        break;

      case 'Batch':
        effect.effects.forEach(executeEffect);
        break;

      case 'Cancellable': {
        // Cancel existing effect with same id
        const existing = inFlightEffects.get(effect.id);
        if (existing) {
          existing.abort();
        }

        // Cancel existing subscription with same id
        // Deleted unconditionally: the entry used to be removed only inside the
        // truthy branch, so a subscription whose setup returned nothing could
        // never be cancelled at all.
        runCleanup(subscriptionCleanups.get(effect.id));
        subscriptionCleanups.delete(effect.id);

        // Clear debounce timer with same id
        const existingTimer = debounceTimers.get(effect.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          debounceTimers.delete(effect.id);
        }

        // Clear throttle with same id
        const existingThrottle = throttleState.get(effect.id);
        if (existingThrottle?.timeout) {
          clearTimeout(existingThrottle.timeout);
        }
        throttleState.delete(effect.id);

        // Effect.cancel() carries no work of its own — cancel and stop here.
        if (effect.cancelOnly) {
          break;
        }

        // Otherwise, set up new cancellable effect
        const controller = new AbortController();
        inFlightEffects.set(effect.id, controller);

        // The signal is handed to the executor so it can cooperate — pass it to
        // `fetch`, check it around an await. It used to be created, stored and
        // aborted while never reaching anyone, so `Effect.cancel` on a cancellable
        // was pure bookkeeping: the work ran to completion and still dispatched.
        //
        // Dispatch is gated on it as well, so cancellation means something even
        // for an executor that ignores the signal entirely. A cancelled effect's
        // actions are no longer wanted, and that must not depend on the author
        // having opted in.
        const guardedDispatch: Dispatch<Action> = action => {
          if (controller.signal.aborted) return;
          dispatch(action);
        };

        let running: Promise<void>;
        try {
          running = Promise.resolve(effect.execute(guardedDispatch, controller.signal));
        } catch (error) {
          running = Promise.reject(error);
        }
        running
          .catch(error => {
            // Optional chaining because a rejection is not required to be an
            // object: `throw null` or a bare `Promise.reject()` used to throw a
            // second TypeError *inside* this handler, turning a handled failure
            // into an unhandled rejection.
            if ((error as { name?: string } | null)?.name !== 'AbortError') {
              console.error('[Composable Svelte] Effect error:', error);
            }
          })
          .finally(() => {
            // Only if this execution is still the current one. A superseded
            // effect settling later used to delete its *successor's* controller,
            // after which `Effect.cancel` for that id found nothing and the live
            // work ran on uncancelled and ungated — the opposite of the guarantee
            // `Effect.cancellable` exists to give.
            if (inFlightEffects.get(effect.id) === controller) {
              inFlightEffects.delete(effect.id);
            }
          });
        break;
      }

      case 'Debounced': {
        // Clear existing timer
        const existingTimer = debounceTimers.get(effect.id);
        if (existingTimer !== undefined) {
          clearTimeout(existingTimer);
        }

        // Set new timer. The executor gets the store's lifetime signal, as a
        // Run or an AfterDelay does (R1-REVIEW 1.9).
        const timer = setTimeout(() => {
          debounceTimers.delete(effect.id);
          guarded(() => effect.execute(dispatch, lifetime.signal));
        }, effect.ms);

        debounceTimers.set(effect.id, timer);
        break;
      }

      case 'Throttled': {
        const now = Date.now();
        const throttle = throttleState.get(effect.id);

        if (!throttle || now - throttle.lastRun >= effect.ms) {
          // Execute immediately, clear any pending timeout
          if (throttle?.timeout) {
            clearTimeout(throttle.timeout);
          }
          throttleState.set(effect.id, { lastRun: now });
          guarded(() => effect.execute(dispatch, lifetime.signal));
        } else if (!throttle.timeout) {
          // Schedule for later
          const delay = effect.ms - (now - throttle.lastRun);
          const timeout = setTimeout(() => {
            // Clear timeout field by replacing entire object
            throttleState.set(effect.id, { lastRun: Date.now() });
            guarded(() => effect.execute(dispatch, lifetime.signal));
          }, delay);

          throttleState.set(effect.id, { lastRun: throttle.lastRun, timeout });
        }
        // else: Already throttled with pending timeout, ignore this call
        break;
      }

      case 'AfterDelay': {
        const timer = setTimeout(() => {
          delayTimers.delete(timer);
          guarded(() => effect.execute(dispatch, lifetime.signal));
        }, effect.ms);
        delayTimers.add(timer);
        break;
      }

      case 'FireAndForget':
        guarded(() => effect.execute());
        break;

      case 'Subscription': {
        // Cancel existing subscription with same id
        runCleanup(subscriptionCleanups.get(effect.id));
        subscriptionCleanups.delete(effect.id);

        // Dispatch is gated on this subscription still being the live one.
        //
        // A real socket's `close()` fires `onclose` on a later task, and consumers
        // report that through the connection callback — so without the gate a
        // deliberate disconnect ends with the store believing the connection
        // failed, and a reconnect has the *old* socket's close clobber the new
        // one's healthy state. `Cancellable` got this gate and `Subscription` did
        // not, which is backwards: subscriptions are the ones that outlive their
        // own cancellation.
        let live = true;
        const gatedDispatch: Dispatch<Action> = action => {
          if (!live) return;
          dispatch(action);
        };

        try {
          const cleanup = effect.setup(gatedDispatch);
          subscriptionCleanups.set(effect.id, () => {
            live = false;
            if (typeof cleanup === 'function') cleanup();
          });
        } catch (error) {
          live = false;
          console.error('[Composable Svelte] Subscription setup error:', error);
        }
        break;
      }

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }

  /**
   * Select a derived value from state (non-reactive).
   */
  function select<T>(selector: Selector<State, T>): T {
    return selector(state);
  }

  /**
   * Subscribe to state changes.
   */
  function subscribe(listener: (state: State) => void): () => void {
    subscribers.add(listener);

    // Immediately call with current state
    try {
      listener(state);
    } catch (error) {
      console.error('[Composable Svelte] Subscriber error:', error);
    }

    return () => {
      subscribers.delete(listener);
    };
  }

  /**
   * Subscribe to action dispatches (for Destination.on() in Phase 3).
   */
  function subscribeToActions(listener: (action: Action, state: State) => void): () => void {
    actionSubscribers.add(listener);
    return () => {
      actionSubscribers.delete(listener);
    };
  }

  /**
   * Clean up resources.
   */
  function destroy(): void {
    destroyed = true;
    lifetime.abort();

    // Cancel all in-flight effects
    inFlightEffects.forEach(controller => controller.abort());
    inFlightEffects.clear();

    // Pending delays never fire
    delayTimers.forEach(timer => clearTimeout(timer));
    delayTimers.clear();

    // Call all subscription cleanups
    subscriptionCleanups.forEach(cleanup => runCleanup(cleanup));
    subscriptionCleanups.clear();

    // Clear all timers
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();

    throttleState.forEach(t => {
      if (t.timeout) clearTimeout(t.timeout);
    });
    throttleState.clear();

    // Clear subscribers
    subscribers.clear();
    actionSubscribers.clear();
  }

  return {
    get state() {
      return state;
    },
    dispatch,
    select,
    subscribe,
    subscribeToActions,
    get history() {
      return actionHistory;
    },
    destroy
  };
}
