/**
 * scopeToDestination - Create scoped stores for navigation destinations.
 *
 * This helper creates a derived store that focuses on a specific destination case.
 * It's used in components to reactively render navigation destinations (modals, sheets, etc.).
 *
 * Key features:
 * - Returns null when destination is not present (hides component)
 * - Returns scoped store when destination matches case (shows component)
 * - Automatically maps actions through destination wrapper
 *
 * Phase 3 will wrap this with fluent API (scopeTo().into().case())
 *
 * @packageDocumentation
 */

import type { Store } from '../types.js';
import type { DestinationState } from './destination-reducer.js';
import type { PresentationAction } from './types.js';

/**
 * Scoped store for a specific destination case.
 *
 * Provides:
 * - state: The destination's nested state (or null if not presented)
 * - dispatch: Dispatch function that wraps actions in presentation wrapper
 *
 * @template State - The destination state type
 * @template Action - The destination action type
 */
export interface ScopedDestinationStore<State, Action> {
  /**
   * The destination state, or null if not presented.
   *
   * Use in Svelte components with $derived:
   * ```svelte
   * <script>
   * const scopedStore = $derived(scopeToDestination(...));
   * const isPresented = $derived(scopedStore.state !== null);
   * </script>
   *
   * {#if scopedStore.state}
   *   <Modal state={scopedStore.state} dispatch={scopedStore.dispatch} />
   * {/if}
   * ```
   */
  readonly state: State | null;

  /**
   * Dispatch function that automatically wraps actions in presentation wrapper.
   *
   * @param action - The child action to dispatch
   *
   * @example
   * ```typescript
   * // Component dispatches child action
   * scopedStore.dispatch({ type: 'saveButtonTapped' });
   *
   * // Automatically wrapped and sent to parent as:
   * // { type: 'destination', action: { type: 'presented', action: { type: 'saveButtonTapped' } } }
   * ```
   */
  dispatch(action: Action): void;

  /**
   * Dispatch a dismiss action.
   *
   * Convenience method equivalent to dispatching PresentationAction.dismiss()
   */
  dismiss(): void;
}

/**
 * Create a scoped store for a specific destination case.
 *
 * This is the Phase 2 functional API. Phase 3 will add fluent API on top.
 *
 * @param parentStore - The parent store containing destination state
 * @param destinationPath - Path to destination field in parent state (e.g., ['destination'])
 * @param caseType - The destination case type to scope to (e.g., 'addItem')
 * @param actionField - The parent action field that wraps destination actions (e.g., 'destination')
 * @returns A scoped store for the destination case
 *
 * @example
 * ```typescript
 * // Parent state and action
 * interface ParentState {
 *   destination: Destination | null;
 * }
 *
 * type Destination =
 *   | { type: 'addItem'; state: AddItemState }
 *   | { type: 'editItem'; state: EditItemState; id: string };
 *
 * type ParentAction =
 *   | { type: 'addButtonTapped' }
 *   | { type: 'destination'; action: PresentationAction<AddItemAction | EditItemAction> };
 *
 * // In component (Svelte 5)
 * const addItemStore = $derived(
 *   scopeToDestination<AddItemState, AddItemAction>(
 *     parentStore,
 *     ['destination'],
 *     'addItem',
 *     'destination'
 *   )
 * );
 * ```
 */
export function scopeToDestination<DestState, DestAction, ParentState = any, ParentAction = any>(
  parentStore: Store<ParentState, ParentAction>,
  destinationPath: (string | number)[],
  caseType: string,
  actionField: string
): ScopedDestinationStore<DestState, DestAction> {
  // Extract destination from parent state
  const destination = _getValueAtPath(parentStore.state, destinationPath) as DestinationState | null;

  // Check if destination matches the case type
  const state: DestState | null =
    destination && destination.type === caseType
      ? (destination.state as DestState)
      : null;

  // Create dispatch function that wraps actions
  const dispatch = (action: DestAction): void => {
    // Wrap in case type (e.g., { type: 'deleteAlert', action: childAction })
    const destinationAction = {
      type: caseType,
      action
    } as any;

    // Wrap in PresentationAction.presented
    const presentationAction: PresentationAction<any> = {
      type: 'presented' as const,
      action: destinationAction
    };

    // Wrap in parent action field
    const parentAction: ParentAction = {
      type: actionField,
      action: presentationAction
    } as any;

    parentStore.dispatch(parentAction);
  };

  // Create dismiss function
  const dismiss = (): void => {
    const presentationAction: PresentationAction<DestAction> = {
      type: 'dismiss' as const
    };

    const parentAction: ParentAction = {
      type: actionField,
      action: presentationAction
    } as any;

    parentStore.dispatch(parentAction);
  };

  return {
    state,
    dispatch,
    dismiss
  };
}

/**
 * Helper to get value at a path in an object.
 *
 * @param obj - The object to traverse
 * @param path - Array of keys/indices to traverse
 * @returns The value at the path, or null if not found
 */
function _getValueAtPath(obj: any, path: (string | number)[]): any {
  let current = obj;

  for (const key of path) {
    if (current == null) {
      return null;
    }
    current = current[key];
  }

  return current ?? null;
}

/**
 * Create a scoped store for an optional child state (simpler version without case discrimination).
 *
 * Use this when you have a single optional child (not an enum destination).
 *
 * @param parentStore - The parent store
 * @param statePath - Path to optional child state
 * @param actionField - The parent action field that wraps child actions
 * @returns A scoped store for the optional child
 *
 * @example
 * ```typescript
 * interface ParentState {
 *   addItem: AddItemState | null;
 * }
 *
 * type ParentAction =
 *   | { type: 'addButtonTapped' }
 *   | { type: 'addItem'; action: PresentationAction<AddItemAction> };
 *
 * // In component
 * const addItemStore = $derived(
 *   scopeToOptional<AddItemState, AddItemAction>(
 *     parentStore,
 *     ['addItem'],
 *     'addItem'
 *   )
 * );
 * ```
 */
export function scopeToOptional<ChildState, ChildAction, ParentState = any, ParentAction = any>(
  parentStore: Store<ParentState, ParentAction>,
  statePath: (string | number)[],
  actionField: string
): ScopedDestinationStore<ChildState, ChildAction> {
  // Extract child state from parent state
  const state = _getValueAtPath(parentStore.state, statePath) as ChildState | null;

  // Create dispatch function that wraps actions
  const dispatch = (action: ChildAction): void => {
    const presentationAction: PresentationAction<ChildAction> = {
      type: 'presented' as const,
      action
    };

    const parentAction: ParentAction = {
      type: actionField,
      action: presentationAction
    } as any;

    parentStore.dispatch(parentAction);
  };

  // Create dismiss function
  const dismiss = (): void => {
    const presentationAction: PresentationAction<ChildAction> = {
      type: 'dismiss' as const
    };

    const parentAction: ParentAction = {
      type: actionField,
      action: presentationAction
    } as any;

    parentStore.dispatch(parentAction);
  };

  return {
    state,
    dispatch,
    dismiss
  };
}
