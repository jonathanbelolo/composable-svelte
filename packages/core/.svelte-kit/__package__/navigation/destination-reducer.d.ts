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
import type { Reducer } from '../types.js';
/**
 * Destination state with a discriminated type field.
 */
export type DestinationState = {
    readonly type: string;
    readonly state: unknown;
    readonly [key: string]: unknown;
};
/**
 * Map of destination type to reducer.
 */
export type DestinationReducerMap<Destination extends DestinationState, Action, Dependencies> = {
    [K in Destination['type']]: Reducer<Extract<Destination, {
        type: K;
    }>['state'], Action, Dependencies>;
};
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
export declare function createDestinationReducer<Destination extends DestinationState, Action, Dependencies>(reducerMap: DestinationReducerMap<Destination, Action, Dependencies>): Reducer<Destination, Action, Dependencies>;
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
export declare function createDestination<T extends string, S>(type: T, state: S, metadata?: Record<string, unknown>): DestinationState & {
    type: T;
    state: S;
};
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
export declare function isDestinationType<Destination extends DestinationState, Type extends Destination['type']>(destination: Destination | null, type: Type): destination is Extract<Destination, {
    type: Type;
}>;
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
export declare function extractDestinationState<Destination extends DestinationState, Type extends Destination['type']>(destination: Destination | null, type: Type): Extract<Destination, {
    type: Type;
}>['state'] | null;
//# sourceMappingURL=destination-reducer.d.ts.map