/**
 * Mock WebSocket client for testing.
 *
 * This module provides a mock WebSocket client that simulates WebSocket behavior
 * without making real network connections. Perfect for unit testing reducers.
 */
import { WebSocketError, WS_ERROR_CODES } from '../types.js';
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
export function createMockWebSocket(config) {
    let state = {
        status: 'disconnected',
        url: null,
        protocols: [],
        reconnectAttempts: 0,
        lastError: null,
        connectedAt: null
    };
    const messageListeners = new Set();
    const eventListeners = new Set();
    const sentMessages = [];
    const stats = {
        messagesSent: 0,
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        reconnects: 0,
        errors: 0
    };
    async function connect(url, protocols = []) {
        // Prevent connecting when already connected
        if (state.status === 'connected') {
            throw new WebSocketError('Already connected', WS_ERROR_CODES.CONNECTION_FAILED, false);
        }
        state = {
            ...state,
            status: 'connecting',
            url,
            protocols
        };
        // Simulate async connection - use queueMicrotask for fake timer compatibility
        await new Promise(resolve => {
            setTimeout(() => {
                state = {
                    ...state,
                    status: 'connected',
                    connectedAt: new Date()
                };
                const event = {
                    type: 'connected',
                    url,
                    protocols,
                    timestamp: Date.now()
                };
                eventListeners.forEach(listener => {
                    try {
                        listener(event);
                    }
                    catch (error) {
                        console.error('[MockWebSocket] Error in listener:', error);
                    }
                });
                resolve();
            }, config?.connectionTimeout || 10);
        });
    }
    async function disconnect(code = 1000, reason = '') {
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
            const event = {
                type: 'disconnected',
                code,
                reason,
                wasClean: true,
                timestamp: Date.now()
            };
            eventListeners.forEach(listener => {
                try {
                    listener(event);
                }
                catch (error) {
                    console.error('[MockWebSocket] Error in listener:', error);
                }
            });
        }
    }
    async function send(message) {
        if (state.status !== 'connected') {
            throw new WebSocketError('Not connected', WS_ERROR_CODES.SEND_FAILED, true);
        }
        sentMessages.push(message);
        stats.messagesSent++;
        // Calculate bytes sent
        const serialized = JSON.stringify(message);
        stats.bytesSent += serialized.length;
    }
    function subscribe(listener) {
        messageListeners.add(listener);
        return () => {
            messageListeners.delete(listener);
        };
    }
    function subscribeToEvents(listener) {
        eventListeners.add(listener);
        return () => {
            eventListeners.delete(listener);
        };
    }
    function simulateMessage(data) {
        const message = {
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
            }
            catch (error) {
                console.error('[MockWebSocket] Error in listener:', error);
            }
        });
    }
    function simulateEvent(event) {
        eventListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('[MockWebSocket] Error in listener:', error);
            }
        });
    }
    function simulateError(error) {
        state = { ...state, lastError: error };
        stats.errors++;
        const event = {
            type: 'error',
            error,
            timestamp: Date.now()
        };
        simulateEvent(event);
    }
    function simulateDisconnect(code, reason) {
        state = {
            status: 'disconnected',
            url: null,
            protocols: [],
            reconnectAttempts: 0,
            lastError: null,
            connectedAt: null
        };
        const event = {
            type: 'disconnected',
            code,
            reason,
            wasClean: false,
            timestamp: Date.now()
        };
        simulateEvent(event);
    }
    function reset() {
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
        get stats() {
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
