/**
 * Message Queue for offline WebSocket support.
 *
 * This module provides message queuing for scenarios where the WebSocket
 * connection is temporarily unavailable. Messages are queued and automatically
 * sent when connection is restored.
 */
import type { WebSocketClient } from './types.js';
export interface MessageQueue<T = unknown> {
    /**
     * Add message to queue.
     */
    enqueue(message: T): void;
    /**
     * Get all queued messages and clear queue.
     */
    flush(): T[];
    /**
     * Clear all queued messages.
     */
    clear(): void;
    /**
     * Current queue size.
     */
    readonly size: number;
    /**
     * Maximum queue size.
     */
    readonly maxSize: number;
}
/**
 * Create message queue for offline scenarios.
 *
 * @param maxSize - Maximum queue size (default: 100)
 * @returns Message queue
 *
 * @example
 * ```typescript
 * const queue = createMessageQueue(100);
 *
 * // Queue message when offline
 * queue.enqueue({ type: 'chat', text: 'Hello' });
 *
 * // Flush when connected
 * const messages = queue.flush();
 * messages.forEach(msg => client.send(msg));
 * ```
 */
export declare function createMessageQueue<T = unknown>(maxSize?: number): MessageQueue<T>;
/**
 * Wrap WebSocket client with automatic message queuing.
 *
 * Messages sent while disconnected are queued and sent when reconnected.
 *
 * @param client - WebSocket client to wrap
 * @param queueSize - Maximum queue size (default: 100)
 * @returns Wrapped client with queuing
 *
 * @example
 * ```typescript
 * const baseClient = createLiveWebSocket();
 * const queuedClient = createQueuedWebSocket(baseClient, 100);
 *
 * // Send works even when disconnected (queues message)
 * await queuedClient.send({ type: 'chat', text: 'Hello' });
 *
 * // On reconnection, queued messages are automatically sent
 * ```
 */
export declare function createQueuedWebSocket<T = unknown>(client: WebSocketClient<T>, queueSize?: number): WebSocketClient<T>;
//# sourceMappingURL=message-queue.d.ts.map