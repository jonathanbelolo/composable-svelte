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
	CollaborativeUser,
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
 * Takes no user id: the store already knows who you are, from
 * `connectToConversation`. Passing one alongside was a parameter a consumer
 * could get wrong and that changed nothing.
 *
 * @param store - Collaborative store
 * @returns Cleanup function
 */
export function usePresenceTracking(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>
): () => void {
	const cleanup = new CleanupTracker();

	let lastActivity = Date.now();
	let currentPresence: UserPresence = 'active';

	// Activity detection
	const handleActivity = () => {
		lastActivity = Date.now();

		if (currentPresence !== 'active') {
			currentPresence = 'active';
			store.dispatch({ type: 'updatePresence', presence: 'active' });
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
			store.dispatch({ type: 'updatePresence', presence: newPresence });
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
			cleanup.clearTimeout(stopTypingTimer);
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
				cleanup.clearTimeout(stopTypingTimer);
				stopTypingTimer = null;
			}
		}
	};

	const update = () => {
		if (isTyping) {
			// Reset auto-stop timer
			if (stopTypingTimer) {
				cleanup.clearTimeout(stopTypingTimer);
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
 * Takes no user id, for the same reason as `usePresenceTracking`.
 *
 * @param store - Collaborative store
 * @param intervalMs - Heartbeat interval in milliseconds
 * @returns Cleanup function
 */
export function useHeartbeat(
	store: Store<CollaborativeStreamingChatState, CollaborativeAction>,
	intervalMs = 30000
): () => void {
	const cleanup = new CleanupTracker();

	// One dispatch, not two. `sendHeartbeat` already stamps `lastSeen`, and the
	// second dispatch — a presence change to `active` — used to overwrite the very
	// timestamp the first had just written. It also claimed the user was active
	// on a timer, which is what `usePresenceTracking` is for and what it watches
	// real input to decide.
	cleanup.setInterval(() => {
		store.dispatch({ type: 'sendHeartbeat' });
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
	users: Map<string, CollaborativeUser>,
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
	users: Map<string, CollaborativeUser>,
	currentUserId: string | null
): Array<{
	id: string;
	name: string;
	color: string;
	presence: UserPresence;
	avatar?: string;
	lastSeen: number;
}> {
	const activeUsers: Array<{
		id: string;
		name: string;
		color: string;
		presence: UserPresence;
		avatar?: string;
		lastSeen: number;
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
				// Carried through because `PresenceList` renders a "last seen" label
				// from it, and this selector is the documented way to feed that
				// component — dropping the field here made the label unreachable
				// through the only path anyone follows.
				lastSeen: user.lastSeen,
				// Spread rather than `avatar: user.avatar`: under
				// `exactOptionalPropertyTypes` the declared `avatar?: string` means
				// "absent or a string", and writing the key as `undefined` is
				// neither. The `Map<string, any>` this used to take hid that.
				...(user.avatar === undefined ? {} : { avatar: user.avatar })
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
	users: Map<string, CollaborativeUser>,
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
 * Shows individual names for 1-2 users, "X people are typing" for more.
 *
 * No trailing ellipsis: `TypingIndicator` renders animated dots beside this, and
 * the two together read as "Alice is typing...•••". The component used to carry
 * its own copy of this logic — same phrasing, different punctuation — and this
 * one had no caller at all.
 *
 * @param typingUsers - Array of typing users
 * @returns Formatted typing indicator text
 */
export function formatTypingIndicator(typingUsers: Array<{ name: string }>): string {
	if (typingUsers.length === 0) {
		return '';
	}

	if (typingUsers.length === 1) {
		return `${typingUsers[0]!.name} is typing`;
	}

	if (typingUsers.length === 2) {
		return `${typingUsers[0]!.name} and ${typingUsers[1]!.name} are typing`;
	}

	return `${typingUsers.length} people are typing`;
}
