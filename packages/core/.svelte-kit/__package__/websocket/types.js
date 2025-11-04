/**
 * WebSocket types for Composable Svelte.
 *
 * This module defines the core types for WebSocket integration:
 * - WebSocketClient: Generic client interface for WebSocket connections
 * - Connection state and stats tracking
 * - Message and event types
 * - Error handling
 * - Configuration interfaces
 */
// ============================================================================
// Error Types
// ============================================================================
export class WebSocketError extends Error {
    constructor(message, code, recoverable, cause) {
        super(message);
        this.code = code;
        this.recoverable = recoverable;
        this.cause = cause;
        this.name = 'WebSocketError';
    }
}
// Error codes
export const WS_ERROR_CODES = {
    CONNECTION_FAILED: 'WS_CONNECTION_FAILED',
    CONNECTION_TIMEOUT: 'WS_CONNECTION_TIMEOUT',
    SEND_FAILED: 'WS_SEND_FAILED',
    INVALID_MESSAGE: 'WS_INVALID_MESSAGE',
    MAX_RECONNECTS: 'WS_MAX_RECONNECTS',
    PROTOCOL_ERROR: 'WS_PROTOCOL_ERROR',
    HEARTBEAT_TIMEOUT: 'WS_HEARTBEAT_TIMEOUT'
};
// Default JSON serializer
export const JSONSerializer = {
    serialize(message) {
        return JSON.stringify(message);
    },
    deserialize(data) {
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        throw new WebSocketError('JSONSerializer only supports string messages', WS_ERROR_CODES.INVALID_MESSAGE, true);
    }
};
