/**
 * Spy WebSocket client for testing.
 *
 * This module provides a spy WebSocket client that wraps a real client
 * and records all calls. Perfect for integration testing and debugging.
 */

import type {
  WebSocketClient,
  WebSocketMessage,
  ConnectionState,
  ConnectionStats,
  MessageListener,
  EventListener,
  Unsubscribe,
  WebSocketError
} from '../types.js';

export interface RecordedConnection {
  readonly url: string;
  readonly protocols?: string[];
  readonly timestamp: number;
}

export interface RecordedDisconnection {
  readonly code: number;
  readonly reason: string;
  readonly timestamp: number;
}

export interface SpyWebSocketClient<T = unknown> extends WebSocketClient<T> {
  /**
   * All connection attempts, including calls rejected by the wrapped client.
   */
  readonly connections: RecordedConnection[];

  /**
   * All disconnect attempts, including calls rejected by the wrapped client.
   */
  readonly disconnections: RecordedDisconnection[];

  /**
   * All reconnect attempts, including calls rejected or ignored by the wrapped client.
   */
  readonly reconnections: Array<{ readonly reason: string; readonly cause?: WebSocketError; readonly timestamp: number }>;

  /**
   * All sent message attempts, including messages that failed to send.
   */
  readonly sentMessages: T[];

  /**
   * All received messages.
   */
  readonly receivedMessages: WebSocketMessage<T>[];

  /**
   * Count connections to a specific URL.
   */
  connectionsTo(url: string): number;

  /**
   * Reset all recorded data.
   */
  reset(): void;
}

/**
 * Create a spy WebSocket client that wraps a real client and records all calls.
 *
 * @param realClient - The real WebSocket client to wrap
 * @returns Spy WebSocket client
 *
 * @example
 * ```typescript
 * const liveClient = createLiveWebSocket();
 * const spyClient = createSpyWebSocket(liveClient);
 *
 * await spyClient.connect('wss://example.com');
 * await spyClient.send({ type: 'ping' });
 *
 * expect(spyClient.connections).toHaveLength(1);
 * expect(spyClient.sentMessages).toHaveLength(1);
 * ```
 */
export function createSpyWebSocket<T = unknown>(
  realClient: WebSocketClient<T>
): SpyWebSocketClient<T> {
  const connections: RecordedConnection[] = [];
  const disconnections: RecordedDisconnection[] = [];
  const reconnections: Array<{ reason: string; cause?: WebSocketError; timestamp: number }> = [];
  const sentMessages: T[] = [];
  const receivedMessages: WebSocketMessage<T>[] = [];

  async function connect(url: string, protocols?: string[]): Promise<void> {
    const record: RecordedConnection = { url, timestamp: Date.now() };
    if (protocols !== undefined) {
      (record as any).protocols = protocols;
    }
    connections.push(record);
    return realClient.connect(url, protocols);
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    disconnections.push({ code, reason, timestamp: Date.now() });
    return realClient.disconnect(code, reason);
  }

  function reconnect(reason = 'Reconnect requested', cause?: WebSocketError): void {
    reconnections.push({
      reason,
      ...(cause !== undefined ? { cause } : {}),
      timestamp: Date.now()
    });
    realClient.reconnect(reason, cause);
  }

  async function send(message: T): Promise<void> {
    sentMessages.push(message);
    return realClient.send(message);
  }

  const consumers = new Set<{ listener: MessageListener<T> }>();
  let stopRecording: Unsubscribe | null = null;
  let deliveryDepth = 0;
  function releaseRecording(): void {
    if (consumers.size === 0 && deliveryDepth === 0) {
      const stop = stopRecording;
      stopRecording = null;
      stop?.();
    }
  }
  /**
   * Subscribe to messages from the WebSocket.
   *
   * Dispatches via a deterministic snapshot of consumers ([...consumers]), ensuring
   * that consumers added during delivery do not receive the in-flight message and
   * avoiding unbounded Set mutation loops. Consumers removed during dispatch are skipped.
   */
  function subscribe(listener: MessageListener<T>): Unsubscribe {
    const consumer = { listener };
    consumers.add(consumer);
    try {
      if (stopRecording === null) {
        stopRecording = realClient.subscribe(message => {
          if (consumers.size === 0) return;
          receivedMessages.push(message);
          deliveryDepth++;
          try {
            for (const current of [...consumers]) {
              if (!consumers.has(current)) continue;
              try { current.listener(message); }
              catch (error) { console.error('[SpyWebSocket] Error in listener:', error); }
            }
          } finally { deliveryDepth--; releaseRecording(); }
        });
      }
    } catch (error) { consumers.delete(consumer); throw error; }
    return () => { consumers.delete(consumer); releaseRecording(); };
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    return realClient.subscribeToEvents(listener);
  }

  function connectionsTo(url: string): number {
    return connections.filter(c => c.url === url).length;
  }

  function reset(): void {
    connections.length = 0;
    disconnections.length = 0;
    reconnections.length = 0;
    sentMessages.length = 0;
    receivedMessages.length = 0;
  }

  return {
    connect,
    disconnect,
    reconnect,
    send,
    subscribe,
    subscribeToEvents,
    get state(): ConnectionState { return realClient.state; },
    get stats(): ConnectionStats { return realClient.stats; },
    connections,
    disconnections,
    reconnections,
    sentMessages,
    receivedMessages,
    connectionsTo,
    reset
  };
}
