/**
 * Message Queue for offline WebSocket support.
 *
 * This module provides message queuing for scenarios where the WebSocket
 * connection is temporarily unavailable. Messages are queued and automatically
 * sent when connection is restored.
 */

import type { ConnectionStats, WebSocketClient } from './types.js';

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
export function createMessageQueue<T = unknown>(maxSize = 100): MessageQueue<T> {
  const queue: T[] = [];

  return {
    enqueue(message: T): void {
      if (queue.length >= maxSize) {
        queue.shift(); // Remove oldest
      }
      queue.push(message);
    },

    flush(): T[] {
      const messages = [...queue];
      queue.length = 0;
      return messages;
    },

    clear(): void {
      queue.length = 0;
    },

    get size() { return queue.length; },
    get maxSize() { return maxSize; }
  };
}

/**
 * Wrap WebSocket client with automatic message queuing.
 *
 * `send` reads the client's status at the moment of the call: connected, the
 * message goes straight through; otherwise it is queued and flushed on the
 * next `connected` event, whether that is the first connection or one the
 * reconnect ladder brought back. `disconnect()` clears the queue — messages
 * held for one connection are not delivered to whatever URL comes next.
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
export function createQueuedWebSocket<T = unknown>(
  client: WebSocketClient<T>,
  queueSize = 100
): WebSocketClient<T> {
  const queue = createMessageQueue<T>(queueSize);

  // Flush when a connection opens — the first, or one the ladder brought back.
  client.subscribeToEvents((event) => {
    if (event.type === 'connected') {
      for (const message of queue.flush()) {
        client.send(message).catch(console.error);
      }
    }
  });

  return {
    connect: client.connect.bind(client),
    async disconnect(code?: number, reason?: string): Promise<void> {
      // Held for this connection, not for the next URL.
      queue.clear();
      return client.disconnect(code, reason);
    },
    reconnect: client.reconnect.bind(client),
    async send(message: T): Promise<void> {
      // The client's own status, not a boolean kept from events: that boolean
      // started false for a wrapper created around a connected client, and
      // flipped only when the close was reported, so a send right after
      // disconnect() rejected (AUDIT-2026-09-03-FINDINGS W5).
      if (client.state.status === 'connected') {
        return client.send(message);
      }
      queue.enqueue(message);
    },
    subscribe: client.subscribe.bind(client),
    subscribeToEvents: client.subscribeToEvents.bind(client),
    get state() { return client.state; },
    get stats(): ConnectionStats {
      // Seven fields belong to the wrapped client; the eighth is ours. The
      // explicit return type is load-bearing — it makes a future
      // `ConnectionStats` field a compile error here rather than a silently
      // stale spread.
      return { ...client.stats, messagesQueued: queue.size };
    }
  };
}
