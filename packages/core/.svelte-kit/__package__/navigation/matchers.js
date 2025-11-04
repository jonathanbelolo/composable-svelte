/**
 * Presentation action matchers for parent observation of child actions.
 *
 * These helpers allow parent reducers to observe and react to specific child actions
 * without directly handling child reducer logic.
 *
 * Two main helpers:
 * 1. matchPresentationAction() - Extract child action if path matches
 * 2. isActionAtPath() - Boolean check with predicate
 *
 * @packageDocumentation
 */
/**
 * Match a presentation action against a case path.
 *
 * This function helps parents observe child actions without directly handling child logic.
 * It unwraps PresentationAction and extracts the child action if the path matches.
 *
 * @param action - The parent action to match against
 * @param path - The case path to match (e.g., "destination.saveButtonTapped")
 * @returns The child action if path matches, otherwise null
 *
 * @example
 * ```typescript
 * // Parent reducer observing child save action
 * const reducer: Reducer<ParentState, ParentAction, ParentDeps> = (state, action, deps) => {
 *   // Check if child dispatched saveButtonTapped
 *   const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');
 *   if (saveAction) {
 *     // Child wants to save → add item to parent list and dismiss
 *     return [
 *       {
 *         ...state,
 *         items: [...state.items, state.destination!.state.item],
 *         destination: null
 *       },
 *       Effect.none()
 *     ];
 *   }
 *
 *   // Otherwise, delegate to child via ifLet
 *   return ifLet(...)(state, action, deps);
 * };
 * ```
 */
export function matchPresentationAction(action, path) {
    if (!action || typeof action !== 'object') {
        return null;
    }
    const parts = path.split('.');
    let current = action;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // Check if current level has 'type' field
        if (!('type' in current)) {
            return null;
        }
        // Last part in path → check action type
        if (i === parts.length - 1) {
            return current.type === part ? current : null;
        }
        // Intermediate part → must match type and have nested structure
        if (current.type !== part) {
            return null;
        }
        // Navigate to next level
        // Check for PresentationAction wrapper
        if ('action' in current && current.action && typeof current.action === 'object') {
            const presentationAction = current.action;
            // Must be 'presented' type
            if (presentationAction.type !== 'presented') {
                return null;
            }
            // Navigate into presented action
            if ('action' in presentationAction) {
                current = presentationAction.action;
            }
            else {
                return null;
            }
        }
        else {
            return null;
        }
    }
    return null;
}
/**
 * Check if action is at a specific path and matches a predicate.
 *
 * This is a boolean variant of matchPresentationAction() that also
 * applies a predicate to the matched action.
 *
 * @param action - The parent action to check
 * @param path - The case path to match
 * @param predicate - Optional predicate to test the matched action
 * @returns True if action matches path and predicate
 *
 * @example
 * ```typescript
 * // Check if child wants to save a specific item
 * if (isActionAtPath(action, 'destination.saveButtonTapped', (a) => a.item.id === targetId)) {
 *   // Handle specific item save
 * }
 *
 * // Simple path check without predicate
 * if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
 *   return [{ ...state, destination: null }, Effect.none()];
 * }
 * ```
 */
export function isActionAtPath(action, path, predicate) {
    const matched = matchPresentationAction(action, path);
    if (matched === null) {
        return false;
    }
    if (predicate) {
        return predicate(matched);
    }
    return true;
}
/**
 * Match multiple paths and execute handlers.
 *
 * This is a convenience helper for matching against multiple paths
 * and executing different handlers for each match.
 *
 * @param action - The parent action to match
 * @param handlers - Map of paths to handler functions
 * @returns The result of the matched handler, or null if no match
 *
 * @example
 * ```typescript
 * const result = matchPaths(action, {
 *   'destination.saveButtonTapped': (saveAction) => {
 *     // Handle save
 *     return [newState, Effect.none()];
 *   },
 *   'destination.cancelButtonTapped': (cancelAction) => {
 *     // Handle cancel
 *     return [{ ...state, destination: null }, Effect.none()];
 *   }
 * });
 *
 * if (result) {
 *   return result;
 * }
 *
 * // No match → continue with default handling
 * return ifLet(...)(state, action, deps);
 * ```
 */
export function matchPaths(action, handlers) {
    for (const [path, handler] of Object.entries(handlers)) {
        const matched = matchPresentationAction(action, path);
        if (matched !== null) {
            return handler(matched);
        }
    }
    return null;
}
/**
 * Extract child state from destination state if action matches path.
 *
 * This combines path matching with state extraction for convenience.
 *
 * @param action - The parent action to match
 * @param state - The parent state containing destination
 * @param path - The case path to match
 * @param getDestination - Function to extract destination from parent state
 * @returns The destination state if action matches, otherwise null
 *
 * @example
 * ```typescript
 * // Extract destination state when child saves
 * const destState = extractDestinationOnAction(
 *   action,
 *   state,
 *   'destination.saveButtonTapped',
 *   (s) => s.destination
 * );
 *
 * if (destState && destState.type === 'addItem') {
 *   const item = destState.state.item;
 *   // Add item to parent list
 * }
 * ```
 */
export function extractDestinationOnAction(action, state, path, getDestination) {
    const matched = matchPresentationAction(action, path);
    if (matched === null) {
        return null;
    }
    return getDestination(state);
}
