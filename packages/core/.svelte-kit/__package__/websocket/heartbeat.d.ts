/**
 * Heartbeat (Ping/Pong) for WebSocket connections.
 *
 * This module provides health monitoring for WebSocket connections via
 * ping/pong messages. Automatically disconnects if pong not received within timeout.
 */
import type { WebSocketClient, HeartbeatConfig } from './types.js';
export interface Heartbeat {
    /**
     * Start heartbeat monitoring.
     */
    start(): void;
    /**
     * Stop heartbeat monitoring.
     */
    stop(): void;
    /**
     * Check if heartbeat is running.
     */
    readonly isRunning: boolean;
}
/**
 * Create heartbeat monitor for WebSocket connection.
 *
 * Sends ping messages at regular intervals and expects pong responses.
 * Disconnects if pong not received within timeout.
 *
 * @param client - WebSocket client
 * @param config - Heartbeat configuration
 * @returns Heartbeat controller
 *
 * @example
 * ```typescript
 * const heartbeat = createHeartbeat(client, {
 *   enabled: true,
 *   interval: 30000,
 *   timeout: 5000,
 *   pingMessage: 'PING',
 *   pongMessage: 'PONG'
 * });
 *
 * // Start on connection
 * client.subscribeToEvents((event) => {
 *   if (event.type === 'connected') {
 *     heartbeat.start();
 *   } else if (event.type === 'disconnected') {
 *     heartbeat.stop();
 *   }
 * });
 * ```
 */
export declare function createHeartbeat(client: WebSocketClient, config: HeartbeatConfig): Heartbeat;
//# sourceMappingURL=heartbeat.d.ts.map