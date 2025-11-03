/**
 * Channel Router for topic-based WebSocket messaging.
 *
 * This module provides channel-based message routing for WebSocket connections.
 * Messages are routed to channel-specific listeners based on a channel field.
 */

import type { WebSocketClient, WebSocketMessage, MessageListener, Unsubscribe } from './types.js';

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
export function createChannelRouter<T = unknown>(
  client: WebSocketClient<T>,
  extractChannel: ChannelExtractor<T>
): ChannelRouter<T> {
  const channelListeners = new Map<string, Set<MessageListener<T>>>();
  let clientUnsubscribe: Unsubscribe | null = null;

  // Start listening to all messages from client
  function ensureSubscribed(): void {
    if (clientUnsubscribe) return;

    clientUnsubscribe = client.subscribe((message) => {
      // Extract channel from message
      const channel = extractChannel(message.data);
      if (!channel) return;

      // Route to channel-specific listeners
      const listeners = channelListeners.get(channel);
      if (!listeners) return;

      listeners.forEach((listener) => {
        try {
          listener(message);
        } catch (error) {
          console.error(`[ChannelRouter] Error in listener for channel "${channel}":`, error);
        }
      });
    });
  }

  function subscribe(channel: string, listener: MessageListener<T>): Unsubscribe {
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
      if (!listeners) return;

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

  function unsubscribe(channel: string): void {
    channelListeners.delete(channel);

    // Unsubscribe from client if no more channels
    if (channelListeners.size === 0 && clientUnsubscribe) {
      clientUnsubscribe();
      clientUnsubscribe = null;
    }
  }

  function getChannels(): string[] {
    return Array.from(channelListeners.keys());
  }

  function getListenerCount(channel: string): number {
    const listeners = channelListeners.get(channel);
    return listeners ? listeners.size : 0;
  }

  function clear(): void {
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
export function createChannelWebSocket<T = unknown>(
  client: WebSocketClient<T>,
  extractChannel: ChannelExtractor<T>
): WebSocketClient<T> & { router: ChannelRouter<T> } {
  const router = createChannelRouter(client, extractChannel);

  return {
    ...client,
    router
  };
}
