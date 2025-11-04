/**
 * Channel Router for topic-based WebSocket messaging.
 *
 * This module provides channel-based message routing for WebSocket connections.
 * Messages are routed to channel-specific listeners based on a channel field.
 */
/**
 * Create a channel router for topic-based messaging.
 *
 * @param client - WebSocket client to route messages from
 * @param extractChannel - Function that extracts channel name from message data
 * @returns Channel router
 *
 * @example
 * ```typescript
 * // Message structure: { channel: 'chat', data: {...} }
 * const router = createChannelRouter(
 *   client,
 *   (msg) => msg.channel
 * );
 *
 * // Subscribe to specific channel
 * const unsubscribe = router.subscribe('chat', (message) => {
 *   console.log('Chat message:', message.data);
 * });
 *
 * // Get active channels
 * console.log(router.getChannels()); // ['chat']
 * ```
 */
export function createChannelRouter(client, extractChannel) {
    const channelListeners = new Map();
    let clientUnsubscribe = null;
    // Start listening to all messages from client
    function ensureSubscribed() {
        if (clientUnsubscribe)
            return;
        clientUnsubscribe = client.subscribe((message) => {
            // Extract channel from message
            const channel = extractChannel(message.data);
            if (!channel)
                return;
            // Route to channel-specific listeners
            const listeners = channelListeners.get(channel);
            if (!listeners)
                return;
            listeners.forEach((listener) => {
                try {
                    listener(message);
                }
                catch (error) {
                    console.error(`[ChannelRouter] Error in listener for channel "${channel}":`, error);
                }
            });
        });
    }
    function subscribe(channel, listener) {
        ensureSubscribed();
        // Get or create listener set for channel
        let listeners = channelListeners.get(channel);
        if (!listeners) {
            listeners = new Set();
            channelListeners.set(channel, listeners);
        }
        listeners.add(listener);
        // Return unsubscribe function
        return () => {
            const listeners = channelListeners.get(channel);
            if (!listeners)
                return;
            listeners.delete(listener);
            // Clean up empty channel
            if (listeners.size === 0) {
                channelListeners.delete(channel);
            }
            // Unsubscribe from client if no more channels
            if (channelListeners.size === 0 && clientUnsubscribe) {
                clientUnsubscribe();
                clientUnsubscribe = null;
            }
        };
    }
    function unsubscribe(channel) {
        channelListeners.delete(channel);
        // Unsubscribe from client if no more channels
        if (channelListeners.size === 0 && clientUnsubscribe) {
            clientUnsubscribe();
            clientUnsubscribe = null;
        }
    }
    function getChannels() {
        return Array.from(channelListeners.keys());
    }
    function getListenerCount(channel) {
        const listeners = channelListeners.get(channel);
        return listeners ? listeners.size : 0;
    }
    function clear() {
        channelListeners.clear();
        if (clientUnsubscribe) {
            clientUnsubscribe();
            clientUnsubscribe = null;
        }
    }
    return {
        subscribe,
        unsubscribe,
        getChannels,
        getListenerCount,
        clear
    };
}
/**
 * Wrap WebSocket client with channel-based routing.
 *
 * Provides a convenient wrapper that automatically routes messages to channels.
 *
 * @param client - WebSocket client to wrap
 * @param extractChannel - Function that extracts channel name from message data
 * @returns Client with channel router
 *
 * @example
 * ```typescript
 * const client = createLiveWebSocket();
 * const channelClient = createChannelWebSocket(
 *   client,
 *   (msg) => msg.channel
 * );
 *
 * // Connect
 * await channelClient.connect('wss://example.com');
 *
 * // Subscribe to specific channel
 * const unsubscribe = channelClient.router.subscribe('notifications', (message) => {
 *   console.log('Notification:', message.data);
 * });
 *
 * // Send message to channel
 * await channelClient.send({ channel: 'chat', text: 'Hello' });
 * ```
 */
export function createChannelWebSocket(client, extractChannel) {
    const router = createChannelRouter(client, extractChannel);
    return {
        connect: client.connect.bind(client),
        disconnect: client.disconnect.bind(client),
        send: client.send.bind(client),
        subscribe: client.subscribe.bind(client),
        subscribeToEvents: client.subscribeToEvents.bind(client),
        get state() { return client.state; },
        get stats() { return client.stats; },
        router
    };
}
