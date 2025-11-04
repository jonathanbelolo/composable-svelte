/**
 * Combobox Types
 *
 * State management types for combobox component (autocomplete/searchable select with async loading).
 *
 * @packageDocumentation
 */
/**
 * Create initial combobox state.
 */
export function createInitialComboboxState(options = [], initialValue = null, debounceDelay = 300) {
    return {
        options,
        filteredOptions: options,
        selected: initialValue,
        dropdown: { status: 'idle' },
        highlightedIndex: -1,
        searchQuery: '',
        isLoading: false,
        debounceDelay
    };
}
