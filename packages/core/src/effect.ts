/**
 * Effect system for Composable Svelte.
 *
 * Effects are declarative, type-safe descriptions of side effects.
 * They are VALUES, not executions - the Store executes them.
 *
 * Key principle: Effects describe WHAT to do, not HOW or WHEN.
 */

import type { Effect as EffectType, EffectExecutor, Dispatch } from './types.js';

/**
 * Effect namespace containing all effect constructors.
 */
export const Effect = {
  /**
   * No side effects.
   *
   * @example
   * ```typescript
   * case 'reset':
   *   return [initialState, Effect.none()];
   * ```
   */
  none<A>(): EffectType<A> {
    return { _tag: 'None' };
  },

  /**
   * Execute async work and dispatch actions.
   *
   * Use this for API calls, timers, or any async operation that needs
   * to dispatch actions back to the store.
   *
   * @param execute - Function that performs async work and dispatches actions
   *
   * @example
   * ```typescript
   * Effect.run(async (dispatch) => {
   *   const data = await api.fetch();
   *   dispatch({ type: 'dataLoaded', data });
   * })
   * ```
   */
  run<A>(execute: EffectExecutor<A>): EffectType<A> {
    return { _tag: 'Run', execute };
  },

  /**
   * Execute effect without waiting for completion.
   * No actions can be dispatched.
   *
   * Use this for fire-and-forget operations like analytics tracking
   * or logging where you don't care about the result.
   *
   * @param execute - Function that performs work without dispatching
   *
   * @example
   * ```typescript
   * Effect.fireAndForget(() => {
   *   analytics.track('button_clicked');
   * })
   * ```
   */
  fireAndForget<A>(execute: () => void | Promise<void>): EffectType<A> {
    return { _tag: 'FireAndForget', execute };
  },

  /**
   * Execute multiple effects in parallel.
   *
   * All effects in the batch are started simultaneously.
   * Use this when you have multiple independent effects.
   *
   * @param effects - Effects to execute in parallel
   *
   * @example
   * ```typescript
   * Effect.batch(
   *   Effect.run(async (d) => { ... }),
   *   Effect.run(async (d) => { ... }),
   *   Effect.fireAndForget(() => { ... })
   * )
   * ```
   */
  batch<A>(...effects: EffectType<A>[]): EffectType<A> {
    return { _tag: 'Batch', effects };
  },

  /**
   * Execute effect that can be cancelled by ID.
   * Cancels any in-flight effect with the same ID.
   *
   * Use this for operations that should be cancelled when superseded,
   * like API requests that may become stale.
   *
   * @param id - Unique identifier for cancellation
   * @param execute - Function that performs async work
   *
   * @example
   * ```typescript
   * Effect.cancellable('fetch-user', async (dispatch) => {
   *   const user = await api.fetchUser();
   *   dispatch({ type: 'userLoaded', user });
   * })
   * ```
   */
  cancellable<A>(id: string, execute: EffectExecutor<A>): EffectType<A> {
    return { _tag: 'Cancellable', id, execute };
  },

  /**
   * Execute effect after debounce delay.
   * Resets timer if called again with same ID.
   *
   * Use this for search-as-you-type, autosave, or other operations
   * where you want to wait until the user stops performing an action.
   *
   * @param id - Unique identifier for debouncing
   * @param ms - Delay in milliseconds
   * @param execute - Function that performs async work
   *
   * @example
   * ```typescript
   * Effect.debounced('search', 300, async (dispatch) => {
   *   const results = await api.search(query);
   *   dispatch({ type: 'resultsLoaded', results });
   * })
   * ```
   */
  debounced<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectType<A> {
    return { _tag: 'Debounced', id, ms, execute };
  },

  /**
   * Execute effect at most once per time period.
   *
   * Use this for scroll handlers, resize handlers, or other high-frequency
   * events where you want to limit execution rate.
   *
   * @param id - Unique identifier for throttling
   * @param ms - Minimum interval between executions in milliseconds
   * @param execute - Function that performs async work
   *
   * @example
   * ```typescript
   * Effect.throttled('scroll', 100, async (dispatch) => {
   *   dispatch({ type: 'scrolled', y: window.scrollY });
   * })
   * ```
   */
  throttled<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectType<A> {
    return { _tag: 'Throttled', id, ms, execute };
  },

  /**
   * Execute effect after a delay.
   * Useful for animations and timed transitions.
   *
   * @param ms - Delay in milliseconds
   * @param execute - Function that performs work after delay
   *
   * @example
   * ```typescript
   * Effect.afterDelay(300, (dispatch) => {
   *   dispatch({ type: 'animationCompleted' });
   * })
   * ```
   */
  afterDelay<A>(ms: number, execute: EffectExecutor<A>): EffectType<A> {
    return { _tag: 'AfterDelay', ms, execute };
  },

  /**
   * Map effect actions to parent actions (for composition).
   *
   * This is the key function that enables reducer composition.
   * It transforms all actions dispatched by a child effect into
   * parent actions.
   *
   * @param effect - The child effect
   * @param f - Function to transform child action to parent action
   *
   * @example
   * ```typescript
   * const childEffect: Effect<ChildAction> = ...;
   * const parentEffect: Effect<ParentAction> = Effect.map(
   *   childEffect,
   *   (childAction) => ({ type: 'child', action: childAction })
   * );
   * ```
   */
  map<A, B>(effect: EffectType<A>, f: (a: A) => B): EffectType<B> {
    switch (effect._tag) {
      case 'None':
        return Effect.none();

      case 'Run':
        return Effect.run(async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'FireAndForget':
        return Effect.fireAndForget(effect.execute);

      case 'Batch':
        return Effect.batch(...effect.effects.map(e => Effect.map(e, f)));

      case 'Cancellable':
        return Effect.cancellable(effect.id, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'Debounced':
        return Effect.debounced(effect.id, effect.ms, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'Throttled':
        return Effect.throttled(effect.id, effect.ms, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'AfterDelay':
        return Effect.afterDelay(effect.ms, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }
};
