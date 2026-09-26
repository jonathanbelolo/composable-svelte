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
	/**
	 * Counts the value writes `codeEditorReducer` accepted: each accepted
	 * `valueChanged` and applied `formatted` adds one. Missing starts at zero.
	 *
	 * It lets the reducer tell an edit made from the current document from one
	 * made before a newer write, even when that write restored the same text.
	 */
	valueRevision?: number | undefined;
	language: SupportedLanguage; // Language mode

	// Cursor & Selection
	cursorPosition: { line: number; column: number } | null;
	selection: EditorSelection | null;

	// UI State
	theme: 'light' | 'dark' | 'auto';
	showLineNumbers: boolean;
	readOnly: boolean;

	// Features
	enableAutocomplete: boolean;
	enableFolding: boolean;
	tabSize: number;

	// Editor Status
	/** Current value differs from the last successful write. Leaving guards also consider isSaving. */
	hasUnsavedChanges: boolean;
	lastSavedValue: string | null;
	/** Transient active write; do not restore as active without its effect. Missing means idle. */
	isSaving?: boolean | undefined;
	/** Monotonic local attempt identifier; missing starts at zero. */
	saveAttempt?: number | undefined;
	/** Transient latest explicitly requested snapshot, not unsubmitted edits. */
	queuedSaveValue?: string | null | undefined;
	/** Monotonic format request identifier; a result from an earlier request is stale. Missing starts at zero. */
	formatAttempt?: number | undefined;

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
	| {
			type: 'valueChanged';
			value: string;
			cursorPosition?: { line: number; column: number };
			/**
			 * The document this report was edited from. The editor sets it; code
			 * writing a value from outside leaves it out.
			 *
			 * If `state.value` is no longer this, a newer write was reduced first and
			 * the report is stale, so the reducer ignores it. Without that, an edit's
			 * echo queued behind an external write would overwrite the write.
			 */
			baseValue?: string;
			/**
			 * The `valueRevision` this report expects state to be at. `CodeEditor`
			 * sets it; if state has moved to another revision, a newer write was
			 * reduced first and the report is stale, even when that write restored
			 * the same text. Leave it out when writing a value from outside.
			 */
			baseRevision?: number;
	  }
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
	| { type: 'toggleFolding' }
	/** Reported by the editor when the undo/redo availability changes. */
	| { type: 'historyChanged'; canUndo: boolean; canRedo: boolean }
	/** Focus/blur the editor. Commands: performed by the view, no state change. */
	| { type: 'focus' }
	| { type: 'blur' }
	/** Reported when a language's dynamic import fails (e.g. a stale chunk). */
	| { type: 'languageLoadFailed'; language: SupportedLanguage; error: string }
	| { type: 'setReadOnly'; readOnly: boolean }
	| { type: 'tabSizeChanged'; size: number }

	// Focus
	| { type: 'focused' }
	| { type: 'blurred' }

	// Save
	| { type: 'save' }
	// Built-in effects always supply attemptId. Untagged legacy results are only
	// accepted when no correlated built-in save is in progress.
	| { type: 'saved'; value: string; attemptId?: number }
	| { type: 'saveFailed'; error: string; attemptId?: number }

	// Format
	| { type: 'format' }
	// Built-in effects always supply attemptId and input. A result is applied
	// only if it answers the latest request and the value is still its input.
	// Untagged results are applied unconditionally, as before.
	| { type: 'formatted'; value: string; attemptId?: number; input?: string }
	| { type: 'formatFailed'; error: string; attemptId?: number };

/**
 * CodeEditor Dependencies
 *
 * Injectable dependencies for side effects
 */
export interface CodeEditorDependencies {
	/**
	 * Save handler - called when user saves the code
	 * @param value The code to save
	 * @param signal Aborted on store destruction; cooperative cancellation, not rollback.
	 */
	onSave?: (value: string, signal?: AbortSignal) => Promise<void>;

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
	enableFolding?: boolean;
	readOnly?: boolean;
	enableAutocomplete?: boolean;
	tabSize?: number;
} = {}): CodeEditorState {
	return {
		// Content
		value: config.value || '',
		valueRevision: 0,
		language: config.language || 'javascript',

		// Cursor & Selection
		cursorPosition: null,
		selection: null,

		// UI State
		theme: config.theme || 'dark',
		showLineNumbers: config.showLineNumbers !== undefined ? config.showLineNumbers : true,
		readOnly: config.readOnly || false,

		// Features
		enableAutocomplete: config.enableAutocomplete !== undefined ? config.enableAutocomplete : true,
		enableFolding: config.enableFolding ?? true,
		tabSize: config.tabSize || 2,

		// Editor Status
		hasUnsavedChanges: false,
		lastSavedValue: null,
		isSaving: false,
		saveAttempt: 0,
		queuedSaveValue: null,
		formatAttempt: 0,

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
