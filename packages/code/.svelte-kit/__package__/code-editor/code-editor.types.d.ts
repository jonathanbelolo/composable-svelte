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
 * Supported programming languages
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'svelte' | 'html' | 'css' | 'json' | 'markdown' | 'bash' | 'sql' | 'python' | 'rust';
/**
 * Editor selection (text range)
 */
export interface EditorSelection {
    from: {
        line: number;
        column: number;
    };
    to: {
        line: number;
        column: number;
    };
    text: string;
}
/**
 * CodeEditor State
 *
 * ALL component state lives here (no component $state)
 */
export interface CodeEditorState {
    value: string;
    language: SupportedLanguage;
    cursorPosition: {
        line: number;
        column: number;
    } | null;
    selection: EditorSelection | null;
    theme: 'light' | 'dark' | 'auto';
    showLineNumbers: boolean;
    showGutter: boolean;
    readOnly: boolean;
    enableAutocomplete: boolean;
    enableLinting: boolean;
    enableFolding: boolean;
    tabSize: number;
    hasUnsavedChanges: boolean;
    lastSavedValue: string | null;
    isFocused: boolean;
    canUndo: boolean;
    canRedo: boolean;
    error: string | null;
    saveError: string | null;
    formatError: string | null;
}
/**
 * CodeEditor Actions
 *
 * Discriminated union of all possible actions
 */
export type CodeEditorAction = {
    type: 'valueChanged';
    value: string;
    cursorPosition?: {
        line: number;
        column: number;
    };
} | {
    type: 'languageChanged';
    language: SupportedLanguage;
} | {
    type: 'cursorMoved';
    position: {
        line: number;
        column: number;
    };
} | {
    type: 'selectionChanged';
    selection: EditorSelection | null;
} | {
    type: 'undo';
} | {
    type: 'redo';
} | {
    type: 'insertText';
    text: string;
    position?: {
        line: number;
        column: number;
    };
} | {
    type: 'deleteSelection';
} | {
    type: 'selectAll';
} | {
    type: 'themeChanged';
    theme: 'light' | 'dark' | 'auto';
} | {
    type: 'toggleLineNumbers';
} | {
    type: 'toggleAutocomplete';
} | {
    type: 'setReadOnly';
    readOnly: boolean;
} | {
    type: 'tabSizeChanged';
    size: number;
} | {
    type: 'focused';
} | {
    type: 'blurred';
} | {
    type: 'save';
} | {
    type: 'saved';
    value: string;
} | {
    type: 'saveFailed';
    error: string;
} | {
    type: 'format';
} | {
    type: 'formatted';
    value: string;
} | {
    type: 'formatFailed';
    error: string;
};
/**
 * CodeEditor Dependencies
 *
 * Injectable dependencies for side effects
 */
export interface CodeEditorDependencies {
    /**
     * Save handler - called when user saves the code
     * @param value The code to save
     */
    onSave?: (value: string) => Promise<void>;
    /**
     * Format handler - called when user formats the code
     * @param code The code to format
     * @param language The language of the code
     * @returns Formatted code
     */
    formatter?: (code: string, language: SupportedLanguage) => Promise<string>;
}
/**
 * Initial state factory
 *
 * @param config Partial configuration for initial state
 * @returns Complete initial state with defaults
 */
export declare function createInitialState(config: {
    value?: string;
    language?: SupportedLanguage;
    theme?: 'light' | 'dark' | 'auto';
    showLineNumbers?: boolean;
    readOnly?: boolean;
    enableAutocomplete?: boolean;
    tabSize?: number;
}): CodeEditorState;
//# sourceMappingURL=code-editor.types.d.ts.map