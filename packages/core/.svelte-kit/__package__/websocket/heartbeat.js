/**
 * Heartbeat (Ping/Pong) for WebSocket connections.
 *
 * This module provides health monitoring for WebSocket connections via
 * ping/pong messages. Automatically disconnects if pong not received within timeout.
 */
/**
 * Create heartbeat monitor for WebSocket connection.
 *
 * Sends ping messages at regular intervals and expects pong responses.
 * Disconnects if pong not received within timeout.
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
export function createHeartbeat(client, config) {
    let intervalId = null;
    let timeoutId = null;
    let unsubscribe = null;
    let pongReceived = true;
    const pingMessage = config.pingMessage ?? 'PING';
    const pongMessage = config.pongMessage ?? 'PONG';
    function start() {
        if (intervalId || !config.enabled)
            return;
        pongReceived = true;
        // Subscribe to pong messages
        unsubscribe = client.subscribe((message) => {
            if (message.data === pongMessage) {
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
                client.disconnect(1001, 'Heartbeat timeout').catch(console.error);
                stop();
                return;
            }
            // Send ping
            pongReceived = false;
            client.send(pingMessage).catch((error) => {
                console.error('[WebSocket] Failed to send ping:', error);
                stop();
            });
            // Set timeout for pong
            timeoutId = setTimeout(() => {
                if (!pongReceived) {
                    console.warn('[WebSocket] Pong timeout');
                    client.disconnect(1001, 'Pong timeout').catch(console.error);
                    stop();
                }
            }, config.timeout);
        }, config.interval);
    }
    function stop() {
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
