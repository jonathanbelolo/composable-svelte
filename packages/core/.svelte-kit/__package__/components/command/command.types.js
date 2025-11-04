/**
 * Command Palette Types
 *
 * Defines the state, actions, and types for a reducer-driven command palette
 * with search, keyboard navigation, and action dispatch.
 */
/**
 * Create initial command palette state.
 */
export function createInitialCommandState(config) {
    const commands = config?.commands ?? [];
    return {
        commands,
        ...(config?.groups !== undefined && { groups: config.groups }),
        query: '',
        filteredCommands: commands,
        selectedIndex: 0,
        isOpen: config?.isOpen ?? false,
        presentation: { status: 'idle' },
        caseSensitive: config?.caseSensitive ?? false,
        ...(config?.maxResults !== undefined && { maxResults: config.maxResults })
    };
}
/**
 * Default fuzzy filter function for commands.
 * Matches query against label, description, and keywords.
 */
export function defaultFilterFunction(commands, query) {
    if (!query.trim()) {
        return commands;
    }
    const lowerQuery = query.toLowerCase();
    return commands.filter((command) => {
        if (command.disabled) {
            return false;
        }
        // Search in label
        if (command.label.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        // Search in description
        if (command.description?.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        // Search in keywords
        if (command.keywords?.some((keyword) => keyword.toLowerCase().includes(lowerQuery))) {
            return true;
        }
        return false;
    });
}
/**
 * Get the currently selected command.
 */
export function getSelectedCommand(state) {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredCommands.length) {
        return null;
    }
    return state.filteredCommands[state.selectedIndex] ?? null;
}
