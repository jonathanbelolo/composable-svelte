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
	// Named for what it builds, like `createInitialNodeCanvasState` below.
	//
	// This was exported as the bare `createInitialState` — a generic name in a
	// shared package namespace, and one of three conventions for one concept in
	// a 45-symbol package (`createInitialState`, `createEditorInitialState`,
	// `createInitialNodeCanvasState`). The README used a fourth,
	// `createInitialCodeHighlightState`, in its quickstart; that name did not
	// exist, so the first example a consumer pastes could not resolve. The
	// documentation was right about what the name should be.
	createInitialState as createInitialCodeHighlightState,
	type CodeHighlightState,
	type CodeHighlightAction,
	type CodeHighlightDependencies,
	type SupportedLanguage
} from './code-highlight/index.js';

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
	updateLineNumbers,
	updateFolding,
	updateAutocomplete,
	runEditorCommand,
	createInitialState as createInitialCodeEditorState,
	type CodeEditorState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type SupportedLanguage as EditorLanguage,
	type EditorSelection
} from './code-editor/index.js';

// NodeCanvas - Node-based canvas editor with SvelteFlow
export {
	NodeCanvas,
	nodeCanvasReducer,
	createConnectionValidator,
	permissiveValidator,
	strictValidator,
	createStrictValidator,
	composeValidators,
	createInitialNodeCanvasState,
	nodesToArray,
	edgesToArray,
	type NodeCanvasState,
	type NodeCanvasAction,
	type NodeCanvasDependencies,
	type NodeTypeDefinition,
	type PortDefinition,
	type ConnectionValidation,
	type ConnectionValidator
} from './node-canvas/index.js';
