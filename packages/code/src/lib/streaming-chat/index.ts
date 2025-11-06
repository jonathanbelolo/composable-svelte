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
 *   StreamingChat,
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

export { default as StreamingChat } from './StreamingChat.svelte';
export { default as ChatMessage } from './ChatMessage.svelte';
export { streamingChatReducer } from './reducer.js';
export {
	createInitialStreamingChatState,
	createMockStreamingChat,
	type Message,
	type StreamingChatState,
	type StreamingChatAction,
	type StreamingChatDependencies
} from './types.js';
