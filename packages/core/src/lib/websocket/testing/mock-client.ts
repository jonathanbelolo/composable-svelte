/**
 * Mock WebSocket client for testing.
 *
 * This module provides a mock WebSocket client that simulates WebSocket behavior
 * without making real network connections. Useful for reducer tests.
 *
 * Handshakes use a fixed 10ms delay and honor shorter connection timeouts.
 * reconnect() simulates one requested attempt, not the live retry/backoff ladder.
 * Configuration options for the retry ladder (maxAttempts, initialDelay, maxDelay,
 * backoffMultiplier, jitter, shouldReconnect) and serializer are ignored by the mock;
 * only connectionTimeout and reconnect.enabled: false are observed.
 * simulateDisconnect() is an explicit terminal reset and does not start retries;
 * qualify server close-code policy and retry timing with the scripted live client.
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
import { WebSocketError, WS_ERROR_CODES, isValidCloseCode } from '../types.js';

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
 * @param config - Optional configuration (only connectionTimeout and reconnect.enabled are honored; ladder settings are ignored)
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
  config?: WebSocketConfig
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
    errors: 0,
    // The mock does not queue; only `createQueuedWebSocket` reports otherwise.
    messagesQueued: 0
  };

  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let rejectHandshake: ((error: WebSocketError) => void) | null = null;
  let generation = 0;

  function retirePending(): number {
    generation++;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = null;
    const reject = rejectHandshake;
    rejectHandshake = null;
    reject?.(new WebSocketError('Disconnected before the connection opened', WS_ERROR_CODES.CONNECTION_FAILED, false));
    return generation;
  }

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    // Prevent connecting when already connected
    if (state.status === 'connected' || state.status === 'connecting') {
      throw new WebSocketError(
        'Already connected or connecting',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    const run = retirePending();

    state = {
      ...state,
      status: 'connecting',
      url,
      protocols
    };

    const latency = 10;
    const timeout = config?.connectionTimeout;

    // If configured timeout ceiling is lower than simulated latency, simulate connection timeout
    if (timeout !== undefined && timeout < latency) {
      return new Promise<void>((_, reject) => {
        rejectHandshake = reject;
        pendingTimer = setTimeout(() => {
          if (run !== generation) return;
          pendingTimer = null;
          rejectHandshake = null;
          const error = new WebSocketError(
            `Connection timeout after ${timeout}ms`,
            WS_ERROR_CODES.CONNECTION_TIMEOUT,
            true
          );
          state = {
            ...state,
            status: 'failed',
            lastError: error
          };
          stats.errors++;
          simulateEvent({ type: 'error', error, timestamp: Date.now() });
          reject(error);
        }, timeout);
      });
    }

    // Deterministic handshake latency, independent of the configured timeout ceiling.
    await new Promise<void>((resolve, reject) => {
      rejectHandshake = reject;
      pendingTimer = setTimeout(() => {
        if (run !== generation) return;
        pendingTimer = null;
        rejectHandshake = null;
        state = {
          ...state,
          status: 'connected',
          connectedAt: new Date(),
          lastError: null,
          reconnectAttempts: 0
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
      }, latency);
    });
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    if (!isValidCloseCode(code)) {
      throw new TypeError(`disconnect(): close code ${code} is not allowed from script — use 1000 or 3000–4999`);
    }
    retirePending();
    // As the live client: a live connection (connected or connecting) reports
    // its loss; one already 'reconnecting' has.
    const wasConnected = state.status === 'connected' || state.status === 'connecting';

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

  /**
   * What the live client does on `reconnect()`, in the same order: a
   * `disconnected` with the reason (not clean), `reconnecting`, and after
   * the mock's connection delay `connected` and `reconnected`.
   */
  function reconnect(reason = 'Reconnect requested', cause?: WebSocketError): void {
    const url = state.url;
    if (!url) return;
    const run = retirePending();
    if (cause) {
      stats.errors++;
      state = { ...state, lastError: cause };
      simulateEvent({ type: 'error', error: cause, timestamp: Date.now() });
    }
    if (run !== generation) return;
    if (config?.reconnect?.enabled === false) {
      void disconnect(1000, reason);
      return;
    }
    const { protocols } = state;
    // The ladder restarts at its first rung, as the live client's does.
    const attempt = 1;
    const wasLive = state.status === 'connected' || state.status === 'connecting';
    state = { ...state, status: 'reconnecting', reconnectAttempts: attempt, connectedAt: null };
    if (wasLive) {
      simulateEvent({ type: 'disconnected', code: 1000, reason, wasClean: false, timestamp: Date.now() });
    }
    if (run !== generation) return;
    // One explicitly requested mock attempt, not the live transport's retry ladder.
    simulateEvent({ type: 'reconnecting', attempt, delay: 0, maxAttempts: 1, timestamp: Date.now() });
    if (run !== generation) return;

    const latency = 10;
    const timeout = config?.connectionTimeout;
    if (timeout !== undefined && timeout < latency) {
      pendingTimer = setTimeout(() => {
        if (run !== generation || state.status !== 'reconnecting') return;
        pendingTimer = null;
        const error = new WebSocketError(
          `Connection timeout after ${timeout}ms`,
          WS_ERROR_CODES.CONNECTION_TIMEOUT,
          true
        );
        state = { ...state, status: 'failed', reconnectAttempts: 0, lastError: error };
        stats.errors++;
        simulateEvent({ type: 'error', error, timestamp: Date.now() });
      }, timeout);
      return;
    }

    pendingTimer = setTimeout(() => {
      if (run !== generation || state.status !== 'reconnecting') return;
      pendingTimer = null;
      state = { ...state, status: 'connected', connectedAt: new Date(), reconnectAttempts: 0, lastError: null };
      stats.reconnects++;
      simulateEvent({ type: 'connected', url, protocols, timestamp: Date.now() });
      if (run !== generation) return;
      simulateEvent({ type: 'reconnected', attempts: attempt, totalDelay: 0, timestamp: Date.now() });
    }, latency);
  }

  function simulateMessage(data: T): void {
    const message: WebSocketMessage<T> = {
      data,
      timestamp: Date.now(),
      raw: JSON.stringify(data)
    };

    stats.messagesReceived++;
    stats.bytesReceived += typeof message.raw === 'string'
      ? message.raw.length
      : message.raw instanceof ArrayBuffer
        ? message.raw.byteLength
        : 0; // Blob size not easily accessible

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
    retirePending();
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
    retirePending();
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
    reconnect,
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
