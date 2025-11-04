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
import type { Reducer } from '../types.js';
/**
 * Standard shape for items in a collection.
 * Each item has a unique ID and its own state.
 */
export type IdentifiedItem<ID, State> = {
    id: ID;
    state: State;
};
/**
 * Standard shape for actions targeting a specific item in a collection.
 */
export type ElementAction<ActionType extends string, ID, Action> = {
    type: ActionType;
    id: ID;
    action: Action;
};
/**
 * Configuration for the forEach combinator.
 */
export interface ForEachConfig<ParentState, ParentAction, ChildState, ChildAction, ID extends string | number, Dependencies> {
    /**
     * Extract the array of identified items from parent state.
     */
    getArray: (state: ParentState) => Array<IdentifiedItem<ID, ChildState>>;
    /**
     * Update parent state with modified array.
     */
    setArray: (state: ParentState, array: Array<IdentifiedItem<ID, ChildState>>) => ParentState;
    /**
     * Extract child action and ID from parent action.
     * Returns null if action is not for a child.
     */
    extractChild: (action: ParentAction) => {
        id: ID;
        action: ChildAction;
    } | null;
    /**
     * Wrap child action with ID to create parent action.
     */
    wrapChild: (id: ID, action: ChildAction) => ParentAction;
    /**
     * The child reducer to run for matching actions.
     */
    childReducer: Reducer<ChildState, ChildAction, Dependencies>;
}
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
export declare function forEach<ParentState, ParentAction, ChildState, ChildAction, ID extends string | number, Dependencies>(config: ForEachConfig<ParentState, ParentAction, ChildState, ChildAction, ID, Dependencies>): Reducer<ParentState, ParentAction, Dependencies>;
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
export declare function forEachElement<ParentState, ParentAction extends {
    type: string;
}, ChildState, ChildAction, ID extends string | number, Dependencies>(actionType: string, getArray: (state: ParentState) => Array<IdentifiedItem<ID, ChildState>>, setArray: (state: ParentState, array: Array<IdentifiedItem<ID, ChildState>>) => ParentState, childReducer: Reducer<ChildState, ChildAction, Dependencies>): Reducer<ParentState, ParentAction, Dependencies>;
/**
 * Helper to create element actions with proper typing.
 *
 * @example
 * ```typescript
 * const action = elementAction('counter', 'counter-1', { type: 'increment' });
 * // => { type: 'counter', id: 'counter-1', action: { type: 'increment' } }
 * ```
 */
export declare function elementAction<ActionType extends string, ID extends string | number, Action>(type: ActionType, id: ID, action: Action): ElementAction<ActionType, ID, Action>;
//# sourceMappingURL=for-each.d.ts.map