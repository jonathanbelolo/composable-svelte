/**
 * Heartbeat (Ping/Pong) for WebSocket connections.
 *
 * This module provides health monitoring for WebSocket connections via
 * ping/pong messages. A missed pong is a dead connection: the heartbeat stops
 * itself and asks the client to reconnect.
 *
 * Framing: the ping goes through the client's serializer, so with the default
 * `JSONSerializer` the string `'PING'` is sent as the JSON text `"PING"`
 * (quoted) and the reply has to be JSON that deserialises to the pong — a bare
 * text `PONG` is an `INVALID_MESSAGE`. An object pong is matched
 * structurally; pass `isPong` when it carries fields that vary.
 */

import type { WebSocketClient, HeartbeatConfig } from './types.js';
import { stableStringify } from '../utils/stable-stringify.js';
import { WebSocketError, WS_ERROR_CODES } from './types.js';

export interface Heartbeat {
  /**
   * Start heartbeat monitoring.
   */
  start(): void;

  /**
   * Stop heartbeat monitoring.
   */
  stop(): void;

  /**
   * Check if heartbeat is running.
   */
  readonly isRunning: boolean;
}

/**
 * Create heartbeat monitor for WebSocket connection.
 *
 * Sends ping messages at regular intervals and expects pong responses.
 * On a missed pong it stops and calls `client.reconnect()`, so the connection
 * comes back through the client's reconnect ladder; `disconnect()` would
 * forget the URL and nothing would reconnect (AUDIT-2026-09-03-FINDINGS W4).
 *
 * @param client - WebSocket client
 * @param config - Heartbeat configuration
 * @returns Heartbeat controller
 *
 * @example
 * ```typescript
 * const heartbeat = createHeartbeat(client, {
 *   enabled: true,
 *   interval: 30000,
 *   timeout: 5000,
 *   pingMessage: 'PING',
 *   pongMessage: 'PONG'
 * });
 *
 * // Start on connection
 * client.subscribeToEvents((event) => {
 *   if (event.type === 'connected') {
 *     heartbeat.start();
 *   } else if (event.type === 'disconnected') {
 *     heartbeat.stop();
 *   }
 * });
 * ```
 */
export function createHeartbeat(
  client: WebSocketClient,
  config: HeartbeatConfig = {}
): Heartbeat {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let pongReceived = true;
  let generation = 0;

  const enabled = config.enabled ?? true;
  const interval = config.interval ?? 30000;
  const timeout = config.timeout ?? 5000;
  const pingMessage = config.pingMessage ?? 'PING';
  const pongMessage = config.pongMessage ?? 'PONG';
  // Structural, not `===`: the documented object pong could never match by
  // reference, so every cycle timed out.
  const isPong = config.isPong ?? ((data: unknown) =>
    pongMessage !== null && typeof pongMessage === 'object'
      ? stableStringify(data) === stableStringify(pongMessage)
      : data === pongMessage);

  function start(): void {
    if (intervalId || !enabled) return;

    pongReceived = true;
    const run = ++generation;

    // Subscribe to pong messages
    unsubscribe = client.subscribe((message) => {
      if (isPong(message.data)) {
        pongReceived = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    });

    intervalId = setInterval(() => {
      // Check if last ping was acknowledged
      if (!pongReceived) {
        console.warn('[WebSocket] Heartbeat timeout - no pong received');
        stop();
        try {
          client.reconnect(
            'Heartbeat timeout',
            new WebSocketError(`Heartbeat timeout: no pong within ${interval}ms`, WS_ERROR_CODES.HEARTBEAT_TIMEOUT, true)
          );
        } catch (error) {
          console.error('[WebSocket] Failed to reconnect on heartbeat timeout:', error);
        }
        return;
      }

      // Send ping
      pongReceived = false;
      const sendFailed = (error: unknown) => {
        // If heartbeat was stopped or restarted in the meantime, ignore this stale outcome
        if (run !== generation || intervalId === null) return;
        console.error('[WebSocket] Failed to send ping:', error);
        stop();
        try {
          client.reconnect(
            'Ping send failed',
            new WebSocketError('Failed to send heartbeat ping', WS_ERROR_CODES.SEND_FAILED, true, error)
          );
        } catch (reconnectError) {
          console.error('[WebSocket] Failed to reconnect after ping send error:', reconnectError);
        }
      };
      try { void client.send(pingMessage).catch(sendFailed); }
      catch (error) { sendFailed(error); }
      if (run !== generation || intervalId === null) return;

      // Set timeout for pong
      timeoutId = setTimeout(() => {
        if (run !== generation) return;
        if (!pongReceived) {
          console.warn('[WebSocket] Pong timeout');
          stop();
          try {
            client.reconnect(
              'Pong timeout',
              new WebSocketError(`Pong timeout: no pong within ${timeout}ms`, WS_ERROR_CODES.HEARTBEAT_TIMEOUT, true)
            );
          } catch (error) {
            console.error('[WebSocket] Failed to reconnect on pong timeout:', error);
          }
        }
      }, timeout);

    }, interval);
  }

  function stop(): void {
    generation++;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    pongReceived = true;
  }

  return {
    start,
    stop,
    get isRunning() { return intervalId !== null; }
  };
}
