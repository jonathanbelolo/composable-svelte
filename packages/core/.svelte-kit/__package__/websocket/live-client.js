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
export function createLiveWebSocket(config) {
    // State
    let socket = null;
    let state = {
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
        uptime: 0
    };
    // Listeners
    const messageListeners = new Set();
    const eventListeners = new Set();
    // Configuration with defaults
    const serializer = config?.serializer || JSONSerializer;
    const connectionTimeout = config?.connectionTimeout || 10000;
    const reconnectConfig = {
        enabled: config?.reconnect?.enabled ?? true,
        maxAttempts: config?.reconnect?.maxAttempts ?? 5,
        initialDelay: config?.reconnect?.initialDelay ?? 1000,
        maxDelay: config?.reconnect?.maxDelay ?? 30000,
        backoffMultiplier: config?.reconnect?.backoffMultiplier ?? 2,
        jitter: config?.reconnect?.jitter ?? true
    };
    // Reconnection timer
    let reconnectTimer = null;
    let connectionTimeoutTimer = null;
    // ========================================
    // Internal Helpers
    // ========================================
    function updateState(updates) {
        state = { ...state, ...updates };
    }
    function notifyEventListeners(event) {
        eventListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('[WebSocket] Error in event listener:', error);
            }
        });
    }
    function notifyMessageListeners(message) {
        messageListeners.forEach(listener => {
            try {
                listener(message);
            }
            catch (error) {
                console.error('[WebSocket] Error in message listener:', error);
            }
        });
    }
    function calculateReconnectDelay(attempt) {
        const baseDelay = reconnectConfig.initialDelay * Math.pow(reconnectConfig.backoffMultiplier, attempt - 1);
        const delay = Math.min(baseDelay, reconnectConfig.maxDelay);
        const jitter = reconnectConfig.jitter ? delay * Math.random() * 0.3 : 0;
        return delay + jitter;
    }
    // ========================================
    // Connection Management
    // ========================================
    async function connect(url, protocols = []) {
        // Validate state
        if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
            throw new WebSocketError('Already connected or connecting', WS_ERROR_CODES.CONNECTION_FAILED, false);
        }
        // Clear any pending reconnect
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        // Update state
        updateState({
            status: 'connecting',
            url,
            protocols,
            reconnectAttempts: 0
        });
        // Create new WebSocket instance
        try {
            socket = new WebSocket(url, protocols);
        }
        catch (error) {
            const wsError = new WebSocketError(`Failed to create WebSocket: ${error}`, WS_ERROR_CODES.CONNECTION_FAILED, true, error);
            updateState({ status: 'failed', lastError: wsError });
            stats.errors++;
            throw wsError;
        }
        return new Promise((resolve, reject) => {
            // Connection timeout
            connectionTimeoutTimer = setTimeout(() => {
                if (socket && socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                    const error = new WebSocketError(`Connection timeout after ${connectionTimeout}ms`, WS_ERROR_CODES.CONNECTION_TIMEOUT, true);
                    updateState({ status: 'failed', lastError: error });
                    stats.errors++;
                    notifyEventListeners({
                        type: 'error',
                        error,
                        timestamp: Date.now()
                    });
                    reject(error);
                }
            }, connectionTimeout);
            socket.onopen = () => {
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
                resolve();
            };
            socket.onerror = (event) => {
                if (connectionTimeoutTimer) {
                    clearTimeout(connectionTimeoutTimer);
                    connectionTimeoutTimer = null;
                }
                const error = new WebSocketError('Connection failed', WS_ERROR_CODES.CONNECTION_FAILED, true, event);
                updateState({ status: 'failed', lastError: error });
                stats.errors++;
                notifyEventListeners({
                    type: 'error',
                    error,
                    timestamp: Date.now()
                });
                reject(error);
            };
            socket.onmessage = (event) => {
                stats.messagesReceived++;
                // Calculate bytes received
                if (typeof event.data === 'string') {
                    stats.bytesReceived += event.data.length;
                }
                else if (event.data instanceof ArrayBuffer) {
                    stats.bytesReceived += event.data.byteLength;
                }
                else if (event.data instanceof Blob) {
                    stats.bytesReceived += event.data.size;
                }
                // Parse message
                try {
                    const data = serializer.deserialize(event.data);
                    const message = {
                        data,
                        timestamp: Date.now(),
                        raw: event.data
                    };
                    notifyMessageListeners(message);
                }
                catch (error) {
                    const wsError = new WebSocketError(`Failed to parse message: ${error}`, WS_ERROR_CODES.INVALID_MESSAGE, true, error);
                    stats.errors++;
                    notifyEventListeners({
                        type: 'error',
                        error: wsError,
                        timestamp: Date.now()
                    });
                }
            };
            socket.onclose = (event) => {
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
                    scheduleReconnect();
                }
            };
        });
    }
    async function disconnect(code = 1000, reason = '') {
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
            }
            catch (error) {
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
    function scheduleReconnect() {
        if (!state.url)
            return;
        const attempt = state.reconnectAttempts + 1;
        // Check max attempts
        if (reconnectConfig.maxAttempts > 0 && attempt > reconnectConfig.maxAttempts) {
            const error = new WebSocketError(`Max reconnection attempts (${reconnectConfig.maxAttempts}) exceeded`, WS_ERROR_CODES.MAX_RECONNECTS, false);
            updateState({ status: 'failed', lastError: error });
            notifyEventListeners({
                type: 'error',
                error,
                timestamp: Date.now()
            });
            return;
        }
        const delay = calculateReconnectDelay(attempt);
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
        reconnectTimer = setTimeout(async () => {
            try {
                await connect(state.url, state.protocols);
                stats.reconnects++;
                notifyEventListeners({
                    type: 'reconnected',
                    attempts: attempt,
                    totalDelay: delay,
                    timestamp: Date.now()
                });
            }
            catch (error) {
                // Reconnection failed, scheduleReconnect will be called by onclose
                console.warn(`[WebSocket] Reconnection attempt ${attempt} failed:`, error);
            }
        }, delay);
    }
    // ========================================
    // Message Sending
    // ========================================
    async function send(message) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new WebSocketError('Not connected', WS_ERROR_CODES.SEND_FAILED, true);
        }
        try {
            const serialized = serializer.serialize(message);
            socket.send(serialized);
            stats.messagesSent++;
            // Calculate bytes sent
            if (typeof serialized === 'string') {
                stats.bytesSent += serialized.length;
            }
            else if (serialized instanceof ArrayBuffer) {
                stats.bytesSent += serialized.byteLength;
            }
            else if (serialized instanceof Blob) {
                stats.bytesSent += serialized.size;
            }
        }
        catch (error) {
            const wsError = new WebSocketError(`Failed to send message: ${error}`, WS_ERROR_CODES.SEND_FAILED, true, error);
            stats.errors++;
            throw wsError;
        }
    }
    // ========================================
    // Subscriptions
    // ========================================
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
