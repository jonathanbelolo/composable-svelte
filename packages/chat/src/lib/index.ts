/**
 * @composable-svelte/chat
 *
 * Streaming chat component for Composable Svelte
 *
 * Built for LLM interactions with transport-agnostic design following Composable Architecture patterns
 *
 * @packageDocumentation
 */

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
	DEFAULT_REACTIONS,
	// Collaborative features
	collaborativeReducer,
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
	DEFAULT_USER_PERMISSIONS,
	// Collaborative primitives
	PresenceBadge,
	PresenceAvatarStack,
	PresenceList,
	TypingIndicator,
	TypingUsersList,
	CursorMarker,
	CursorOverlay,
	// Collaborative hooks
	usePresenceTracking,
	useTypingEmitter,
	useCursorTracking,
	useHeartbeat,
	getTypingUsers,
	getActiveUsers,
	getCursorPositions,
	formatTypingIndicator,
	// WebSocket manager
	WebSocketManager,
	createWebSocketManager,
	type WebSocketConfig,
	type WebSocketMessage,
	// Cleanup utilities
	CleanupTracker,
	createCleanupTracker,
	type CleanupFunction
} from './streaming-chat/index';
