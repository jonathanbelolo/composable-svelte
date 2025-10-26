/**
 * Store implementation for Composable Svelte.
 *
 * The Store is the runtime that manages state, processes actions, and executes effects.
 * It uses Svelte 5's $state rune for reactivity.
 */

import type {
  Store,
  StoreConfig,
  Dispatch,
  Selector,
  MiddlewareAPI,
  Effect
} from './types.js';

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
  // Use Svelte 5 $state for reactivity
  let state = $state<State>(config.initialState);

  // Action history for debugging/time-travel
  const actionHistory: Action[] = [];

  // In-flight effects for cancellation
  const inFlightEffects = new Map<string, AbortController>();

  // Debounce timers
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Throttle state
  const throttleState = new Map<string, { lastRun: number; timeout?: ReturnType<typeof setTimeout> }>();

  // Subscribers
  const subscribers = new Set<(state: State) => void>();

  // Action subscribers (for Destination.on() in Phase 3)
  const actionSubscribers = new Set<(action: Action, state: State) => void>();

  /**
   * Core dispatch logic (before middleware).
   */
  function dispatchCore(action: Action): void {
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
  function executeEffect(effect: Effect<Action>): void {
    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        Promise.resolve(effect.execute(dispatch)).catch(error => {
          console.error('[Composable Svelte] Effect error:', error);
        });
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

        const controller = new AbortController();
        inFlightEffects.set(effect.id, controller);

        Promise.resolve(effect.execute(dispatch))
          .catch(error => {
            if (error.name !== 'AbortError') {
              console.error('[Composable Svelte] Effect error:', error);
            }
          })
          .finally(() => {
            inFlightEffects.delete(effect.id);
          });
        break;
      }

      case 'Debounced': {
        // Clear existing timer
        const existingTimer = debounceTimers.get(effect.id);
        if (existingTimer !== undefined) {
          clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(() => {
          debounceTimers.delete(effect.id);
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('[Composable Svelte] Effect error:', error);
          });
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
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('[Composable Svelte] Effect error:', error);
          });
        } else if (!throttle.timeout) {
          // Schedule for later
          const delay = effect.ms - (now - throttle.lastRun);
          const timeout = setTimeout(() => {
            // Clear timeout field by replacing entire object
            throttleState.set(effect.id, { lastRun: Date.now() });
            Promise.resolve(effect.execute(dispatch)).catch(error => {
              console.error('[Composable Svelte] Effect error:', error);
            });
          }, delay);

          throttleState.set(effect.id, { lastRun: throttle.lastRun, timeout });
        }
        // else: Already throttled with pending timeout, ignore this call
        break;
      }

      case 'AfterDelay':
        setTimeout(() => {
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('[Composable Svelte] Effect error:', error);
          });
        }, effect.ms);
        break;

      case 'FireAndForget':
        Promise.resolve(effect.execute()).catch(error => {
          console.error('[Composable Svelte] Effect error:', error);
        });
        break;

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
    // Cancel all in-flight effects
    inFlightEffects.forEach(controller => controller.abort());
    inFlightEffects.clear();

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
