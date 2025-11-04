/**
 * forEach - Collection Management Primitives
 *
 * Eliminates boilerplate for managing dynamic collections of child features.
 * Inspired by Swift TCA's forEach operator.
 *
 * @example
 * ```typescript
 * const reducer = integrate<State, Action, Deps>()
 *   .forEach('counter', s => s.counters, (s, c) => ({ ...s, counters: c }), counterReducer)
 *   .reduce(coreReducer)  // handle add/remove
 *   .build();
 * ```
 */
import { Effect } from '../effect.js';
// ============================================================================
// Core Primitive: forEach
// ============================================================================
/**
 * Creates a reducer that routes actions to child reducers by ID.
 *
 * This is the full-control version for complex cases.
 *
 * @example
 * ```typescript
 * const reducer = forEach({
 *   getArray: s => s.counters,
 *   setArray: (s, counters) => ({ ...s, counters }),
 *   extractChild: a => a.type === 'counter' ? { id: a.id, action: a.action } : null,
 *   wrapChild: (id, action) => ({ type: 'counter', id, action }),
 *   childReducer: counterReducer
 * });
 * ```
 */
export function forEach(config) {
    const { getArray, setArray, extractChild, wrapChild, childReducer } = config;
    return (state, action, deps) => {
        // 1. Extract child action + ID from parent action
        const extracted = extractChild(action);
        if (!extracted) {
            // Not a child action - pass through
            return [state, Effect.none()];
        }
        const { id, action: childAction } = extracted;
        // 2. Find the item by ID
        const array = getArray(state);
        const index = array.findIndex((item) => item.id === id);
        if (index === -1) {
            // ID not found - item may have been removed
            // Silently ignore to prevent crashes from in-flight effects
            return [state, Effect.none()];
        }
        // 3. Run child reducer on the item
        const item = array[index]; // Safe: index was found above
        const [newChildState, childEffect] = childReducer(item.state, childAction, deps);
        // 4. Update array immutably
        const newArray = [...array];
        newArray[index] = { id: item.id, state: newChildState };
        // 5. Map child effect to parent action
        const mappedEffect = Effect.map(childEffect, (a) => wrapChild(id, a));
        return [setArray(state, newArray), mappedEffect];
    };
}
// ============================================================================
// Convenience: forEachElement
// ============================================================================
/**
 * Simplified forEach for the standard pattern (90% of cases).
 *
 * Assumes:
 * - Parent action shape: { type: actionType, id: ID, action: ChildAction }
 * - Child actions are wrapped with the action type and ID
 *
 * @example
 * ```typescript
 * const reducer = forEachElement(
 *   'counter',
 *   s => s.counters,
 *   (s, counters) => ({ ...s, counters }),
 *   counterReducer
 * );
 * ```
 */
export function forEachElement(actionType, getArray, setArray, childReducer) {
    return forEach({
        getArray,
        setArray,
        extractChild: (action) => {
            if (action.type === actionType &&
                'id' in action &&
                'action' in action) {
                const { id, action: childAction } = action;
                return { id, action: childAction };
            }
            return null;
        },
        wrapChild: (id, action) => ({ type: actionType, id, action }),
        childReducer
    });
}
// ============================================================================
// Helper: elementAction
// ============================================================================
/**
 * Helper to create element actions with proper typing.
 *
 * @example
 * ```typescript
 * const action = elementAction('counter', 'counter-1', { type: 'increment' });
 * // => { type: 'counter', id: 'counter-1', action: { type: 'increment' } }
 * ```
 */
export function elementAction(type, id, action) {
    return { type, id, action };
}
