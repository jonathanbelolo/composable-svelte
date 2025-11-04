/**
 * createDestinationReducer for enum-based navigation routing.
 *
 * This helper simplifies routing actions to different destination reducers
 * based on discriminated union (enum) state patterns.
 *
 * Example destination state:
 * ```typescript
 * type DestinationState =
 *   | { type: 'addItem'; state: AddItemState }
 *   | { type: 'editItem'; state: EditItemState; id: string }
 *   | { type: 'filter'; state: FilterState };
 * ```
 *
 * @packageDocumentation
 */
import { Effect } from '../effect.js';
/**
 * Creates a reducer that routes actions to destination-specific reducers.
 *
 * Given a map of destination types to reducers, this function returns a reducer
 * that automatically routes actions to the correct child reducer based on the
 * current destination type.
 *
 * @param reducerMap - Map of destination type strings to their respective reducers
 * @returns A reducer that handles all destination types
 *
 * @example
 * ```typescript
 * type Destination =
 *   | { type: 'addItem'; state: AddItemState }
 *   | { type: 'editItem'; state: EditItemState; id: string };
 *
 * type Action =
 *   | { type: 'save' }
 *   | { type: 'cancel' };
 *
 * const destinationReducer = createDestinationReducer<Destination, Action, Deps>({
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * });
 *
 * // In parent reducer:
 * if (state.destination) {
 *   const [newDest, effect] = destinationReducer(
 *     state.destination,
 *     action,
 *     deps
 *   );
 *   return [{ ...state, destination: newDest }, effect];
 * }
 * ```
 */
export function createDestinationReducer(reducerMap) {
    return (destination, action, dependencies) => {
        // Get the reducer for the current destination type
        const reducer = reducerMap[destination.type];
        if (!reducer) {
            // Unknown destination type → log warning and return unchanged
            console.warn(`[Composable Svelte] No reducer found for destination type: "${destination.type}"`);
            return [destination, Effect.none()];
        }
        // Run the destination-specific reducer on the nested state
        const [newState, effect] = reducer(destination.state, action, dependencies);
        // Reconstruct destination with updated state
        const newDestination = {
            ...destination,
            state: newState
        };
        return [newDestination, effect];
    };
}
/**
 * Helper for creating destination state objects.
 *
 * This provides a type-safe way to construct destination states.
 *
 * @example
 * ```typescript
 * const addItemDest = createDestination('addItem', initialAddItemState);
 * // → { type: 'addItem', state: initialAddItemState }
 *
 * const editItemDest = createDestination('editItem', initialEditItemState, { id: '123' });
 * // → { type: 'editItem', state: initialEditItemState, id: '123' }
 * ```
 */
export function createDestination(type, state, metadata) {
    return {
        type,
        state,
        ...metadata
    };
}
/**
 * Type guard to check if destination matches a specific type.
 *
 * @param destination - The destination state to check
 * @param type - The destination type to match
 * @returns True if destination matches the type
 *
 * @example
 * ```typescript
 * if (isDestinationType(state.destination, 'addItem')) {
 *   // state.destination.state is AddItemState
 *   console.log(state.destination.state.item);
 * }
 * ```
 */
export function isDestinationType(destination, type) {
    return destination !== null && destination.type === type;
}
/**
 * Extract destination state for a specific type.
 *
 * Returns the nested state if destination matches the type, otherwise null.
 *
 * @param destination - The destination state
 * @param type - The destination type to extract
 * @returns The nested state or null
 *
 * @example
 * ```typescript
 * const addItemState = extractDestinationState(state.destination, 'addItem');
 * if (addItemState) {
 *   // addItemState is AddItemState
 *   console.log(addItemState.item);
 * }
 * ```
 */
export function extractDestinationState(destination, type) {
    if (!destination || destination.type !== type) {
        return null;
    }
    return destination.state;
}
