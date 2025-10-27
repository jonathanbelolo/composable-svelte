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
   * Optimizations:
   * - Returns Effect.none() for empty batches
   * - Returns single effect directly if batch has only one effect
   * - Filters out Effect.none() from batch to reduce overhead
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
    // Filter out None effects
    const nonNoneEffects = effects.filter(e => e._tag !== 'None');

    // Optimization: empty batch
    if (nonNoneEffects.length === 0) {
      return Effect.none();
    }

    // Optimization: single effect
    if (nonNoneEffects.length === 1) {
      return nonNoneEffects[0]!;
    }

    return { _tag: 'Batch', effects: nonNoneEffects };
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
   * @param ms - Delay in milliseconds (must be non-negative)
   * @param execute - Function that performs async work
   * @throws {TypeError} If ms is negative
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
    if (ms < 0) {
      throw new TypeError(`debounced: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'Debounced', id, ms, execute };
  },

  /**
   * Execute effect at most once per time period.
   *
   * Use this for scroll handlers, resize handlers, or other high-frequency
   * events where you want to limit execution rate.
   *
   * @param id - Unique identifier for throttling
   * @param ms - Minimum interval between executions in milliseconds (must be non-negative)
   * @param execute - Function that performs async work
   * @throws {TypeError} If ms is negative
   *
   * @example
   * ```typescript
   * Effect.throttled('scroll', 100, async (dispatch) => {
   *   dispatch({ type: 'scrolled', y: window.scrollY });
   * })
   * ```
   */
  throttled<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectType<A> {
    if (ms < 0) {
      throw new TypeError(`throttled: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'Throttled', id, ms, execute };
  },

  /**
   * Execute effect after a delay.
   * Useful for animations and timed transitions.
   *
   * @param ms - Delay in milliseconds (must be non-negative)
   * @param create - Function that creates the dispatch call after delay
   * @throws {TypeError} If ms is negative
   *
   * @example
   * ```typescript
   * Effect.afterDelay(300, (dispatch) => {
   *   dispatch({ type: 'animationCompleted' });
   * })
   * ```
   */
  afterDelay<A>(ms: number, create: EffectExecutor<A>): EffectType<A> {
    if (ms < 0) {
      throw new TypeError(`afterDelay: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'AfterDelay', ms, execute: create };
  },

  /**
   * Create an effect that coordinates with animation lifecycle.
   * Automatically dispatches completion events after the specified duration.
   *
   * This is a convenience wrapper around `Effect.afterDelay()` specifically
   * for animation use cases. It provides a cleaner API for common patterns
   * where you need to dispatch an action after an animation completes.
   *
   * **Use this when:**
   * - You have a fixed-duration animation (e.g., CSS transition, Svelte transition)
   * - You need to transition presentation state after animation completes
   * - You want a concise, declarative way to express "do X after Y milliseconds"
   *
   * **Don't use this when:**
   * - Animation duration is variable (use callback from animation library)
   * - You need to cancel the animation mid-flight (use cancellable effects)
   *
   * @param config - Animation configuration
   * @param config.duration - Animation duration in milliseconds (must be non-negative)
   * @param config.onComplete - Action to dispatch when animation completes
   * @throws {TypeError} If duration is negative
   *
   * @example
   * ```typescript
   * // Simple presentation completion
   * case 'addButtonTapped': {
   *   return [
   *     {
   *       ...state,
   *       presentation: { status: 'presenting', content: destination }
   *     },
   *     Effect.animated({
   *       duration: 300,
   *       onComplete: {
   *         type: 'presentation',
   *         event: { type: 'presentationCompleted' }
   *       }
   *     })
   *   ];
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With timeout fallback
   * case 'addButtonTapped': {
   *   return [
   *     {
   *       ...state,
   *       presentation: { status: 'presenting', content: destination }
   *     },
   *     Effect.batch(
   *       Effect.animated({
   *         duration: 300,
   *         onComplete: {
   *           type: 'presentation',
   *           event: { type: 'presentationCompleted' }
   *         }
   *       }),
   *       Effect.animated({
   *         duration: 600,  // 2x expected duration
   *         onComplete: {
   *           type: 'presentation',
   *           event: { type: 'presentationTimeout' }
   *         }
   *       })
   *     )
   *   ];
   * }
   * ```
   */
  animated<A>(config: { duration: number; onComplete: A }): EffectType<A> {
    if (config.duration < 0) {
      throw new TypeError(`animated: duration must be non-negative, got ${config.duration}`);
    }
    return Effect.afterDelay(config.duration, (dispatch) => {
      dispatch(config.onComplete);
    });
  },

  /**
   * Create a presentation effect with automatic lifecycle management.
   *
   * This helper generates both `present` and `dismiss` effects for a complete
   * animation lifecycle. It's designed for the common pattern where you have:
   * - A presentation animation (animate IN)
   * - A dismissal animation (animate OUT)
   * - Both dispatch events to transition presentation state
   *
   * **Benefits:**
   * - DRY: Define animation durations once, reuse for present/dismiss
   * - Type-safe: Action creator ensures correct event structure
   * - Consistent: Both animations use same pattern
   *
   * **Use this when:**
   * - You have symmetric present/dismiss animations (e.g., modal, sheet, drawer)
   * - Both animations dispatch to the same action type
   * - You want to avoid repeating duration/event configuration
   *
   * **Don't use this when:**
   * - Animations are asymmetric (different action types, complex coordination)
   * - You need fine-grained control over timing
   * - You're not using the presentation lifecycle pattern
   *
   * @param config - Transition configuration
   * @param config.presentDuration - Duration for presentation animation (default: 300ms)
   * @param config.dismissDuration - Duration for dismissal animation (default: 200ms)
   * @param config.createPresentationEvent - Function to create action from event
   * @throws {TypeError} If duration is negative
   *
   * @example
   * ```typescript
   * // Define transition once
   * const transition = Effect.transition({
   *   presentDuration: 300,
   *   dismissDuration: 200,
   *   createPresentationEvent: (event) => ({
   *     type: 'presentation',
   *     event
   *   })
   * });
   *
   * // Use in reducer
   * case 'addButtonTapped':
   *   return [
   *     { ...state, presentation: { status: 'presenting', content: destination } },
   *     transition.present
   *   ];
   *
   * case 'closeButtonTapped':
   *   return [
   *     { ...state, presentation: { status: 'dismissing', content: state.presentation.content } },
   *     transition.dismiss
   *   ];
   * ```
   *
   * @example
   * ```typescript
   * // Nested presentation (child within parent)
   * const parentTransition = Effect.transition({
   *   createPresentationEvent: (event) => ({
   *     type: 'parentPresentation',
   *     event
   *   })
   * });
   *
   * const childTransition = Effect.transition({
   *   createPresentationEvent: (event) => ({
   *     type: 'childPresentation',
   *     event
   *   })
   * });
   * ```
   */
  transition<A>(config: {
    presentDuration?: number;
    dismissDuration?: number;
    createPresentationEvent: (event: { type: 'presentationCompleted' | 'dismissalCompleted' }) => A;
  }): {
    present: EffectType<A>;
    dismiss: EffectType<A>;
  } {
    const presentDuration = config.presentDuration ?? 300;
    const dismissDuration = config.dismissDuration ?? 200;

    if (presentDuration < 0) {
      throw new TypeError(`transition: presentDuration must be non-negative, got ${presentDuration}`);
    }
    if (dismissDuration < 0) {
      throw new TypeError(`transition: dismissDuration must be non-negative, got ${dismissDuration}`);
    }

    return {
      present: Effect.animated({
        duration: presentDuration,
        onComplete: config.createPresentationEvent({ type: 'presentationCompleted' })
      }),
      dismiss: Effect.animated({
        duration: dismissDuration,
        onComplete: config.createPresentationEvent({ type: 'dismissalCompleted' })
      })
    };
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
        return Effect.afterDelay(effect.ms, (dispatch) => {
          effect.execute((a) => dispatch(f(a)));
        });

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }
};
