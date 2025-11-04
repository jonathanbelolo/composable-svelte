/**
 * combineReducers utility for composing multiple slice reducers.
 *
 * This is a Redux-style utility where each reducer handles a different
 * slice of state. Each reducer manages its own field in the parent state object.
 */
import type { Reducer } from '../types.js';
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
export declare function combineReducers<State extends Record<string, any>, Action, Dependencies = any>(reducers: {
    [K in keyof State]: Reducer<State[K], Action, Dependencies>;
}): Reducer<State, Action, Dependencies>;
//# sourceMappingURL=combine-reducers.d.ts.map