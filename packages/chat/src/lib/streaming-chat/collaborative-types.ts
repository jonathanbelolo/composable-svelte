/**
 * Collaborative Chat Types
 *
 * Single source of truth for all collaborative state.
 * Avoids data duplication across multiple state fields.
 */

import type { Message } from './types.js';

/**
 * User presence status.
 */
export type UserPresence = 'active' | 'idle' | 'away' | 'offline';

/**
 * Typing indicator information.
 */
export interface TypingInfo {
	/** What the user is typing in */
	target: 'message' | 'edit';
	/** Message ID if editing */
	messageId?: string;
	/** When typing started */
	startedAt: number;
	/** Last activity timestamp */
	lastUpdate: number;
}

/**
 * Live cursor position in the input field.
 */
export interface CursorPosition {
	/** Cursor offset in the text */
	position: number;
	/** Length of current selection (0 if no selection) */
	selectionLength: number;
	/** Timestamp of last movement */
	lastUpdate: number;
}

/**
 * Collaborative user (single source of truth).
 * All user-related data is embedded here.
 */
export interface CollaborativeUser {
	/** Unique user ID */
	id: string;
	/** Display name */
	name: string;
	/** Optional avatar URL */
	avatar?: string;
	/** User color for cursors/highlights */
	color: string;
	/** Current presence status */
	presence: UserPresence;
	/** Typing indicator (null if not typing) */
	typing: TypingInfo | null;
	/** Cursor position (null if not focused) */
	cursor: CursorPosition | null;
	/** Last seen timestamp */
	lastSeen: number;
}

/**
 * WebSocket connection state.
 */
export type WebSocketConnectionState =
	| { status: 'disconnected'; reason?: string }
	| { status: 'connecting'; attempt: number }
	| { status: 'connected'; connectedAt: number }
	| { status: 'reconnecting'; attempt: number; nextRetryAt: number }
	| { status: 'failed'; reason: string; canRetry: boolean };

/**
 * Collaborative streaming chat state.
 * Extends base streaming chat with collaboration features.
 */
export interface CollaborativeStreamingChatState {
	/** All collaborative users (single source of truth) */
	users: Map<string, CollaborativeUser>;

	/** Current user's ID */
	currentUserId: string | null;

	/** WebSocket connection state */
	connection: WebSocketConnectionState;


	/** Conversation/room ID */
	conversationId: string | null;

}

/**
 * Collaborative chat actions.
 */
export type CollaborativeAction =
	// Connection management
	| { type: 'connectToConversation'; conversationId: string; userId: string }
	| { type: 'connectionStateChanged'; connection: WebSocketConnectionState }
	| { type: 'disconnectFromConversation' }
	| { type: 'reconnectRequested' }
	// User management
	| { type: 'userJoined'; user: CollaborativeUser }
	| { type: 'userLeft'; userId: string }
	| { type: 'userPresenceChanged'; userId: string; presence: UserPresence }
	| { type: 'heartbeatReceived'; userId: string; timestamp: number }
	// Typing indicators
	| { type: 'userStartedTyping'; userId: string; info: TypingInfo }
	| { type: 'userStoppedTyping'; userId: string }
	| { type: 'startTyping'; target: 'message' | 'edit'; messageId?: string }
	| { type: 'stopTyping' }
	// Live cursors
	| { type: 'userCursorMoved'; userId: string; cursor: CursorPosition }
	| { type: 'userCursorCleared'; userId: string }
	| { type: 'updateCursor'; position: number; selectionLength: number }
	| { type: 'clearCursor' };

/**
 * Collaborative chat dependencies.
 */
export interface CollaborativeDependencies {
	/**
	 * Connect to WebSocket server.
	 * @returns Cleanup function
	 */
	connectWebSocket: (
		conversationId: string,
		userId: string,
		onMessage: (message: unknown) => void,
		onConnectionChange: (state: WebSocketConnectionState) => void
	) => () => void;

	/**
	 * Send message via WebSocket.
	 */
	sendWebSocketMessage: (message: unknown) => Promise<void>;

	/**
	 * Generate unique ID.
	 */
	generateId?: () => string;

	/**
	 * Get current timestamp.
	 */
	getTimestamp?: () => number;

	/**
	 * Generate user color.
	 */
	generateUserColor?: (userId: string) => string;
}

/**
 * Create initial collaborative state.
 */
export function createInitialCollaborativeState(): CollaborativeStreamingChatState {
	return {
		users: new Map(),
		currentUserId: null,
		connection: { status: 'disconnected' },
		conversationId: null,
	};
}

/**
 * Generate a random user color.
 */
export function generateRandomUserColor(userId: string): string {
	// Use user ID to seed deterministic color
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = userId.charCodeAt(i) + ((hash << 5) - hash);
	}

	// Generate pleasant, distinct colors
	const hue = Math.abs(hash % 360);
	const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
	const lightness = 50 + (Math.abs(hash >> 8) % 15); // 50-65%

	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
