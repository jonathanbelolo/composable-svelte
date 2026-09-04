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
import type { Reducer } from '../types.js';

/**
 * Destination state with a discriminated type field.
 */
export type DestinationState = {
  readonly type: string;
  readonly state: unknown;
  readonly [key: string]: unknown; // Additional metadata (e.g., id, context)
};

/**
 * Map of destination type to reducer.
 *
 * @deprecated Use `createDestination()` from `./destination.js`. This map
 * shares one action type across every case and gives the reducer no way to
 * tag a child's effect with the case it was produced for; see
 * `createDestinationReducer`.
 */
export type DestinationReducerMap<
  Destination extends DestinationState,
  Action,
  Dependencies
> = {
  [K in Destination['type']]: Reducer<
    Extract<Destination, { type: K }>['state'],
    Action,
    Dependencies
  >;
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
 *
 * @deprecated Use `createDestination()`. This helper routes by the *current*
 * destination's type, hands every case the same action, and returns the
 * child's effect untagged — so a result that arrives after the destination has
 * changed is applied to whichever case is open then
 * (AUDIT-2026-09-03-FINDINGS N8). `createDestination().reducer` routes by the
 * action's case and maps each child's effect back into that case, which is
 * what drops a stale result. Kept for existing callers; no fix is planned.
 */
export function createDestinationReducer<
  Destination extends DestinationState,
  Action,
  Dependencies
>(
  reducerMap: DestinationReducerMap<Destination, Action, Dependencies>
): Reducer<Destination, Action, Dependencies> {
  return (destination, action, dependencies) => {
    // Get the reducer for the current destination type
    const reducer = reducerMap[destination.type as Destination['type']];

    if (!reducer) {
      // Unknown destination type → log warning and return unchanged
      console.warn(
        `[Composable Svelte] No reducer found for destination type: "${destination.type}"`
      );
      return [destination, Effect.none()];
    }

    // Run the destination-specific reducer on the nested state
    const [newState, effect] = reducer(
      destination.state as any,
      action,
      dependencies
    );

    // Reconstruct destination with updated state
    const newDestination = {
      ...destination,
      state: newState
    } as Destination;

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
 * const addItemDest = destinationState('addItem', initialAddItemState);
 * // → { type: 'addItem', state: initialAddItemState }
 *
 * const editItemDest = destinationState('editItem', initialEditItemState, { id: '123' });
 * // → { type: 'editItem', state: initialEditItemState, id: '123' }
 * ```
 */
export function destinationState<T extends string, S>(
  type: T,
  state: S,
  metadata?: Record<string, unknown>
): DestinationState & { type: T; state: S } {
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
export function isDestinationType<
  Destination extends DestinationState,
  Type extends Destination['type']
>(
  destination: Destination | null,
  type: Type
): destination is Extract<Destination, { type: Type }> {
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
export function extractDestinationState<
  Destination extends DestinationState,
  Type extends Destination['type']
>(
  destination: Destination | null,
  type: Type
): Extract<Destination, { type: Type }>['state'] | null {
  if (!destination || destination.type !== type) {
    return null;
  }
  return destination.state as Extract<Destination, { type: Type }>['state'];
}
