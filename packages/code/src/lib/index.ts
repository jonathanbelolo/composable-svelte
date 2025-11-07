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

// NodeCanvas - Node-based canvas editor with SvelteFlow
export {
	NodeCanvas,
	nodeCanvasReducer,
	createConnectionValidator,
	permissiveValidator,
	strictValidator,
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
} from './node-canvas/index';

// StreamingChat - Transport-agnostic streaming chat for LLM interactions
export {
	// Variants (recommended)
	MinimalStreamingChat,
	StandardStreamingChat,
	FullStreamingChat,
	// Legacy
	StreamingChat,
	// Primitives
	ChatMessage,
	// Core
	streamingChatReducer,
	createInitialStreamingChatState,
	createMockStreamingChat,
	// Types
	type Message,
	type MessageAttachment,
	type AttachmentMetadata,
	type MessageReaction,
	type StreamingChatState,
	type StreamingChatAction,
	type StreamingChatDependencies,
	// Constants
	DEFAULT_REACTIONS
} from './streaming-chat/index';

// VideoEmbed - Video embedding for external platforms (YouTube, Vimeo, Twitch, etc.)
export {
	VideoEmbed,
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms,
	type VideoEmbedType,
	type VideoPlatform,
	type AspectRatio,
	type PlatformConfig,
	type EmbedOptions
} from './video-embed/index';
