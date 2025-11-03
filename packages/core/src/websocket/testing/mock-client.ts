/**
 * Mock WebSocket client for testing.
 *
 * This module provides a mock WebSocket client that simulates WebSocket behavior
 * without making real network connections. Perfect for unit testing reducers.
 */

import type {
  WebSocketClient,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEvent,
  WebSocketConnectedEvent,
  WebSocketDisconnectedEvent,
  WebSocketErrorEvent,
  ConnectionState,
  ConnectionStats,
  MessageListener,
  EventListener,
  Unsubscribe
} from '../types.js';
import { WebSocketError, WS_ERROR_CODES } from '../types.js';

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
export function createMockWebSocket<T = unknown>(
  config?: Partial<WebSocketConfig>
): MockWebSocketClient<T> {
  let state: ConnectionState = {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  };

  const messageListeners = new Set<MessageListener<T>>();
  const eventListeners = new Set<EventListener>();
  const sentMessages: T[] = [];

  const stats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    reconnects: 0,
    errors: 0
  };

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    // Prevent connecting when already connected
    if (state.status === 'connected') {
      throw new WebSocketError(
        'Already connected',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    state = {
      ...state,
      status: 'connecting',
      url,
      protocols
    };

    // Simulate async connection - use queueMicrotask for fake timer compatibility
    await new Promise<void>(resolve => {
      setTimeout(() => {
        state = {
          ...state,
          status: 'connected',
          connectedAt: new Date()
        };

        const event: WebSocketConnectedEvent = {
          type: 'connected',
          url,
          protocols,
          timestamp: Date.now()
        };

        eventListeners.forEach(listener => {
          try {
            listener(event);
          } catch (error) {
            console.error('[MockWebSocket] Error in listener:', error);
          }
        });

        resolve();
      }, config?.connectionTimeout || 10);
    });
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    const wasConnected = state.status === 'connected';

    state = {
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      lastError: null,
      connectedAt: null
    };

    if (wasConnected) {
      const event: WebSocketDisconnectedEvent = {
        type: 'disconnected',
        code,
        reason,
        wasClean: true,
        timestamp: Date.now()
      };

      eventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[MockWebSocket] Error in listener:', error);
        }
      });
    }
  }

  async function send(message: T): Promise<void> {
    if (state.status !== 'connected') {
      throw new WebSocketError(
        'Not connected',
        WS_ERROR_CODES.SEND_FAILED,
        true
      );
    }

    sentMessages.push(message);
    stats.messagesSent++;

    // Calculate bytes sent
    const serialized = JSON.stringify(message);
    stats.bytesSent += serialized.length;
  }

  function subscribe(listener: MessageListener<T>): Unsubscribe {
    messageListeners.add(listener);
    return () => {
      messageListeners.delete(listener);
    };
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  }

  function simulateMessage(data: T): void {
    const message: WebSocketMessage<T> = {
      data,
      timestamp: Date.now(),
      raw: JSON.stringify(data)
    };

    stats.messagesReceived++;
    stats.bytesReceived += message.raw.length;

    messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('[MockWebSocket] Error in listener:', error);
      }
    });
  }

  function simulateEvent(event: WebSocketEvent): void {
    eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[MockWebSocket] Error in listener:', error);
      }
    });
  }

  function simulateError(error: WebSocketError): void {
    state = { ...state, lastError: error };
    stats.errors++;

    const event: WebSocketErrorEvent = {
      type: 'error',
      error,
      timestamp: Date.now()
    };
    simulateEvent(event);
  }

  function simulateDisconnect(code: number, reason: string): void {
    state = {
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      lastError: null,
      connectedAt: null
    };

    const event: WebSocketDisconnectedEvent = {
      type: 'disconnected',
      code,
      reason,
      wasClean: false,
      timestamp: Date.now()
    };

    simulateEvent(event);
  }

  function reset(): void {
    state = {
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      lastError: null,
      connectedAt: null
    };
    messageListeners.clear();
    eventListeners.clear();
    sentMessages.length = 0;

    // Reset stats
    stats.messagesSent = 0;
    stats.messagesReceived = 0;
    stats.bytesSent = 0;
    stats.bytesReceived = 0;
    stats.reconnects = 0;
    stats.errors = 0;
  }

  return {
    connect,
    disconnect,
    send,
    subscribe,
    subscribeToEvents,
    get state() { return state; },
    get stats(): ConnectionStats {
      return {
        ...stats,
        uptime: state.connectedAt ? Date.now() - state.connectedAt.getTime() : 0
      };
    },
    simulateMessage,
    simulateEvent,
    simulateError,
    simulateDisconnect,
    get sentMessages() { return sentMessages; },
    reset
  };
}
