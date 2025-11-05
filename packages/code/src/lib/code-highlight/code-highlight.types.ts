/**
 * CodeHighlight component types
 *
 * Read-only syntax highlighting component using Prism.js
 */

/**
 * Supported programming languages for syntax highlighting
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
 * State for the CodeHighlight component
 *
 * ALL application state lives here - no component $state
 */
export interface CodeHighlightState {
	/** Source code to highlight */
	code: string;

	/** Language for syntax highlighting */
	language: SupportedLanguage;

	/** Theme mode */
	theme: 'light' | 'dark' | 'auto';

	/** Display line numbers */
	showLineNumbers: boolean;

	/** HTML output from Prism */
	highlightedCode: string | null;

	/** Copy button state */
	copyStatus: 'idle' | 'copying' | 'copied' | 'failed';

	/** Line number offset */
	startLine: number;

	/** Lines to highlight */
	highlightLines: number[];

	/** Highlighting operation in progress */
	isHighlighting: boolean;

	/** Highlighting error */
	error: string | null;
}

/**
 * Actions for the CodeHighlight component
 *
 * Discriminated union for type-safe action handling
 */
export type CodeHighlightAction =
	| { type: 'init' }
	| { type: 'codeChanged'; code: string }
	| { type: 'languageChanged'; language: SupportedLanguage }
	| { type: 'themeChanged'; theme: 'light' | 'dark' | 'auto' }
	| { type: 'copyCode' }
	| { type: 'copyCompleted' }
	| { type: 'copyFailed'; error: string }
	| { type: 'resetCopyStatus' }
	| { type: 'toggleLineNumbers' }
	| { type: 'highlightLinesChanged'; lines: number[] }
	| { type: 'highlighted'; html: string }
	| { type: 'highlightFailed'; error: string };

/**
 * Dependencies for the CodeHighlight reducer
 *
 * All external functionality injected as dependencies for testability
 */
export interface CodeHighlightDependencies {
	/**
	 * Highlight code using Prism.js
	 *
	 * @param code - Source code to highlight
	 * @param language - Programming language
	 * @returns HTML string with syntax highlighting
	 */
	highlightCode: (code: string, language: SupportedLanguage) => Promise<string>;
}

/**
 * Initial state factory for CodeHighlight
 */
export function createInitialState(config: Partial<CodeHighlightState> = {}): CodeHighlightState {
	return {
		code: config.code ?? '',
		language: config.language ?? 'typescript',
		theme: config.theme ?? 'dark',
		showLineNumbers: config.showLineNumbers ?? true,
		highlightedCode: config.highlightedCode ?? null,
		copyStatus: config.copyStatus ?? 'idle',
		startLine: config.startLine ?? 1,
		highlightLines: config.highlightLines ?? [],
		isHighlighting: config.isHighlighting ?? false,
		error: config.error ?? null
	};
}
