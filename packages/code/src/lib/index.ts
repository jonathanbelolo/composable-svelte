/**
 * @composable-svelte/code
 *
 * Code editor and syntax highlighting components for Composable Svelte
 *
 * Built with Prism.js and CodeMirror following Composable Architecture patterns
 *
 * @packageDocumentation
 */

// CodeHighlight - Read-only syntax highlighting
export {
	CodeHighlight,
	codeHighlightReducer,
	highlightCode,
	loadLanguage,
	createInitialState,
	type CodeHighlightState,
	type CodeHighlightAction,
	type CodeHighlightDependencies,
	type SupportedLanguage
} from './code-highlight/index';

// CodeEditor - Interactive code editor with CodeMirror
export {
	CodeEditor,
	codeEditorReducer,
	createEditorView,
	loadLanguage as loadEditorLanguage,
	updateEditorValue,
	updateEditorLanguage,
	updateEditorTheme,
	updateEditorReadOnly,
	updateTabSize,
	focusEditor,
	blurEditor,
	createInitialState as createEditorInitialState,
	type CodeEditorState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type SupportedLanguage as EditorLanguage,
	type EditorSelection
} from './code-editor/index';
