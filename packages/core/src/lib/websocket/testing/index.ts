/**
 * WebSocket testing utilities.
 *
 * This module provides mock and spy clients for testing WebSocket functionality
 * without making real network connections.
 */

export type { MockWebSocketClient } from './mock-client.js';
export { createMockWebSocket } from './mock-client.js';

export type {
  SpyWebSocketClient,
  RecordedConnection,
  RecordedDisconnection
} from './spy-client.js';
export { createSpyWebSocket } from './spy-client.js';
