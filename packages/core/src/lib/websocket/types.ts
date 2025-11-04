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
// WebSocket Client Interface
// ============================================================================

/**
 * Generic WebSocket client interface.
 *
 * @template T - Message data type (default: unknown for maximum flexibility)
 *
 * **Platform**: Browser only (uses native WebSocket API)
 * **Node.js**: Use adapter pattern (see NodeWebSocketAdapter in future)
 */
export interface WebSocketClient<T = unknown> {
  /**
   * Connect to a WebSocket server.
   * Creates a new WebSocket instance.
   */
  connect(url: string, protocols?: string[]): Promise<void>;

  /**
   * Disconnect from the WebSocket server.
   * Cleans up WebSocket instance.
   */
  disconnect(code?: number, reason?: string): Promise<void>;

  /**
   * Send a message through the WebSocket.
   * Throws if not connected.
   */
  send(message: T): Promise<void>;

  /**
   * Subscribe to messages from the WebSocket.
   * Returns unsubscribe function.
   */
  subscribe(listener: MessageListener<T>): Unsubscribe;

  /**
   * Subscribe to connection events.
   * Returns unsubscribe function.
   */
  subscribeToEvents(listener: EventListener): Unsubscribe;

  /**
   * Get current connection state (readonly).
   */
  readonly state: ConnectionState;

  /**
   * Get connection statistics (readonly).
   */
  readonly stats: ConnectionStats;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * WebSocket message wrapper.
 *
 * @template T - The parsed message data type
 */
export interface WebSocketMessage<T = unknown> {
  /**
   * Parsed message data.
   */
  readonly data: T;

  /**
   * Timestamp when message was received (client-side).
   */
  readonly timestamp: number;

  /**
   * Raw message from WebSocket (string, ArrayBuffer, or Blob).
   */
  readonly raw: string | ArrayBuffer | Blob;
}

export type MessageListener<T> = (message: WebSocketMessage<T>) => void;
export type EventListener = (event: WebSocketEvent) => void;
export type Unsubscribe = () => void | Promise<void>;

// ============================================================================
// Connection State
// ============================================================================

export interface ConnectionState {
  readonly status: ConnectionStatus;
  readonly url: string | null;
  readonly protocols: string[];
  readonly reconnectAttempts: number;
  readonly lastError: WebSocketError | null;
  readonly connectedAt: Date | null;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface ConnectionStats {
  readonly messagesSent: number;
  readonly messagesReceived: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly reconnects: number;
  readonly errors: number;
  readonly uptime: number; // milliseconds
}

// ============================================================================
// WebSocket Events (Renamed to avoid conflict with window.MessageEvent)
// ============================================================================

export type WebSocketEvent =
  | WebSocketConnectedEvent
  | WebSocketDisconnectedEvent
  | WebSocketErrorEvent
  | WebSocketReconnectingEvent
  | WebSocketReconnectedEvent;

export interface WebSocketConnectedEvent {
  readonly type: 'connected';
  readonly url: string;
  readonly protocols: string[];
  readonly timestamp: number;
}

export interface WebSocketDisconnectedEvent {
  readonly type: 'disconnected';
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
  readonly timestamp: number;
}

export interface WebSocketErrorEvent {
  readonly type: 'error';
  readonly error: WebSocketError;
  readonly timestamp: number;
}

export interface WebSocketReconnectingEvent {
  readonly type: 'reconnecting';
  readonly attempt: number;
  readonly delay: number;
  readonly maxAttempts: number;
  readonly timestamp: number;
}

export interface WebSocketReconnectedEvent {
  readonly type: 'reconnected';
  readonly attempts: number;
  readonly totalDelay: number;
  readonly timestamp: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly recoverable: boolean,
    public readonly cause?: unknown
  ) {
    super(message);
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
} as const;

// ============================================================================
// Configuration
// ============================================================================

export interface WebSocketConfig {
  /**
   * WebSocket URL.
   */
  readonly url: string;

  /**
   * WebSocket protocols.
   */
  readonly protocols?: string[];

  /**
   * Reconnection strategy.
   */
  readonly reconnect?: ReconnectConfig;

  /**
   * Heartbeat configuration.
   */
  readonly heartbeat?: HeartbeatConfig;

  /**
   * Message serialization.
   */
  readonly serializer?: MessageSerializer;

  /**
   * Connection timeout (ms).
   * @default 10000
   */
  readonly connectionTimeout?: number;

  /**
   * Message queue size for offline scenarios.
   * @default 100
   */
  readonly queueSize?: number;
}

export interface ReconnectConfig {
  /**
   * Enable automatic reconnection.
   * @default true
   */
  readonly enabled: boolean;

  /**
   * Maximum reconnection attempts (0 = infinite).
   * @default 5
   */
  readonly maxAttempts: number;

  /**
   * Initial delay between reconnection attempts (ms).
   * @default 1000
   */
  readonly initialDelay: number;

  /**
   * Maximum delay between attempts (ms).
   * @default 30000
   */
  readonly maxDelay: number;

  /**
   * Backoff multiplier.
   * @default 2
   */
  readonly backoffMultiplier: number;

  /**
   * Add random jitter to delays.
   * @default true
   */
  readonly jitter: boolean;
}

export interface HeartbeatConfig {
  /**
   * Enable heartbeat/ping-pong.
   * @default false
   */
  readonly enabled: boolean;

  /**
   * Interval between pings (ms).
   * @default 30000
   */
  readonly interval: number;

  /**
   * Timeout for pong response (ms).
   * @default 5000
   */
  readonly timeout: number;

  /**
   * Ping message to send.
   * @default 'PING'
   */
  readonly pingMessage?: unknown;

  /**
   * Expected pong message to match.
   * @default 'PONG'
   */
  readonly pongMessage?: unknown;
}

export interface MessageSerializer {
  /**
   * Serialize message to wire format.
   */
  serialize<T>(message: T): string | ArrayBuffer | Blob;

  /**
   * Deserialize message from wire format.
   */
  deserialize<T>(data: string | ArrayBuffer | Blob): T;
}

// Default JSON serializer
export const JSONSerializer: MessageSerializer = {
  serialize<T>(message: T): string {
    return JSON.stringify(message);
  },
  deserialize<T>(data: string | ArrayBuffer | Blob): T {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    throw new WebSocketError(
      'JSONSerializer only supports string messages',
      WS_ERROR_CODES.INVALID_MESSAGE,
      true
    );
  }
};
