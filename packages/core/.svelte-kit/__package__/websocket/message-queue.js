/**
 * Message Queue for offline WebSocket support.
 *
 * This module provides message queuing for scenarios where the WebSocket
 * connection is temporarily unavailable. Messages are queued and automatically
 * sent when connection is restored.
 */
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
export function createMessageQueue(maxSize = 100) {
    const queue = [];
    return {
        enqueue(message) {
            if (queue.length >= maxSize) {
                queue.shift(); // Remove oldest
            }
            queue.push(message);
        },
        flush() {
            const messages = [...queue];
            queue.length = 0;
            return messages;
        },
        clear() {
            queue.length = 0;
        },
        get size() { return queue.length; },
        get maxSize() { return maxSize; }
    };
}
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
export function createQueuedWebSocket(client, queueSize = 100) {
    const queue = createMessageQueue(queueSize);
    let isConnected = false;
    // Monitor connection state
    client.subscribeToEvents((event) => {
        if (event.type === 'connected') {
            isConnected = true;
            // Flush queued messages
            const messages = queue.flush();
            messages.forEach(msg => {
                client.send(msg).catch(console.error);
            });
        }
        else if (event.type === 'disconnected') {
            isConnected = false;
        }
    });
    return {
        connect: client.connect.bind(client),
        disconnect: client.disconnect.bind(client),
        async send(message) {
            if (isConnected) {
                return client.send(message);
            }
            else {
                // Queue message for later
                queue.enqueue(message);
            }
        },
        subscribe: client.subscribe.bind(client),
        subscribeToEvents: client.subscribeToEvents.bind(client),
        get state() { return client.state; },
        get stats() { return client.stats; }
    };
}
