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
export function scopeToDestination(parentStore, destinationPath, caseType, actionField) {
    // Extract destination from parent state
    const destination = _getValueAtPath(parentStore.state, destinationPath);
    // Check if destination matches the case type
    const state = destination && destination.type === caseType
        ? destination.state
        : null;
    // Create dispatch function that wraps actions
    const dispatch = (action) => {
        // Wrap in case type (e.g., { type: 'deleteAlert', action: childAction })
        const destinationAction = {
            type: caseType,
            action
        };
        // Wrap in PresentationAction.presented
        const presentationAction = {
            type: 'presented',
            action: destinationAction
        };
        // Wrap in parent action field
        const parentAction = {
            type: actionField,
            action: presentationAction
        };
        parentStore.dispatch(parentAction);
    };
    // Create dismiss function
    const dismiss = () => {
        const presentationAction = {
            type: 'dismiss'
        };
        const parentAction = {
            type: actionField,
            action: presentationAction
        };
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
function _getValueAtPath(obj, path) {
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
export function scopeToOptional(parentStore, statePath, actionField) {
    // Extract child state from parent state
    const state = _getValueAtPath(parentStore.state, statePath);
    // Create dispatch function that wraps actions
    const dispatch = (action) => {
        const presentationAction = {
            type: 'presented',
            action
        };
        const parentAction = {
            type: actionField,
            action: presentationAction
        };
        parentStore.dispatch(parentAction);
    };
    // Create dismiss function
    const dismiss = () => {
        const presentationAction = {
            type: 'dismiss'
        };
        const parentAction = {
            type: actionField,
            action: presentationAction
        };
        parentStore.dispatch(parentAction);
    };
    return {
        state,
        dispatch,
        dismiss
    };
}
