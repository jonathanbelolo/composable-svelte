/**
 * TreeView Types
 *
 * State management types for tree view component (hierarchical data with expand/collapse and selection).
 *
 * @packageDocumentation
 */
/**
 * Create initial tree view state.
 */
export function createInitialTreeViewState(nodes = [], isMultiSelect = false) {
    return {
        nodes,
        expandedIds: new Set(),
        selectedIds: new Set(),
        highlightedId: null,
        loadingIds: new Set(),
        isMultiSelect
    };
}
