/**
 * Streaming Chat Component
 *
 * Transport-agnostic streaming chat interface for LLM interactions.
 * Users provide their own streaming implementation (SSE, WebSocket, etc.).
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import {
 *   MinimalStreamingChat,
 *   StandardStreamingChat,
 *   FullStreamingChat,
 *   streamingChatReducer,
 *   createInitialStreamingChatState,
 *   createMockStreamingChat
 * } from '@composable-svelte/code';
 *
 * const store = createStore({
 *   initialState: createInitialStreamingChatState(),
 *   reducer: streamingChatReducer,
 *   dependencies: createMockStreamingChat()
 * });
 * ```
 */

// Variants (recommended)
export {
	MinimalStreamingChat,
	StandardStreamingChat,
	FullStreamingChat
} from './variants/index.js';

// Primitives (for custom compositions)
export {
	ChatMessage,
	ActionButtons,
	ChatMessageWithActions
} from './primitives/index.js';

// Legacy export (use FullStreamingChat instead)
export { default as StreamingChat } from './StreamingChat.svelte';

// Core functionality
export { streamingChatReducer } from './reducer.js';
export {
	createInitialStreamingChatState,
	createMockStreamingChat,
	type Message,
	type MessageAttachment,
	type AttachmentMetadata,
	type StreamingChatState,
	type StreamingChatAction,
	type StreamingChatDependencies
} from './types.js';

// Utilities
export {
	detectFileType,
	extractFileMetadata,
	formatFileSize,
	validateFileSize,
	validateFileType,
	createFileDataURL,
	createFileBlobURL,
	revokeFileBlobURL,
	getFileExtension,
	getFileTypeIcon
} from './utils.js';
