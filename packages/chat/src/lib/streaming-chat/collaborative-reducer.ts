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
	CollaborativeUser
} from './collaborative-types.js';

/**
 * Collaborative streaming chat reducer.
 *
 * Handles all collaborative features with optimistic updates and rollback.
 */
/**
 * Identifies the WebSocket subscription so it can be cancelled.
 *
 * One id for the whole reducer: a store holds at most one collaborative
 * connection, and re-registering the same id cancels the previous cleanup
 * before installing the new one — which is what makes `reconnectRequested`
 * close-then-open without needing to know it is doing so.
 */
const CONNECTION_SUBSCRIPTION = 'collaborative-websocket';

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
				// A subscription, not `Effect.run`. `connectWebSocket` hands back a
				// cleanup function; it used to be assigned to a `const` inside an async
				// closure and dropped on the floor, under a comment saying it "would
				// need to be tracked in state". Nothing ever called it, so the socket
				// outlived disconnect, outlived reconnect, and outlived the store.
				//
				// The store owns it now: `Effect.cancel` runs it, `destroy()` runs it,
				// and re-registering the same id cancels the previous one first — which
				// is why `reconnectRequested` needs no change of its own.
				//
				// Setup is synchronous and must return a cleanup on every path,
				// including the failure path.
				Effect.subscription(CONNECTION_SUBSCRIPTION, (dispatch) => {
					try {
						return deps.connectWebSocket(
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
									// Deliberately unhandled, and now deliberately loud. This used
									// to dispatch `serverStateUpdate`, whose only meaningful line
									// (`Y.applyUpdate`) was commented out — so a server sending
									// real CRDT payloads had them silently discarded. There is no
									// CRDT layer to apply them to; saying so beats pretending.
									console.warn(
										'[Collaborative] Received a sync_update, but CRDT sync is not implemented. Ignoring.'
									);
								}
							},
							(connectionState) => {
								dispatch({ type: 'connectionStateChanged', connection: connectionState });
							}
						);

					} catch (error) {
						dispatch({
							type: 'connectionStateChanged',
							connection: {
								status: 'failed',
								reason: error instanceof Error ? error.message : 'Connection failed',
								canRetry: true
							}
						});
						// Nothing was opened, so there is nothing to close — but a
						// subscription must always hand back a cleanup.
						return () => {};
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
				// This was an `Effect.run` with an empty body, under a comment claiming
				// "Cleanup handled by WebSocket manager". There was no manager on this
				// path and no reference held to anything, so the action only relabelled
				// the state: it reported `disconnected` over a socket that was still
				// open and still delivering messages.
				Effect.cancel(CONNECTION_SUBSCRIPTION)
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
				...(action.messageId !== undefined && { messageId: action.messageId }),
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

		// === Sync === //

		default: {
			const _never: never = action;
			return [state, Effect.none()];
		}
	}
}
