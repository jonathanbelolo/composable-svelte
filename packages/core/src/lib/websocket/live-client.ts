/**
 * Production WebSocket client implementation.
 *
 * This module provides a production-ready WebSocket client with:
 * - Automatic reconnection with exponential backoff
 * - Connection timeout handling
 * - Message serialization/deserialization
 * - Statistics tracking
 * - Error recovery
 */

import type {
  WebSocketClient,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEvent,
  ConnectionState,
  ConnectionStats,
  ReconnectConfig,
  MessageListener,
  EventListener,
  Unsubscribe,
  MessageSerializer
} from './types.js';
import { WebSocketError, WS_ERROR_CODES, JSONSerializer } from './types.js';

/**
 * Create a production WebSocket client.
 *
 * **Platform**: Browser only (uses native WebSocket API)
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection timeout handling
 * - Message serialization/deserialization
 * - Statistics tracking
 * - Error recovery
 *
 * @param config - WebSocket configuration
 * @returns WebSocket client instance
 *
 * @example
 * ```typescript
 * const client = createLiveWebSocket({
 *   url: 'wss://example.com',
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     maxDelay: 30000,
 *     backoffMultiplier: 2,
 *     jitter: true
 *   }
 * });
 *
 * await client.connect('wss://example.com');
 * ```
 */
export function createLiveWebSocket<T = unknown>(
  config?: Partial<WebSocketConfig>
): WebSocketClient<T> {
  // State
  let socket: WebSocket | null = null;
  let state: ConnectionState = {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  };

  const stats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    reconnects: 0,
    errors: 0,
    uptime: 0,
    // This client does not queue; `createQueuedWebSocket` reports its own.
    messagesQueued: 0
  };

  // Listeners
  const messageListeners = new Set<MessageListener<T>>();
  const eventListeners = new Set<EventListener>();

  // Configuration with defaults
  const serializer: MessageSerializer = config?.serializer || JSONSerializer;
  const connectionTimeout = config?.connectionTimeout || 10000;
  const reconnectConfig: ReconnectConfig = {
    enabled: config?.reconnect?.enabled ?? true,
    maxAttempts: config?.reconnect?.maxAttempts ?? 5,
    initialDelay: config?.reconnect?.initialDelay ?? 1000,
    maxDelay: config?.reconnect?.maxDelay ?? 30000,
    backoffMultiplier: config?.reconnect?.backoffMultiplier ?? 2,
    jitter: config?.reconnect?.jitter ?? true
  };

  // Reconnection timer
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  /** The delays of the current reconnect ladder, summed, for `reconnected.totalDelay`. */
  let ladderDelay = 0;
  /** Sockets whose failure has been handled once; a socket fails on error and again on close. */
  const failedSockets = new WeakSet<WebSocket>();

  // ========================================
  // Internal Helpers
  // ========================================

  function updateState(updates: Partial<ConnectionState>): void {
    state = { ...state, ...updates };
  }

  function notifyEventListeners(event: WebSocketEvent): void {
    eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[WebSocket] Error in event listener:', error);
      }
    });
  }

  function notifyMessageListeners(message: WebSocketMessage<T>): void {
    messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('[WebSocket] Error in message listener:', error);
      }
    });
  }

  function calculateReconnectDelay(attempt: number): number {
    const baseDelay = reconnectConfig.initialDelay * Math.pow(
      reconnectConfig.backoffMultiplier,
      attempt - 1
    );
    const delay = Math.min(baseDelay, reconnectConfig.maxDelay);
    const jitter = reconnectConfig.jitter ? delay * Math.random() * 0.3 : 0;
    return delay + jitter;
  }

  // ========================================
  // Connection Management
  // ========================================

  /**
   * Detach a socket from this client: its handlers can no longer reach the
   * state, and it is closed if it is not already. Used for an attempt that
   * failed and for the connection timeout, so a socket's later `close` cannot
   * overwrite the state of the connection that replaced it.
   */
  function abandonSocket(ws: WebSocket): void {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.close();
      } catch {
        // Already closing, or a code the browser refuses; nothing to do.
      }
    }
    if (socket === ws) socket = null;
  }

  /**
   * A socket that never opened has failed: once, whichever of `error`,
   * `close` or the connection timeout reports it first. A user `connect()`
   * settles as `failed` and rejects; a reconnect attempt schedules the next
   * rung of the ladder. The first form ran `connect()` from the reconnect
   * timer, which reset the attempt counter, and rescheduled only from the
   * `onclose` of a socket that had been connected — which a failed attempt
   * never was — so the first failed attempt was the last
   * (AUDIT-2026-09-03-FINDINGS W1).
   */
  function attemptFailed(ws: WebSocket, error: WebSocketError, reject: (error: unknown) => void): void {
    if (failedSockets.has(ws)) return;
    failedSockets.add(ws);
    if (connectionTimeoutTimer) {
      clearTimeout(connectionTimeoutTimer);
      connectionTimeoutTimer = null;
    }
    abandonSocket(ws);
    stats.errors++;
    updateState({ lastError: error });
    notifyEventListeners({ type: 'error', error, timestamp: Date.now() });

    if (state.status === 'reconnecting') {
      reject(error);
      scheduleReconnect();
      return;
    }
    updateState({ status: 'failed' });
    reject(error);
  }

  /**
   * Open a socket for the current `state.url`. Shared by `connect()` and the
   * reconnect timer; it never touches `reconnectAttempts` — only a user
   * `connect()` and a successful open reset that.
   */
  function openSocket(url: string, protocols: string[]): Promise<void> {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, protocols);
    } catch (error) {
      const wsError = new WebSocketError(
        `Failed to create WebSocket: ${error}`,
        WS_ERROR_CODES.CONNECTION_FAILED,
        true,
        error
      );
      stats.errors++;
      if (state.status === 'reconnecting') {
        updateState({ lastError: wsError });
        notifyEventListeners({ type: 'error', error: wsError, timestamp: Date.now() });
        scheduleReconnect();
      } else {
        updateState({ status: 'failed', lastError: wsError });
      }
      return Promise.reject(wsError);
    }
    socket = ws;
    // An attempt, not a user connect(): a successful open is a reconnect.
    const attempts = state.status === 'reconnecting' ? state.reconnectAttempts : 0;

    return new Promise((resolve, reject) => {
      // Connection timeout
      connectionTimeoutTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          attemptFailed(
            ws,
            new WebSocketError(
              `Connection timeout after ${connectionTimeout}ms`,
              WS_ERROR_CODES.CONNECTION_TIMEOUT,
              true
            ),
            reject
          );
        }
      }, connectionTimeout);

      ws.onopen = () => {
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }

        updateState({
          status: 'connected',
          connectedAt: new Date(),
          lastError: null,
          reconnectAttempts: 0
        });

        notifyEventListeners({
          type: 'connected',
          url,
          protocols,
          timestamp: Date.now()
        });

        if (attempts > 0) {
          stats.reconnects++;
          notifyEventListeners({
            type: 'reconnected',
            attempts,
            totalDelay: ladderDelay,
            timestamp: Date.now()
          });
        }

        resolve();
      };

      ws.onerror = (event) => {
        const error = new WebSocketError(
          'Connection failed',
          WS_ERROR_CODES.CONNECTION_FAILED,
          true,
          event
        );
        if (ws.readyState !== WebSocket.OPEN) {
          // Never opened: the attempt failed.
          attemptFailed(ws, error, reject);
          return;
        }
        // Established: report it; the close that follows decides what next.
        // (Status is still set to `failed` here until R1.4.e.)
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }
        updateState({ status: 'failed', lastError: error });
        stats.errors++;
        notifyEventListeners({ type: 'error', error, timestamp: Date.now() });
      };

      ws.onmessage = (event) => {
        stats.messagesReceived++;

        // Calculate bytes received
        if (typeof event.data === 'string') {
          stats.bytesReceived += event.data.length;
        } else if (event.data instanceof ArrayBuffer) {
          stats.bytesReceived += event.data.byteLength;
        } else if (event.data instanceof Blob) {
          stats.bytesReceived += event.data.size;
        }

        // Parse message
        try {
          const data = serializer.deserialize<T>(event.data);
          const message: WebSocketMessage<T> = {
            data,
            timestamp: Date.now(),
            raw: event.data
          };

          notifyMessageListeners(message);
        } catch (error) {
          const wsError = new WebSocketError(
            `Failed to parse message: ${error}`,
            WS_ERROR_CODES.INVALID_MESSAGE,
            true,
            error
          );
          stats.errors++;
          notifyEventListeners({
            type: 'error',
            error: wsError,
            timestamp: Date.now()
          });
        }
      };

      ws.onclose = (event) => {
        if (ws.readyState === WebSocket.CLOSED && failedSockets.has(ws)) return;
        if (state.status === 'connecting' || state.status === 'reconnecting') {
          // Closed before it opened, with no error event first.
          attemptFailed(
            ws,
            new WebSocketError('Connection closed before it opened', WS_ERROR_CODES.CONNECTION_FAILED, true, event),
            reject
          );
          return;
        }

        const wasConnected = state.status === 'connected';

        updateState({
          status: 'disconnected',
          connectedAt: null
        });

        notifyEventListeners({
          type: 'disconnected',
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: Date.now()
        });

        // Attempt reconnection if enabled and was connected
        if (wasConnected && reconnectConfig.enabled && !event.wasClean) {
          ladderDelay = 0;
          scheduleReconnect();
        }
      };
    });
  }

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    // Validate state
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      throw new WebSocketError(
        'Already connected or connecting',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    // Clear any pending reconnect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // A user connect() is the one place the ladder starts over.
    updateState({
      status: 'connecting',
      url,
      protocols,
      reconnectAttempts: 0
    });
    ladderDelay = 0;

    return openSocket(url, protocols);
  }

  /** One rung of the ladder: open a socket without touching the attempt count. */
  function attemptReconnect(): void {
    if (!state.url) return;
    openSocket(state.url, state.protocols).catch(() => {
      // attemptFailed has already reported it and scheduled the next rung.
    });
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    // Clear reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Clear connection timeout
    if (connectionTimeoutTimer) {
      clearTimeout(connectionTimeoutTimer);
      connectionTimeoutTimer = null;
    }

    // Close socket
    if (socket) {
      try {
        socket.close(code, reason);
      } catch (error) {
        console.warn('[WebSocket] Error closing socket:', error);
      }
      socket = null;
    }

    updateState({
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      connectedAt: null
    });
  }

  function scheduleReconnect(): void {
    if (!state.url) return;

    const attempt = state.reconnectAttempts + 1;

    // Check max attempts
    if (reconnectConfig.maxAttempts > 0 && attempt > reconnectConfig.maxAttempts) {
      const error = new WebSocketError(
        `Max reconnection attempts (${reconnectConfig.maxAttempts}) exceeded`,
        WS_ERROR_CODES.MAX_RECONNECTS,
        false
      );
      updateState({ status: 'failed', lastError: error });
      notifyEventListeners({
        type: 'error',
        error,
        timestamp: Date.now()
      });
      return;
    }

    const delay = calculateReconnectDelay(attempt);
    ladderDelay += delay;

    updateState({
      status: 'reconnecting',
      reconnectAttempts: attempt
    });

    notifyEventListeners({
      type: 'reconnecting',
      attempt,
      delay,
      maxAttempts: reconnectConfig.maxAttempts,
      timestamp: Date.now()
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      attemptReconnect();
    }, delay);
  }

  // ========================================
  // Message Sending
  // ========================================

  async function send(message: T): Promise<void> {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new WebSocketError(
        'Not connected',
        WS_ERROR_CODES.SEND_FAILED,
        true
      );
    }

    try {
      const serialized = serializer.serialize(message);
      socket.send(serialized);

      stats.messagesSent++;

      // Calculate bytes sent
      if (typeof serialized === 'string') {
        stats.bytesSent += serialized.length;
      } else if (serialized instanceof ArrayBuffer) {
        stats.bytesSent += serialized.byteLength;
      } else if (serialized instanceof Blob) {
        stats.bytesSent += serialized.size;
      }
    } catch (error) {
      const wsError = new WebSocketError(
        `Failed to send message: ${error}`,
        WS_ERROR_CODES.SEND_FAILED,
        true,
        error
      );
      stats.errors++;
      throw wsError;
    }
  }

  // ========================================
  // Subscriptions
  // ========================================

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

  // ========================================
  // Public API
  // ========================================

  return {
    connect,
    disconnect,
    send,
    subscribe,
    subscribeToEvents,
    get state() {
      return state;
    },
    get stats() {
      // Calculate uptime
      const uptime = state.connectedAt
        ? Date.now() - state.connectedAt.getTime()
        : 0;
      return { ...stats, uptime };
    }
  };
}
