/**
 * Destination Builder System (Phase 3 DSL)
 *
 * This module provides the `createDestination()` function which auto-generates
 * destination reducers and matcher APIs from a map of child reducers.
 *
 * Key benefits over manual destination definition:
 * - 85% less boilerplate
 * - Full type inference (no manual type annotations needed)
 * - Type-safe matcher APIs with autocomplete
 * - Compile-time typo detection via template literal types
 *
 * @packageDocumentation
 */
import { Effect as EffectConstructors } from '../effect.js';
/**
 * Creates a destination builder from a map of child reducers.
 *
 * This is the core DSL function that auto-generates destination reducers and
 * helper functions, eliminating 85% of manual boilerplate.
 *
 * **What it generates:**
 * - `reducer`: Routes actions to correct child reducer based on type matching
 * - `initial()`: Helper for creating initial destination state
 * - `extract()`: Helper for extracting child state by case type
 * - `_types`: Type information for type-level programming
 *
 * **Type Safety:**
 * - All types inferred automatically from reducer map
 * - Template literal types enable autocomplete for case paths
 * - Compile-time typo detection
 *
 * @template Reducers - A record mapping case types to reducer functions
 * @param reducers - Map of case types to their reducers
 * @returns Destination object with reducer and helpers
 *
 * @example
 * ```typescript
 * // 1. Define child reducers
 * const addItemReducer: Reducer<AddItemState, AddItemAction> = ...;
 * const editItemReducer: Reducer<EditItemState, EditItemAction> = ...;
 *
 * // 2. Create destination (types inferred automatically!)
 * const Destination = createDestination({
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * });
 *
 * // 3. Use generated reducer in parent
 * const parentReducer = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'destination':
 *       return ifLetPresentation(
 *         (s) => s.destination,
 *         (s, d) => ({ ...s, destination: d }),
 *         'destination',
 *         (ca) => ({ type: 'destination', action: ca }),
 *         Destination.reducer  // Auto-generated!
 *       )(state, action, deps);
 *   }
 * };
 *
 * // 4. Use helpers
 * const initial = Destination.initial('addItem', { name: '', quantity: 0 });
 * const addState = Destination.extract(state.destination, 'addItem');
 * ```
 *
 * **Comparison to Manual Pattern (Phase 2):**
 *
 * Before (manual):
 * ```typescript
 * // Define state union manually
 * type DestinationState =
 *   | { type: 'addItem'; state: AddItemState }
 *   | { type: 'editItem'; state: EditItemState };
 *
 * // Define action union manually
 * type DestinationAction =
 *   | { type: 'addItem'; action: PresentationAction<AddItemAction> }
 *   | { type: 'editItem'; action: PresentationAction<EditItemAction> };
 *
 * // Write reducer manually
 * const destinationReducer = createDestinationReducer({
 *   addItem: (s, a, d) => addItemReducer(s.state, a, d),
 *   editItem: (s, a, d) => editItemReducer(s.state, a, d)
 * });
 * ```
 *
 * After (DSL):
 * ```typescript
 * // Everything generated from reducer map!
 * const Destination = createDestination({
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * });
 * ```
 *
 * **85% less boilerplate!**
 */
export function createDestination(reducers) {
    // Auto-generated reducer
    const reducer = (state, action, dependencies) => {
        // Route action to correct child reducer based on type matching
        const caseType = action.type;
        const childReducer = reducers[caseType];
        // If no reducer for this case type, return state unchanged
        if (!childReducer) {
            return [state, EffectConstructors.none()];
        }
        // Check if action matches current state's case type
        if (state.type !== caseType) {
            // Action is for different case - state unchanged
            return [state, EffectConstructors.none()];
        }
        // Unwrap presentation action
        if (action.action.type === 'dismiss') {
            // Dismiss action - parent should observe and clear destination
            // Child reducer doesn't handle this
            return [state, EffectConstructors.none()];
        }
        // Action is 'presented' - pass to child reducer
        const childAction = action.action.action;
        // Call child reducer with child state
        const [newChildState, childEffect] = childReducer(state.state, childAction, dependencies);
        // Reconstruct destination state with new child state
        const newState = {
            type: caseType,
            state: newChildState
        };
        // Child effects are already in parent action type (no mapping needed)
        return [newState, childEffect];
    };
    // Helper: Create initial destination state
    const initial = (caseType, state) => {
        return {
            type: caseType,
            state
        };
    };
    // Helper: Extract child state by case type
    const extract = (state, caseType) => {
        if (!state || state.type !== caseType) {
            return null;
        }
        return state.state;
    };
    // Helper: Check if action matches case path
    const is = (action, casePath) => {
        // Type guard: check if action has expected shape
        if (!action || typeof action !== 'object') {
            return false;
        }
        const act = action;
        // Action must have type field
        if (!act.type || typeof act.type !== 'string') {
            return false;
        }
        // Parse case path
        const [caseType, actionType] = casePath.split('.');
        // Check if action type matches case type
        if (act.type !== caseType) {
            return false;
        }
        // If no action type specified (prefix matching), we're done
        if (!actionType) {
            return true;
        }
        // Action must have nested action field with presentation wrapper
        if (!act.action || typeof act.action !== 'object') {
            return false;
        }
        // Check if it's a presented action (not dismiss)
        if (act.action.type !== 'presented') {
            return false;
        }
        // Check child action type
        if (!act.action.action || typeof act.action.action !== 'object') {
            return false;
        }
        // Match child action type
        return act.action.action.type === actionType;
    };
    // Helper: Atomic match + extract
    const matchCase = (action, state, casePath) => {
        // First check if action matches
        if (!is(action, casePath)) {
            return null;
        }
        // Extract case type from path
        const caseType = casePath.split('.')[0];
        // Extract state for that case
        return extract(state, caseType);
    };
    // Helper: Multi-case matching with handlers
    const match = (action, state, handlers) => {
        // Try each handler in order (first match wins)
        for (const [casePath, handler] of Object.entries(handlers)) {
            const childState = matchCase(action, state, casePath);
            if (childState !== null) {
                return { matched: true, value: handler(childState) };
            }
        }
        return { matched: false };
    };
    return {
        reducer,
        initial,
        extract,
        is,
        matchCase,
        match,
        _types: null // Type-level only
    };
}
