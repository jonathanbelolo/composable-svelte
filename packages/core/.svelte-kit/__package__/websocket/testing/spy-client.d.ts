/**
 * Spy WebSocket client for testing.
 *
 * This module provides a spy WebSocket client that wraps a real client
 * and records all calls. Perfect for integration testing and debugging.
 */
import type { WebSocketClient, WebSocketMessage } from '../types.js';
export interface RecordedConnection {
    readonly url: string;
    readonly protocols?: string[];
    readonly timestamp: number;
}
export interface RecordedDisconnection {
    readonly code: number;
    readonly reason: string;
    readonly timestamp: number;
}
export interface SpyWebSocketClient<T = unknown> extends WebSocketClient<T> {
    /**
     * All connection attempts.
     */
    readonly connections: RecordedConnection[];
    /**
     * All disconnections.
     */
    readonly disconnections: RecordedDisconnection[];
    /**
     * All sent messages.
     */
    readonly sentMessages: T[];
    /**
     * All received messages.
     */
    readonly receivedMessages: WebSocketMessage<T>[];
    /**
     * Count connections to a specific URL.
     */
    connectionsTo(url: string): number;
    /**
     * Reset all recorded data.
     */
    reset(): void;
}
/**
 * Create a spy WebSocket client that wraps a real client and records all calls.
 *
 * @param realClient - The real WebSocket client to wrap
 * @returns Spy WebSocket client
 *
 * @example
 * ```typescript
 * const liveClient = createLiveWebSocket();
 * const spyClient = createSpyWebSocket(liveClient);
 *
 * await spyClient.connect('wss://example.com');
 * await spyClient.send({ type: 'ping' });
 *
 * expect(spyClient.connections).toHaveLength(1);
 * expect(spyClient.sentMessages).toHaveLength(1);
 * ```
 */
export declare function createSpyWebSocket<T = unknown>(realClient: WebSocketClient<T>): SpyWebSocketClient<T>;
//# sourceMappingURL=spy-client.d.ts.map