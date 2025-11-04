/**
 * Production WebSocket client implementation.
 *
 * This module provides a production-ready WebSocket client with:
 * - Automatic reconnection with exponential backoff
 * - Connection timeout handling
 * - Message serialization/deserialization
 * - Statistics tracking
 * - Error recovery
 */
import type { WebSocketClient, WebSocketConfig } from './types.js';
/**
 * Create a production WebSocket client.
 *
 * **Platform**: Browser only (uses native WebSocket API)
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection timeout handling
 * - Message serialization/deserialization
 * - Statistics tracking
 * - Error recovery
 *
 * @param config - WebSocket configuration
 * @returns WebSocket client instance
 *
 * @example
 * ```typescript
 * const client = createLiveWebSocket({
 *   url: 'wss://example.com',
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     maxDelay: 30000,
 *     backoffMultiplier: 2,
 *     jitter: true
 *   }
 * });
 *
 * await client.connect('wss://example.com');
 * ```
 */
export declare function createLiveWebSocket<T = unknown>(config?: Partial<WebSocketConfig>): WebSocketClient<T>;
//# sourceMappingURL=live-client.d.ts.map