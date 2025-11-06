/**
 * CodeEditor Types
 *
 * Type definitions for the CodeEditor component
 * Following Composable Svelte architecture:
 * - ALL state in store (no component $state)
 * - Discriminated union actions
 * - Pure reducer pattern
 */
/**
 * Initial state factory
 *
 * @param config Partial configuration for initial state
 * @returns Complete initial state with defaults
 */
export function createInitialState(config) {
    return {
        // Content
        value: config.value || '',
        language: config.language || 'javascript',
        // Cursor & Selection
        cursorPosition: null,
        selection: null,
        // UI State
        theme: config.theme || 'dark',
        showLineNumbers: config.showLineNumbers !== undefined ? config.showLineNumbers : true,
        showGutter: true,
        readOnly: config.readOnly || false,
        // Features
        enableAutocomplete: config.enableAutocomplete !== undefined ? config.enableAutocomplete : true,
        enableLinting: false,
        enableFolding: true,
        tabSize: config.tabSize || 2,
        // Editor Status
        hasUnsavedChanges: false,
        lastSavedValue: null,
        // Focus State
        isFocused: false,
        // History
        canUndo: false,
        canRedo: false,
        // Error Handling
        error: null,
        saveError: null,
        formatError: null
    };
}
