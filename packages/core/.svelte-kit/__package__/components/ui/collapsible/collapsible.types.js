/**
 * Collapsible Types
 *
 * State management types for collapsible component (single expandable section).
 *
 * @packageDocumentation
 */
/**
 * Create initial collapsible state.
 */
export function createInitialCollapsibleState(isExpanded = false, disabled = false) {
    return {
        isExpanded,
        disabled
    };
}
