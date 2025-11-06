/**
 * CodeEditor Module
 *
 * Interactive code editor component built with CodeMirror 6
 * Following Composable Svelte architecture patterns
 */

export { default as CodeEditor } from './CodeEditor.svelte';
export { codeEditorReducer } from './code-editor.reducer';
export {
	createInitialState,
	type CodeEditorState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type SupportedLanguage,
	type EditorSelection
} from './code-editor.types';
export {
	createEditorView,
	loadLanguage,
	updateEditorValue,
	updateEditorLanguage,
	updateEditorTheme,
	updateEditorReadOnly,
	updateTabSize,
	focusEditor,
	blurEditor
} from './codemirror-wrapper';
