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

/**
 * Broadcast a frame, swallowing transport failures.
 *
 * The same shape the typing cases already use, extracted because presence and
 * heartbeats need it too — and had it not.
 */
function broadcast(
	state: CollaborativeStreamingChatState,
	deps: CollaborativeDependencies,
	message: Record<string, unknown>,
	what: string
): EffectType<CollaborativeAction> {
	// Nothing goes out over a socket that is not open. `useHeartbeat` runs on a
	// 30-second interval and `disconnectFromConversation` leaves `currentUserId`
	// set — deliberately, since the selectors need it to exclude you — so without
	// this a disconnected tab drips send failures into the console forever.
	if (state.connection.status !== 'connected') {
		return Effect.none();
	}

	return Effect.run(async () => {
		try {
			await deps.sendWebSocketMessage(message);
		} catch (error) {
			console.error(`[Collaborative] Failed to send ${what}:`, error);
		}
	});
}

export function collaborativeReducer(
	state: CollaborativeStreamingChatState,
	action: CollaborativeAction,
	deps: CollaborativeDependencies
): [CollaborativeStreamingChatState, EffectType<CollaborativeAction>] {
	// `generateId` and `generateUserColor` used to be resolved here too, and
	// referenced nowhere else in the file. Nothing in this reducer mints an id or
	// a colour — `userJoined` is handed a complete `CollaborativeUser`, colour
	// included — so both were dependencies a consumer could supply that changed
	// nothing. `generateRandomUserColor` is still exported for building that user.
	const getTimestamp = deps.getTimestamp || (() => Date.now());

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

			// Arrived from the wire. Never broadcast: a server that fans out to the
			// whole room sends my own frame back to me, and it carries my own id —
			// so the `userId === currentUserId` test this used to rely on could not
			// tell an echo from something I had just done, and two clients would
			// ping-pong without bound. `updatePresence` is the outbound half.
			return [{ ...state, users }, Effect.none()];
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

			// Inbound only, for the same reason. `sendHeartbeat` is the outbound
			// half.
			return [{ ...state, users }, Effect.none()];
		}

		case 'updatePresence': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			const users = new Map(state.users);
			const me = users.get(state.currentUserId);

			if (me) {
				users.set(state.currentUserId, {
					...me,
					presence: action.presence,
					lastSeen: getTimestamp()
				});
			}

			// `usePresenceTracking` dispatches this, and until this pass the result
			// never left the browser: a hook documented as tracking online/away
			// status that nobody else could see.
			return [
				{ ...state, users },
				broadcast(
					state,
					deps,
					{ type: 'presence_changed', userId: state.currentUserId, presence: action.presence },
					'presence'
				)
			];
		}

		case 'sendHeartbeat': {
			if (!state.currentUserId) {
				return [state, Effect.none()];
			}

			const timestamp = getTimestamp();
			const users = new Map(state.users);
			const me = users.get(state.currentUserId);

			if (me) {
				users.set(state.currentUserId, { ...me, lastSeen: timestamp });
			}

			// `useHeartbeat` is documented as a keep-alive, and no frame ever left
			// the browser. A server that times out idle connections dropped every
			// client that was merely quiet.
			return [
				{ ...state, users },
				broadcast(state, deps, { type: 'heartbeat', userId: state.currentUserId, timestamp }, 'heartbeat')
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
