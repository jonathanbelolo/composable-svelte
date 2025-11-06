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
export type SupportedLanguage =
	| 'typescript'
	| 'javascript'
	| 'svelte'
	| 'html'
	| 'css'
	| 'json'
	| 'markdown'
	| 'bash'
	| 'sql'
	| 'python'
	| 'rust';

/**
 * Editor selection (text range)
 */
export interface EditorSelection {
	from: { line: number; column: number };
	to: { line: number; column: number };
	text: string;
}

/**
 * CodeEditor State
 *
 * ALL component state lives here (no component $state)
 */
export interface CodeEditorState {
	// Content
	value: string; // Current editor content
	language: SupportedLanguage; // Language mode

	// Cursor & Selection
	cursorPosition: { line: number; column: number } | null;
	selection: EditorSelection | null;

	// UI State
	theme: 'light' | 'dark' | 'auto';
	showLineNumbers: boolean;
	showGutter: boolean;
	readOnly: boolean;

	// Features
	enableAutocomplete: boolean;
	enableLinting: boolean;
	enableFolding: boolean;
	tabSize: number;

	// Editor Status
	hasUnsavedChanges: boolean;
	lastSavedValue: string | null;

	// Focus State
	isFocused: boolean;

	// History (undo/redo)
	canUndo: boolean;
	canRedo: boolean;

	// Error Handling
	error: string | null; // General error
	saveError: string | null; // Save operation error
	formatError: string | null; // Format operation error
}

/**
 * CodeEditor Actions
 *
 * Discriminated union of all possible actions
 */
export type CodeEditorAction =
	// Content changes
	| { type: 'valueChanged'; value: string; cursorPosition?: { line: number; column: number } }
	| { type: 'languageChanged'; language: SupportedLanguage }

	// Cursor & Selection
	| { type: 'cursorMoved'; position: { line: number; column: number } }
	| { type: 'selectionChanged'; selection: EditorSelection | null }

	// Editing actions
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'insertText'; text: string; position?: { line: number; column: number } }
	| { type: 'deleteSelection' }
	| { type: 'selectAll' }

	// Configuration
	| { type: 'themeChanged'; theme: 'light' | 'dark' | 'auto' }
	| { type: 'toggleLineNumbers' }
	| { type: 'toggleAutocomplete' }
	| { type: 'setReadOnly'; readOnly: boolean }
	| { type: 'tabSizeChanged'; size: number }

	// Focus
	| { type: 'focused' }
	| { type: 'blurred' }

	// Save
	| { type: 'save' }
	| { type: 'saved'; value: string }
	| { type: 'saveFailed'; error: string }

	// Format
	| { type: 'format' }
	| { type: 'formatted'; value: string }
	| { type: 'formatFailed'; error: string };

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
export function createInitialState(config: {
	value?: string;
	language?: SupportedLanguage;
	theme?: 'light' | 'dark' | 'auto';
	showLineNumbers?: boolean;
	readOnly?: boolean;
	enableAutocomplete?: boolean;
	tabSize?: number;
}): CodeEditorState {
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
