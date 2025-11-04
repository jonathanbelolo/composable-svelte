/**
 * Accordion Types
 *
 * State management types for accordion component (collapsible sections).
 *
 * @packageDocumentation
 */
/**
 * Create initial accordion state.
 */
export function createInitialAccordionState(items = [], initialExpandedIds = [], allowMultiple = true, collapsible = true) {
    return {
        items,
        expandedIds: initialExpandedIds,
        allowMultiple,
        collapsible
    };
}
