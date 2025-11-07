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
	type MessageReaction,
	type StreamingChatState,
	type StreamingChatAction,
	type StreamingChatDependencies,
	DEFAULT_REACTIONS
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

// Collaborative features
export { collaborativeReducer } from './collaborative-reducer.js';
export {
	createInitialCollaborativeState,
	generateRandomUserColor,
	type CollaborativeUser,
	type UserPresence,
	type TypingInfo,
	type CursorPosition,
	type UserPermissions,
	type CollaborativeStreamingChatState,
	type CollaborativeAction,
	type CollaborativeDependencies,
	type WebSocketConnectionState,
	type PendingAction,
	type SyncState,
	DEFAULT_USER_PERMISSIONS
} from './collaborative-types.js';

// Collaborative primitives
export {
	PresenceBadge,
	PresenceAvatarStack,
	PresenceList,
	TypingIndicator,
	TypingUsersList,
	CursorMarker,
	CursorOverlay
} from './collaborative-primitives/index.js';

// Collaborative hooks
export {
	usePresenceTracking,
	useTypingEmitter,
	useCursorTracking,
	useHeartbeat,
	getTypingUsers,
	getActiveUsers,
	getCursorPositions,
	formatTypingIndicator
} from './collaborative-hooks.js';

// WebSocket manager
export {
	WebSocketManager,
	createWebSocketManager,
	type WebSocketConfig,
	type WebSocketMessage
} from './websocket-manager.js';

// Cleanup utilities
export { CleanupTracker, createCleanupTracker, type CleanupFunction } from './cleanup-tracker.js';
