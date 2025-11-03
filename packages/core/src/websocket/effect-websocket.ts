/**
 * Effect.websocket() helper functions.
 *
 * This module provides declarative effect helpers for WebSocket operations:
 * - connect(): Connect to WebSocket with event subscription
 * - disconnect(): Disconnect from WebSocket
 * - send(): Send a message through WebSocket
 * - subscribe(): Subscribe to incoming messages
 * - subscribeToEvents(): Subscribe to connection events
 */

import type { Effect as EffectType } from '../types.js';
import { Effect } from '../effect.js';
import type {
  WebSocketClient,
  WebSocketEvent,
  WebSocketMessage,
  WebSocketError,
  Unsubscribe
} from './types.js';
import { WS_ERROR_CODES } from './types.js';

/**
 * Connect to a WebSocket server with automatic event subscription.
 *
 * **Cleanup**: Automatically disconnects when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param url - WebSocket URL
 * @param protocols - Optional WebSocket protocols
 * @param onEvent - Optional callback to transform events into actions
 *
 * @example
 * ```typescript
 * case 'connect':
 *   return [
 *     { ...state, connection: { ...state.connection, status: 'connecting' } },
 *     Effect.websocket.connect(
 *       deps.websocket,
 *       'websocket-connection',
 *       'wss://chat.example.com',
 *       undefined,
 *       (event) => ({ type: 'websocketEvent', event })
 *     )
 *   ];
 * ```
 */
export function connect<Action>(
  client: WebSocketClient,
  subscriptionId: string,
  url: string,
  protocols?: string[],
  onEvent?: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    let unsubscribe: Unsubscribe | undefined;

    // Subscribe to events if callback provided
    if (onEvent) {
      unsubscribe = client.subscribeToEvents((event) => {
        dispatch(onEvent(event));
      });
    }

    // Connect
    client.connect(url, protocols).catch((error) => {
      console.error('[WebSocket] Connection failed:', error);
    });

    // Return cleanup function
    return async () => {
      unsubscribe?.();
      await client.disconnect();
    };
  });
}

/**
 * Disconnect from a WebSocket server.
 *
 * @param client - WebSocket client instance
 * @param code - Optional close code
 * @param reason - Optional close reason
 *
 * @example
 * ```typescript
 * case 'disconnect':
 *   return [
 *     state,
 *     Effect.websocket.disconnect(deps.websocket)
 *   ];
 * ```
 */
export function disconnect<Action>(
  client: WebSocketClient,
  code?: number,
  reason?: string
): EffectType<Action> {
  return Effect.run(async () => {
    await client.disconnect(code, reason);
  });
}

/**
 * Send a message through WebSocket.
 *
 * @param client - WebSocket client instance
 * @param message - Message to send
 * @param onSuccess - Optional success callback
 * @param onFailure - Optional failure callback
 *
 * @example
 * ```typescript
 * case 'sendMessage':
 *   return [
 *     state,
 *     Effect.websocket.send(
 *       deps.websocket,
 *       { type: 'chat', text: state.draft },
 *       () => ({ type: 'messageSent' }),
 *       (error) => ({ type: 'messageFailed', error })
 *     )
 *   ];
 * ```
 */
export function send<T, Action>(
  client: WebSocketClient<T>,
  message: T,
  onSuccess?: () => Action,
  onFailure?: (error: WebSocketError) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    try {
      await client.send(message);
      if (onSuccess) {
        dispatch(onSuccess());
      }
    } catch (error) {
      if (onFailure) {
        const wsError = error instanceof WebSocketError
          ? error
          : new WebSocketError(
              String(error),
              WS_ERROR_CODES.SEND_FAILED,
              true,
              error
            );
        dispatch(onFailure(wsError));
      } else {
        // Re-throw if no failure handler
        throw error;
      }
    }
  });
}

/**
 * Subscribe to messages from WebSocket.
 *
 * **Cleanup**: Automatically unsubscribes when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param onMessage - Callback to transform messages into actions
 *
 * @example
 * ```typescript
 * case 'subscribeToMessages':
 *   return [
 *     state,
 *     Effect.websocket.subscribe(
 *       deps.websocket,
 *       'websocket-messages',
 *       (message) => ({ type: 'messageReceived', message: message.data })
 *     )
 *   ];
 * ```
 */
export function subscribe<T, Action>(
  client: WebSocketClient<T>,
  subscriptionId: string,
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    const unsubscribe = client.subscribe((message) => {
      dispatch(onMessage(message));
    });

    return unsubscribe;
  });
}

/**
 * Subscribe to connection events from WebSocket.
 *
 * **Cleanup**: Automatically unsubscribes when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param onEvent - Callback to transform events into actions
 *
 * @example
 * ```typescript
 * case 'subscribeToEvents':
 *   return [
 *     state,
 *     Effect.websocket.subscribeToEvents(
 *       deps.websocket,
 *       'websocket-events',
 *       (event) => ({ type: 'websocketEvent', event })
 *     )
 *   ];
 * ```
 */
export function subscribeToEvents<Action>(
  client: WebSocketClient,
  subscriptionId: string,
  onEvent: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    const unsubscribe = client.subscribeToEvents((event) => {
      dispatch(onEvent(event));
    });

    return unsubscribe;
  });
}

// ============================================================================
// Module Augmentation
// ============================================================================

// Extend Effect namespace with websocket helpers
declare module '../effect.js' {
  interface EffectNamespace {
    websocket: {
      connect: typeof connect;
      disconnect: typeof disconnect;
      send: typeof send;
      subscribe: typeof subscribe;
      subscribeToEvents: typeof subscribeToEvents;
    };
  }
}

// Add websocket helpers to Effect namespace
(Effect as any).websocket = {
  connect,
  disconnect,
  send,
  subscribe,
  subscribeToEvents
};
