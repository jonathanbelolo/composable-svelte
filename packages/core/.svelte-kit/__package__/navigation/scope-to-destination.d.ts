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
export declare function scopeToDestination<DestState, DestAction, ParentState = any, ParentAction = any>(parentStore: Store<ParentState, ParentAction>, destinationPath: (string | number)[], caseType: string, actionField: string): ScopedDestinationStore<DestState, DestAction>;
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
export declare function scopeToOptional<ChildState, ChildAction, ParentState = any, ParentAction = any>(parentStore: Store<ParentState, ParentAction>, statePath: (string | number)[], actionField: string): ScopedDestinationStore<ChildState, ChildAction>;
//# sourceMappingURL=scope-to-destination.d.ts.map