/**
 * combineReducers utility for composing multiple slice reducers.
 *
 * This is a Redux-style utility where each reducer handles a different
 * slice of state. Each reducer manages its own field in the parent state object.
 */

import { Effect } from '../effect.js';
import type { Reducer, Effect as EffectType } from '../types.js';

/**
 * Combine multiple reducers into one.
 * Each reducer handles its slice of state.
 *
 * @param reducers - Object mapping state keys to reducers
 * @returns A combined reducer that processes all slices
 *
 * @example
 * ```typescript
 * const appReducer = combineReducers({
 *   counter: counterReducer,  // Handles state.counter
 *   todos: todosReducer       // Handles state.todos
 * });
 * ```
 */
export function combineReducers<State extends Record<string, any>, Action, Dependencies = any>(
  // The mapped type alone infers `State` but leaves `Action` as `unknown`: a
  // reverse-mapped type only yields inference candidates for the parameter
  // under the key, so `Action` never gets one and the documented call form
  // above did not typecheck for anyone. The intersection adds a second,
  // non-mapped inference site for `Action` without loosening anything — a
  // reducer disagreeing about the action type, a missing slice, and a slice
  // whose state does not match are all still rejected.
  reducers: {
    [K in keyof State]: Reducer<State[K], Action, Dependencies>;
  } & Record<string, Reducer<any, Action, Dependencies>>
): Reducer<State, Action, Dependencies>;

// Implementation signature. The intersection above gives callers inference but
// turns `reducers` into an index-signature type inside the body, where writing
// `nextState[key]` on a generic `State` is no longer allowed. The overload
// keeps the public contract exact and the body permissive.
export function combineReducers(
  reducers: Record<string, Reducer<any, any, any>>
): Reducer<any, any, any> {
  return (state, action, dependencies): readonly [any, EffectType<any>] => {
    let hasChanged = false;
    const effects: EffectType<any>[] = [];
    const nextState: Record<string, unknown> = {};

    // Process each slice independently
    for (const key in reducers) {
      const reducer = reducers[key]!;
      const previousStateForKey = state[key];
      const [nextStateForKey, effect] = reducer(previousStateForKey, action, dependencies);

      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;

      // Collect non-None effects
      if (effect._tag !== 'None') {
        effects.push(effect);
      }
    }

    // Return combined state and effects
    const finalEffect: EffectType<any> =
      effects.length === 0
        ? Effect.none()
        : effects.length === 1
          ? effects[0]!
          : Effect.batch(...effects);

    return [
      hasChanged ? nextState : state,
      finalEffect
    ];
  };
}
