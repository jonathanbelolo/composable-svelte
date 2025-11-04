/**
 * Spy WebSocket client for testing.
 *
 * This module provides a spy WebSocket client that wraps a real client
 * and records all calls. Perfect for integration testing and debugging.
 */
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
export function createSpyWebSocket(realClient) {
    const connections = [];
    const disconnections = [];
    const sentMessages = [];
    const receivedMessages = [];
    async function connect(url, protocols) {
        const record = { url, timestamp: Date.now() };
        if (protocols !== undefined) {
            record.protocols = protocols;
        }
        connections.push(record);
        return realClient.connect(url, protocols);
    }
    async function disconnect(code = 1000, reason = '') {
        disconnections.push({ code, reason, timestamp: Date.now() });
        return realClient.disconnect(code, reason);
    }
    async function send(message) {
        sentMessages.push(message);
        return realClient.send(message);
    }
    function subscribe(listener) {
        return realClient.subscribe((message) => {
            receivedMessages.push(message);
            listener(message);
        });
    }
    function subscribeToEvents(listener) {
        return realClient.subscribeToEvents(listener);
    }
    function connectionsTo(url) {
        return connections.filter(c => c.url === url).length;
    }
    function reset() {
        connections.length = 0;
        disconnections.length = 0;
        sentMessages.length = 0;
        receivedMessages.length = 0;
    }
    return {
        connect,
        disconnect,
        send,
        subscribe,
        subscribeToEvents,
        get state() { return realClient.state; },
        get stats() { return realClient.stats; },
        connections,
        disconnections,
        sentMessages,
        receivedMessages,
        connectionsTo,
        reset
    };
}
