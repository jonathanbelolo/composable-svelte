/**
 * Collaborative Chat Reducer
 *
 * Manages collaborative features with optimistic updates.
 */

import type { EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type {
	CollaborativeStreamingChatState,
	CollaborativeAction,
	CollaborativeDependencies,
	CollaborativeUser,
	PendingAction
} from './collaborative-types.js';

/**
 * Collaborative streaming chat reducer.
 *
 * Handles all collaborative features with optimistic updates and rollback.
 */
export function collaborativeReducer(
	state: CollaborativeStreamingChatState,
	action: CollaborativeAction,
	deps: CollaborativeDependencies
): [CollaborativeStreamingChatState, EffectType<CollaborativeAction>] {
	const generateId = deps.generateId || (() => crypto.randomUUID());
	const getTimestamp = deps.getTimestamp || (() => Date.now());
	const generateColor = deps.generateUserColor || ((id: string) => {
		// Simple hash-based color generation
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = id.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = Math.abs(hash % 360);
		return `hsl(${hue}, 70%, 60%)`;
	});

	switch (action.type) {
		// === Connection Management === //

		case 'connectToConversation': {
			return [
				{
					...state,
					conversationId: action.conversationId,
					currentUserId: action.userId,
					connection: { status: 'connecting', attempt: 1 }
				},
				Effect.run(async (dispatch) => {
					try {
						// Connect to WebSocket
						const cleanup = deps.connectWebSocket(
							action.conversationId,
							action.userId,
							(message) => {
								// Handle incoming WebSocket messages
								const msg = message as any;
								if (msg.type === 'user_joined') {
									dispatch({ type: 'userJoined', user: msg.user });
								} else if (msg.type === 'user_left') {
									dispatch({ type: 'userLeft', userId: msg.userId });
								} else if (msg.type === 'presence_changed') {
									dispatch({
										type: 'userPresenceChanged',
										userId: msg.userId,
										presence: msg.presence
									});
								} else if (msg.type === 'typing_started') {
									dispatch({
										type: 'userStartedTyping',
										userId: msg.userId,
										info: msg.info
									});
								} else if (msg.type === 'typing_stopped') {
									dispatch({ type: 'userStoppedTyping', userId: msg.userId });
								} else if (msg.type === 'cursor_moved') {
									dispatch({
										type: 'userCursorMoved',
										userId: msg.userId,
										cursor: msg.cursor
									});
								} else if (msg.type === 'cursor_cleared') {
									dispatch({ type: 'userCursorCleared', userId: msg.userId });
								} else if (msg.type === 'sync_update') {
									dispatch({ type: 'serverStateUpdate', update: msg.update });
								} else if (msg.type === 'action_confirmed') {
									dispatch({ type: 'actionConfirmed', tempId: msg.tempId, serverId: msg.serverId });
								} else if (msg.type === 'action_failed') {
									dispatch({ type: 'actionFailed', tempId: msg.tempId, error: msg.error });
								}
							},
							(connectionState) => {
								dispatch({ type: 'connectionStateChanged', connection: connectionState });
							}
						);

						// Store cleanup function (would need to be tracked in state)
					} catch (error) {
						dispatch({
							type: 'connectionStateChanged',
							connection: {
								status: 'failed',
								reason: error instanceof Error ? error.message : 'Connection failed',
								canRetry: true
							}
						});
					}
				})
			];
		}

		case 'connectionStateChanged': {
			return [
				{
					...state,
					connection: action.connection
				},
				Effect.none()
			];
		}

		case 'disconnectFromConversation': {
			return [
				{
					...state,
					connection: { status: 'disconnected', reason: 'User disconnected' },
					conversationId: null
				},
				Effect.run(async (dispatch) => {
					// Cleanup handled by WebSocket manager
				})
			];
		}

		case 'reconnectRequested': {
			if (!state.conversationId || !state.currentUserId) {
				return [state, Effect.none()];
			}

			return [
				state,
				Effect.run(async (dispatch) => {
					dispatch({
						type: 'connectToConversation',
						conversationId: state.conversationId!,
						userId: state.currentUserId!
					});
				})
			];
		}

		// === User Management === //

		case 'userJoined': {
			const users = new Map(state.users);
			users.set(action.user.id, action.user);

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'userLeft': {
			const users = new Map(state.users);
			users.delete(action.userId);

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'userPresenceChanged': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					presence: action.presence,
					lastSeen: getTimestamp()
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'heartbeatReceived': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					lastHeartbeat: action.timestamp,
					lastSeen: action.timestamp
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		// === Typing Indicators === //

		case 'userStartedTyping': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					typing: action.info
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'userStoppedTyping': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					typing: null
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'startTyping': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			const typingInfo = {
				target: action.target,
				messageId: action.messageId,
				startedAt: getTimestamp(),
				lastUpdate: getTimestamp()
			};

			// Update local state optimistically
			const users = new Map(state.users);
			const currentUser = users.get(state.currentUserId);

			if (currentUser) {
				users.set(state.currentUserId, {
					...currentUser,
					typing: typingInfo
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.run(async (dispatch) => {
					// Send to server
					try {
						await deps.sendWebSocketMessage({
							type: 'typing_started',
							userId: state.currentUserId,
							info: typingInfo
						});
					} catch (error) {
						console.error('[Collaborative] Failed to send typing indicator:', error);
					}
				})
			];
		}

		case 'stopTyping': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			// Update local state optimistically
			const users = new Map(state.users);
			const currentUser = users.get(state.currentUserId);

			if (currentUser) {
				users.set(state.currentUserId, {
					...currentUser,
					typing: null
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.run(async (dispatch) => {
					// Send to server
					try {
						await deps.sendWebSocketMessage({
							type: 'typing_stopped',
							userId: state.currentUserId
						});
					} catch (error) {
						console.error('[Collaborative] Failed to send typing stop:', error);
					}
				})
			];
		}

		// === Live Cursors === //

		case 'userCursorMoved': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					cursor: action.cursor
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'userCursorCleared': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					cursor: null
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		case 'updateCursor': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			const cursorPosition = {
				position: action.position,
				selectionLength: action.selectionLength,
				lastUpdate: getTimestamp()
			};

			// Update local state optimistically
			const users = new Map(state.users);
			const currentUser = users.get(state.currentUserId);

			if (currentUser) {
				users.set(state.currentUserId, {
					...currentUser,
					cursor: cursorPosition
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.run(async (dispatch) => {
					// Throttle cursor updates (send at most every 100ms)
					// This would need a more sophisticated throttling mechanism
					try {
						await deps.sendWebSocketMessage({
							type: 'cursor_moved',
							userId: state.currentUserId,
							cursor: cursorPosition
						});
					} catch (error) {
						console.error('[Collaborative] Failed to send cursor update:', error);
					}
				})
			];
		}

		case 'clearCursor': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			// Update local state optimistically
			const users = new Map(state.users);
			const currentUser = users.get(state.currentUserId);

			if (currentUser) {
				users.set(state.currentUserId, {
					...currentUser,
					cursor: null
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.run(async (dispatch) => {
					try {
						await deps.sendWebSocketMessage({
							type: 'cursor_cleared',
							userId: state.currentUserId
						});
					} catch (error) {
						console.error('[Collaborative] Failed to send cursor clear:', error);
					}
				})
			];
		}

		// === Optimistic Updates === //

		case 'actionConfirmed': {
			// Remove from pending actions
			const pendingActions = new Map(state.sync.pendingActions);
			pendingActions.delete(action.tempId);

			return [
				{
					...state,
					sync: {
						...state.sync,
						pendingActions
					}
				},
				Effect.none()
			];
		}

		case 'actionFailed': {
			// Move to failed actions
			const pendingActions = new Map(state.sync.pendingActions);
			const pendingAction = pendingActions.get(action.tempId);

			if (pendingAction) {
				pendingActions.delete(action.tempId);

				return [
					{
						...state,
						sync: {
							...state.sync,
							pendingActions,
							failedActions: [
								...state.sync.failedActions,
								{
									tempId: action.tempId,
									error: action.error,
									action: pendingAction
								}
							]
						}
					},
					Effect.none()
				];
			}

			return [state, Effect.none()];
		}

		case 'retryFailedAction': {
			const failedAction = state.sync.failedActions.find((a) => a.tempId === action.tempId);

			if (!failedAction) {
				return [state, Effect.none()];
			}

			// Remove from failed actions
			const failedActions = state.sync.failedActions.filter((a) => a.tempId !== action.tempId);

			// Add back to pending with incremented retry count
			const pendingActions = new Map(state.sync.pendingActions);
			pendingActions.set(action.tempId, {
				...failedAction.action,
				retryCount: failedAction.action.retryCount + 1
			});

			return [
				{
					...state,
					sync: {
						...state.sync,
						pendingActions,
						failedActions
					}
				},
				Effect.run(async (dispatch) => {
					// Retry the action
					try {
						await deps.sendWebSocketMessage(failedAction.action.action);
					} catch (error) {
						dispatch({
							type: 'actionFailed',
							tempId: action.tempId,
							error: error instanceof Error ? error.message : 'Retry failed'
						});
					}
				})
			];
		}

		case 'discardFailedAction': {
			const failedActions = state.sync.failedActions.filter((a) => a.tempId !== action.tempId);

			return [
				{
					...state,
					sync: {
						...state.sync,
						failedActions
					}
				},
				Effect.none()
			];
		}

		// === Sync === //

		case 'syncCompleted': {
			return [
				{
					...state,
					sync: {
						...state.sync,
						lastSequenceNumber: action.sequenceNumber,
						isSyncing: false
					}
				},
				Effect.none()
			];
		}

		case 'syncFailed': {
			return [
				{
					...state,
					sync: {
						...state.sync,
						isSyncing: false
					}
				},
				Effect.none()
			];
		}

		case 'flushOfflineQueue': {
			if (state.sync.offlineQueue.length === 0) {
				return [state, Effect.none()];
			}

			const queue = [...state.sync.offlineQueue];

			return [
				{
					...state,
					sync: {
						...state.sync,
						offlineQueue: [],
						isSyncing: true
					}
				},
				Effect.run(async (dispatch) => {
					// Send queued actions
					for (const item of queue) {
						try {
							await deps.sendWebSocketMessage(item.action);
						} catch (error) {
							console.error('[Collaborative] Failed to flush queue item:', error);
						}
					}

					dispatch({ type: 'syncCompleted', sequenceNumber: state.sync.lastSequenceNumber + queue.length });
				})
			];
		}

		case 'serverStateUpdate': {
			// Apply Yjs update
			// Y.applyUpdate(state.ydoc, action.update);

			return [state, Effect.none()];
		}

		case 'serverMessageReceived': {
			return [
				{
					...state,
					sync: {
						...state.sync,
						lastSequenceNumber: Math.max(state.sync.lastSequenceNumber, action.sequenceNumber)
					}
				},
				Effect.none()
			];
		}

		case 'userPermissionsChanged': {
			const users = new Map(state.users);
			const user = users.get(action.userId);

			if (user) {
				users.set(action.userId, {
					...user,
					permissions: action.permissions
				});
			}

			return [
				{
					...state,
					users
				},
				Effect.none()
			];
		}

		default: {
			const _never: never = action;
			return [state, Effect.none()];
		}
	}
}
