/**
 * Channel Router for topic-based WebSocket messaging.
 *
 * This module provides channel-based message routing for WebSocket connections.
 * Messages are routed to channel-specific listeners based on a channel field.
 */
import type { WebSocketClient, MessageListener, Unsubscribe } from './types.js';
export interface ChannelRouter<T = unknown> {
    /**
     * Subscribe to messages on a specific channel.
     */
    subscribe(channel: string, listener: MessageListener<T>): Unsubscribe;
    /**
     * Unsubscribe from all listeners on a channel.
     */
    unsubscribe(channel: string): void;
    /**
     * Get all active channels.
     */
    getChannels(): string[];
    /**
     * Get listener count for a channel.
     */
    getListenerCount(channel: string): number;
    /**
     * Clear all channel subscriptions.
     */
    clear(): void;
}
/**
 * Function that extracts channel name from message data.
 */
export type ChannelExtractor<T> = (data: T) => string | null;
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
export declare function createChannelRouter<T = unknown>(client: WebSocketClient<T>, extractChannel: ChannelExtractor<T>): ChannelRouter<T>;
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
export declare function createChannelWebSocket<T = unknown>(client: WebSocketClient<T>, extractChannel: ChannelExtractor<T>): WebSocketClient<T> & {
    router: ChannelRouter<T>;
};
//# sourceMappingURL=channel-router.d.ts.map