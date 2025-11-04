/**
 * combineReducers utility for composing multiple slice reducers.
 *
 * This is a Redux-style utility where each reducer handles a different
 * slice of state. Each reducer manages its own field in the parent state object.
 */
import { Effect } from '../effect.js';
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
export function combineReducers(reducers) {
    return (state, action, dependencies) => {
        let hasChanged = false;
        const effects = [];
        const nextState = {};
        // Process each slice independently
        for (const key in reducers) {
            const reducer = reducers[key];
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
        const finalEffect = effects.length === 0
            ? Effect.none()
            : effects.length === 1
                ? effects[0]
                : Effect.batch(...effects);
        return [
            hasChanged ? nextState : state,
            finalEffect
        ];
    };
}
