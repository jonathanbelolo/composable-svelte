/**
 * Mock WebSocket client for testing.
 *
 * This module provides a mock WebSocket client that simulates WebSocket behavior
 * without making real network connections. Perfect for unit testing reducers.
 */
import type { WebSocketClient, WebSocketConfig, WebSocketEvent } from '../types.js';
import { WebSocketError } from '../types.js';
export interface MockWebSocketClient<T = unknown> extends WebSocketClient<T> {
    /**
     * Simulate receiving a message from the server.
     */
    simulateMessage(data: T): void;
    /**
     * Simulate a connection event.
     */
    simulateEvent(event: WebSocketEvent): void;
    /**
     * Simulate an error.
     */
    simulateError(error: WebSocketError): void;
    /**
     * Simulate unexpected disconnection.
     */
    simulateDisconnect(code: number, reason: string): void;
    /**
     * Messages sent by the client.
     */
    readonly sentMessages: T[];
    /**
     * Reset all state and history.
     */
    reset(): void;
}
/**
 * Create a mock WebSocket client for testing.
 *
 * @param config - Optional configuration
 * @returns Mock WebSocket client
 *
 * @example
 * ```typescript
 * const mockWS = createMockWebSocket();
 *
 * // Simulate connection
 * await mockWS.connect('wss://example.com');
 *
 * // Simulate incoming message
 * mockWS.simulateMessage({ type: 'chat', text: 'Hello!' });
 *
 * // Check sent messages
 * expect(mockWS.sentMessages).toHaveLength(1);
 * ```
 */
export declare function createMockWebSocket<T = unknown>(config?: Partial<WebSocketConfig>): MockWebSocketClient<T>;
//# sourceMappingURL=mock-client.d.ts.map