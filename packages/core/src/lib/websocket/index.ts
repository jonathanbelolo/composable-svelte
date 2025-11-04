/**
 * WebSocket integration for Composable Svelte.
 *
 * This module provides:
 * - WebSocket client implementation with automatic reconnection
 * - Effect system integration for declarative WebSocket operations
 * - Testing utilities (mock and spy clients)
 * - Type-safe message handling
 *
 * @example
 * ```typescript
 * import { createLiveWebSocket, Effect } from '@composable-svelte/core';
 *
 * // Create client
 * const websocket = createLiveWebSocket({
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 5
 *   }
 * });
 *
 * // Use in reducer
 * case 'connect':
 *   return [
 *     state,
 *     Effect.websocket.connect(
 *       deps.websocket,
 *       'ws-connection',
 *       'wss://example.com'
 *     )
 *   ];
 * ```
 */

// Core types
export type {
  WebSocketClient,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEvent,
  WebSocketConnectedEvent,
  WebSocketDisconnectedEvent,
  WebSocketErrorEvent,
  WebSocketReconnectingEvent,
  WebSocketReconnectedEvent,
  ConnectionState,
  ConnectionStatus,
  ConnectionStats,
  ReconnectConfig,
  HeartbeatConfig,
  MessageSerializer,
  MessageListener,
  EventListener,
  Unsubscribe
} from './types.js';

export { WebSocketError, WS_ERROR_CODES, JSONSerializer } from './types.js';

// Production client
export { createLiveWebSocket } from './live-client.js';

// Testing utilities
export type { MockWebSocketClient, SpyWebSocketClient, RecordedConnection, RecordedDisconnection } from './testing/index.js';
export { createMockWebSocket, createSpyWebSocket } from './testing/index.js';

// Advanced features
export type { Heartbeat } from './heartbeat.js';
export { createHeartbeat } from './heartbeat.js';

export type { MessageQueue } from './message-queue.js';
export { createMessageQueue, createQueuedWebSocket } from './message-queue.js';

export type { ChannelRouter, ChannelExtractor } from './channel-router.js';
export { createChannelRouter, createChannelWebSocket } from './channel-router.js';

// Effect integration (imported to register Effect.websocket namespace)
import './effect-websocket.js';
