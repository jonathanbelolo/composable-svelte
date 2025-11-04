/**
 * Select Types
 *
 * State management types for select component with search and multi-select.
 *
 * @packageDocumentation
 */
/**
 * Create initial select state.
 */
export function createInitialSelectState(options, initialValue = null, isMulti = false) {
    return {
        options,
        selected: initialValue,
        isOpen: false,
        highlightedIndex: -1,
        searchQuery: '',
        filteredOptions: options,
        isMulti
    };
}
