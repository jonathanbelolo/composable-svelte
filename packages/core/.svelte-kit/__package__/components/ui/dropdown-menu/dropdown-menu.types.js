/**
 * Dropdown Menu Types
 *
 * State management types for dropdown menu with keyboard navigation.
 *
 * @packageDocumentation
 */
/**
 * Create initial dropdown menu state.
 */
export function createInitialDropdownMenuState(items) {
    return {
        isOpen: false,
        presentation: { status: 'idle' },
        highlightedIndex: -1,
        items
    };
}
