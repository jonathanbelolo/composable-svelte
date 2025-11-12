/**
 * Collaborative Hooks
 *
 * Composable hooks for building collaborative features.
 * These are headless utilities that can be mixed and matched.
 */

import type { Store } from '@composable-svelte/core';
import type {
	CollaborativeStreamingChatState,
	CollaborativeAction,
	UserPresence
} from './collaborative-types.js';
import { CleanupTracker } from './cleanup-tracker.js';

/**
 * Track user presence based on activity.
 *
 * Automatically sets presence to:
 * - 'active' when user interacts
 * - 'idle' after 2 minutes of inactivity
 * - 'away' after 5 minutes of inactivity
 *
 * @param store - Collaborative store
 * @param userId - Current user ID
 * @returns Cleanup function
 */
export function usePresenceTracking(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>,
	userId: string
): () => void {
	const cleanup = new CleanupTracker();

	let lastActivity = Date.now();
	let currentPresence: UserPresence = 'active';

	// Activity detection
	const handleActivity = () => {
		lastActivity = Date.now();

		if (currentPresence !== 'active') {
			currentPresence = 'active';
			store.dispatch({ type: 'userPresenceChanged', userId, presence: 'active' });
		}
	};

	// Listen for user activity
	cleanup.addEventListener(window, 'mousemove', handleActivity);
	cleanup.addEventListener(window, 'keydown', handleActivity);
	cleanup.addEventListener(window, 'click', handleActivity);
	cleanup.addEventListener(window, 'scroll', handleActivity);

	// Check presence every 30 seconds
	cleanup.setInterval(() => {
		const elapsed = Date.now() - lastActivity;

		let newPresence: UserPresence = currentPresence;

		if (elapsed > 5 * 60 * 1000) {
			// 5 minutes = away
			newPresence = 'away';
		} else if (elapsed > 2 * 60 * 1000) {
			// 2 minutes = idle
			newPresence = 'idle';
		}

		if (newPresence !== currentPresence) {
			currentPresence = newPresence;
			store.dispatch({ type: 'userPresenceChanged', userId, presence: newPresence });
		}
	}, 30000); // Check every 30 seconds

	return () => cleanup.dispose();
}

/**
 * Emit typing indicators with throttling.
 *
 * Automatically stops typing indicator after 3 seconds of inactivity.
 *
 * @param store - Collaborative store
 * @param target - What the user is typing in
 * @param messageId - Message ID if editing
 * @returns Object with start/stop/update functions and cleanup
 */
export function useTypingEmitter(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>,
	target: 'message' | 'edit',
	messageId?: string
): {
	start: () => void;
	stop: () => void;
	update: () => void;
	cleanup: () => void;
} {
	const cleanup = new CleanupTracker();

	let isTyping = false;
	let lastTypingUpdate = 0;
	let stopTypingTimer: ReturnType<typeof setTimeout> | null = null;

	const THROTTLE_DELAY = 300; // Don't emit more than once per 300ms
	const AUTO_STOP_DELAY = 3000; // Auto-stop after 3 seconds

	const start = () => {
		const now = Date.now();

		// Throttle typing start
		if (!isTyping && now - lastTypingUpdate > THROTTLE_DELAY) {
			isTyping = true;
			lastTypingUpdate = now;
			store.dispatch({
				type: 'startTyping',
				target,
				...(messageId !== undefined && { messageId })
			});
		}

		// Reset auto-stop timer
		if (stopTypingTimer) {
			clearTimeout(stopTypingTimer);
		}

		stopTypingTimer = cleanup.setTimeout(() => {
			stop();
		}, AUTO_STOP_DELAY);
	};

	const stop = () => {
		if (isTyping) {
			isTyping = false;
			store.dispatch({ type: 'stopTyping' });

			if (stopTypingTimer) {
				clearTimeout(stopTypingTimer);
				stopTypingTimer = null;
			}
		}
	};

	const update = () => {
		if (isTyping) {
			// Reset auto-stop timer
			if (stopTypingTimer) {
				clearTimeout(stopTypingTimer);
			}

			stopTypingTimer = cleanup.setTimeout(() => {
				stop();
			}, AUTO_STOP_DELAY);
		}
	};

	return {
		start,
		stop,
		update,
		cleanup: () => {
			stop();
			cleanup.dispose();
		}
	};
}

/**
 * Track cursor position and emit updates.
 *
 * Throttles cursor updates to avoid overwhelming the server.
 *
 * @param store - Collaborative store
 * @param element - Input element to track
 * @param throttleMs - Throttle delay in milliseconds
 * @returns Cleanup function
 */
export function useCursorTracking(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>,
	element: HTMLInputElement | HTMLTextAreaElement,
	throttleMs = 100
): () => void {
	const cleanup = new CleanupTracker();

	let lastUpdate = 0;
	let pendingUpdate: number | null = null;

	const emitCursor = () => {
		const position = element.selectionStart ?? 0;
		const selectionLength = (element.selectionEnd ?? 0) - position;

		store.dispatch({
			type: 'updateCursor',
			position,
			selectionLength
		});

		lastUpdate = Date.now();
	};

	const handleCursorChange = () => {
		const now = Date.now();

		if (now - lastUpdate > throttleMs) {
			// Emit immediately
			emitCursor();
		} else {
			// Queue update
			if (!pendingUpdate) {
				pendingUpdate = cleanup.setTimeout(() => {
					emitCursor();
					pendingUpdate = null;
				}, throttleMs);
			}
		}
	};

	// Track cursor changes
	cleanup.addEventListener(element, 'selectionchange', handleCursorChange);
	cleanup.addEventListener(element, 'click', handleCursorChange);
	cleanup.addEventListener(element, 'keyup', handleCursorChange);

	// Clear cursor on blur
	cleanup.addEventListener(element, 'blur', () => {
		store.dispatch({ type: 'clearCursor' });
	});

	// Emit initial cursor position on focus
	cleanup.addEventListener(element, 'focus', handleCursorChange);

	return () => cleanup.dispose();
}

/**
 * Send periodic heartbeat to prevent timeout.
 *
 * @param store - Collaborative store
 * @param userId - Current user ID
 * @param intervalMs - Heartbeat interval in milliseconds
 * @returns Cleanup function
 */
export function useHeartbeat(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>,
	userId: string,
	intervalMs = 30000
): () => void {
	const cleanup = new CleanupTracker();

	// Send heartbeat periodically
	cleanup.setInterval(() => {
		const timestamp = Date.now();
		store.dispatch({ type: 'heartbeatReceived', userId, timestamp });

		// Also update last seen
		store.dispatch({ type: 'userPresenceChanged', userId, presence: 'active' });
	}, intervalMs);

	return () => cleanup.dispose();
}

/**
 * Get typing users for display.
 *
 * @param users - Map of collaborative users
 * @param currentUserId - Current user ID (exclude from typing list)
 * @param target - Filter by typing target
 * @returns Array of typing users
 */
export function getTypingUsers(
	users: Map<string, any>,
	currentUserId: string | null,
	target?: 'message' | 'edit'
): Array<{ id: string; name: string; color: string }> {
	const typingUsers: Array<{ id: string; name: string; color: string }> = [];

	for (const [userId, user] of users.entries()) {
		// Skip current user
		if (userId === currentUserId) continue;

		// Check if user is typing
		if (user.typing) {
			// Filter by target if specified
			if (!target || user.typing.target === target) {
				typingUsers.push({
					id: userId,
					name: user.name,
					color: user.color
				});
			}
		}
	}

	return typingUsers;
}

/**
 * Get active users for presence display.
 *
 * @param users - Map of collaborative users
 * @param currentUserId - Current user ID (exclude from list)
 * @returns Array of active users
 */
export function getActiveUsers(
	users: Map<string, any>,
	currentUserId: string | null
): Array<{ id: string; name: string; color: string; presence: UserPresence; avatar?: string }> {
	const activeUsers: Array<{
		id: string;
		name: string;
		color: string;
		presence: UserPresence;
		avatar?: string;
	}> = [];

	for (const [userId, user] of users.entries()) {
		// Skip current user
		if (userId === currentUserId) continue;

		// Only include active, idle, or away users (not offline)
		if (user.presence !== 'offline') {
			activeUsers.push({
				id: userId,
				name: user.name,
				color: user.color,
				presence: user.presence,
				avatar: user.avatar
			});
		}
	}

	return activeUsers;
}

/**
 * Get cursor positions for display.
 *
 * @param users - Map of collaborative users
 * @param currentUserId - Current user ID (exclude from list)
 * @returns Array of cursor positions with user info
 */
export function getCursorPositions(
	users: Map<string, any>,
	currentUserId: string | null
): Array<{
	userId: string;
	name: string;
	color: string;
	position: number;
	selectionLength: number;
}> {
	const cursors: Array<{
		userId: string;
		name: string;
		color: string;
		position: number;
		selectionLength: number;
	}> = [];

	for (const [userId, user] of users.entries()) {
		// Skip current user
		if (userId === currentUserId) continue;

		// Check if user has cursor
		if (user.cursor) {
			cursors.push({
				userId,
				name: user.name,
				color: user.color,
				position: user.cursor.position,
				selectionLength: user.cursor.selectionLength
			});
		}
	}

	return cursors;
}

/**
 * Smart typing indicator aggregation.
 *
 * Shows individual names for 1-2 users, "X people typing" for more.
 *
 * @param typingUsers - Array of typing users
 * @returns Formatted typing indicator text
 */
export function formatTypingIndicator(
	typingUsers: Array<{ id: string; name: string; color: string }>
): string {
	if (typingUsers.length === 0) {
		return '';
	}

	if (typingUsers.length === 1) {
		return `${typingUsers[0]!.name} is typing...`;
	}

	if (typingUsers.length === 2) {
		return `${typingUsers[0]!.name} and ${typingUsers[1]!.name} are typing...`;
	}

	return `${typingUsers.length} people are typing...`;
}
