# WebSocket Integration Plan (Revised)

**Status**: 📋 Planning (Revision 2)
**Started**: 2025-11-03
**Revised**: 2025-11-03
**Target**: TBD

---

## Revision Notes

**Version 2 Changes**:
- Fixed critical Effect.run() cleanup issue by adding Effect.subscription()
- Fixed ConnectionManager architecture (WebSocket instance creation)
- Added complete createLiveWebSocket() implementation
- Fixed double subscription bug in examples
- Added missing spy client implementation
- Renamed MessageEvent → WebSocketMessageEvent
- Made message structure flexible with generics
- Clarified browser-only support (Node.js via adapter)
- Added heartbeat, message queue, and binary support specifications
- Fixed all module paths and type issues

See `WEBSOCKET_REVIEW.md` for detailed rationale of all changes.

---

## Overview

This plan defines the integration of WebSockets into the Composable Svelte architecture, following the same TCA-inspired dependency injection patterns established in the Web API system. WebSockets enable real-time, bidirectional communication for features like live updates, chat, notifications, and collaborative editing.

## Goals

1. **Dependency-Based Architecture**: WebSocket clients as injected dependencies
2. **Effect System Integration**: WebSocket operations as declarative effects with cleanup
3. **Connection Lifecycle Management**: Handle connect/disconnect/reconnect with state tracking
4. **Type-Safe Messaging**: Full TypeScript inference for message types
5. **Testing Support**: Mock and spy utilities for comprehensive testing
6. **Reconnection Strategy**: Automatic reconnection with exponential backoff
7. **Subscription Management**: Handle multiple channels/topics with clean APIs
8. **Error Recovery**: Graceful degradation and error handling

---

## Architectural Decisions

### 1. Subscription Cleanup: Effect.subscription()

**Decision**: Extend the Effect system with a new `Effect.subscription()` type.

**Rationale**:
- `Effect.run()` returns `void | Promise<void>` (no cleanup support)
- WebSockets need long-running subscriptions with cleanup
- Matches TCA's cancellable effects pattern
- Reusable for other long-running subscriptions (not just WebSocket)

**Impact**: Requires adding new Effect type to `packages/core/src/effect.ts`.

### 2. Architecture: Flat (No Separate ConnectionManager)

**Decision**: Fold connection management into `createLiveWebSocket()`.

**Rationale**:
- Simpler mental model (one client type)
- ConnectionManager was internal logic, not a public abstraction
- Matches Web API pattern (no separate RequestManager)
- Easier to maintain

**Impact**: No separate ConnectionManager export, all logic in LiveClient.

### 3. Message Structure: Flexible Generics

**Decision**: Make message structure flexible with generic type parameter.

**Rationale**:
- Different protocols use different formats (JSON-RPC, Protobuf, plain text)
- Users define their own message shape
- Provide optional default structure

**Impact**: `WebSocketClient<T>` is generic over message type.

### 4. Channel Routing: Optional Utility

**Decision**: Provide channel routing as separate utility, not built into client.

**Rationale**:
- Not all apps need channel/topic routing
- Keeps core client simple
- Can be added later without breaking changes

**Impact**: `createChannelRouter()` utility in separate file.

### 5. Platform Support: Browser-Only (v1)

**Decision**: Browser-only for v1, with adapter interface for future Node.js support.

**Rationale**:
- Most users are browser-first
- Native `WebSocket` API is simplest
- Node.js can be added via adapter pattern later

**Impact**: Document clearly as browser-only, provide adapter interface for future.

### 6. Naming: WebSocketMessageEvent (Not MessageEvent)

**Decision**: Avoid `MessageEvent` name (conflicts with browser API).

**Rationale**:
- `window.MessageEvent` is built-in type
- Causes ambiguous type errors
- Explicit naming is clearer

**Impact**: All event types prefixed with `WebSocket`.

---

## Architecture Overview

### Core Components

```
packages/core/src/websocket/
├── types.ts                    # Core types and interfaces
├── live-client.ts              # Production WebSocket implementation
├── channel-router.ts           # Optional channel/topic routing
├── heartbeat.ts                # Ping/pong health checks
├── message-queue.ts            # Offline message queuing
├── effect-websocket.ts         # Effect.websocket() helpers
├── testing/
│   ├── mock-client.ts         # Mock WebSocket for testing
│   └── spy-client.ts          # Spy wrapper for call tracking
└── index.ts                   # Public exports
```

### Effect System Extension

The WebSocket integration requires extending the Effect system:

```typescript
// Add to packages/core/src/types.ts
export type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action> }
  // ... other effect types

export type SubscriptionSetup<Action> = (dispatch: Dispatch<Action>) => SubscriptionCleanup;
export type SubscriptionCleanup = () => void | Promise<void>;
```

---

## Implementation Roadmap

### Week 1: Core WebSocket Client & Effect System Extension

**Deliverables**:
1. Extend Effect system with `Effect.subscription()`
2. Update Store to handle subscription lifecycle
3. WebSocket types and interfaces
4. Production WebSocket client implementation (`createLiveWebSocket()`)
5. Connection lifecycle with automatic reconnection
6. Connection state tracking

**Files**:
- `packages/core/src/types.ts` - Add Subscription effect type
- `packages/core/src/effect.ts` - Add Effect.subscription()
- `packages/core/src/store.svelte.ts` - Handle subscription cleanup
- `packages/core/src/websocket/types.ts` - Core types
- `packages/core/src/websocket/live-client.ts` - Production client
- `packages/core/tests/websocket/live-client.test.ts` - Client tests
- `packages/core/tests/websocket/connection.test.ts` - Connection tests

**Estimated Effort**: 3-4 days (includes Effect system changes)

### Week 2: Effect Integration & Testing Utilities

**Deliverables**:
1. Effect.websocket() helper functions
2. Type-safe message handling
3. Event transformation utilities
4. Mock WebSocket client
5. Spy WebSocket client

**Files**:
- `packages/core/src/websocket/effect-websocket.ts` - Effect helpers
- `packages/core/src/websocket/testing/mock-client.ts` - Mock client
- `packages/core/src/websocket/testing/spy-client.ts` - Spy client
- `packages/core/tests/websocket/effect-websocket.test.ts` - Effect tests
- `packages/core/tests/websocket/mock-client.test.ts` - Mock tests
- `packages/core/tests/websocket/spy-client.test.ts` - Spy tests

**Estimated Effort**: 2-3 days

### Week 3: Advanced Features & Channel Routing

**Deliverables**:
1. Ping/pong heartbeat mechanism
2. Message queuing for offline scenarios
3. Binary message support
4. Channel/topic routing utility
5. Integration tests with reducers

**Files**:
- `packages/core/src/websocket/heartbeat.ts` - Ping/pong handling
- `packages/core/src/websocket/message-queue.ts` - Offline queuing
- `packages/core/src/websocket/channel-router.ts` - Channel routing
- `packages/core/tests/websocket/heartbeat.test.ts` - Heartbeat tests
- `packages/core/tests/websocket/message-queue.test.ts` - Queue tests
- `packages/core/tests/websocket/integration.test.ts` - Integration tests

**Estimated Effort**: 2-3 days

---

## Detailed Specifications

### 1. Core Types

```typescript
// ============================================================================
// WebSocket Client Interface
// ============================================================================

/**
 * Generic WebSocket client interface.
 *
 * @template T - Message data type (default: unknown for maximum flexibility)
 *
 * **Platform**: Browser only (uses native WebSocket API)
 * **Node.js**: Use adapter pattern (see NodeWebSocketAdapter)
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
```

### 2. Production WebSocket Client

```typescript
// ============================================================================
// Live WebSocket Client (Browser)
// ============================================================================

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

  const stats: ConnectionStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    reconnects: 0,
    errors: 0,
    uptime: 0
  };

  // Listeners
  const messageListeners = new Set<MessageListener<T>>();
  const eventListeners = new Set<EventListener>();

  // Configuration with defaults
  const serializer = config?.serializer || JSONSerializer;
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
    } catch (error) {
      const wsError = new WebSocketError(
        `Failed to create WebSocket: ${error}`,
        WS_ERROR_CODES.CONNECTION_FAILED,
        true,
        error
      );
      updateState({ status: 'failed', lastError: wsError });
      stats.errors++;
      throw wsError;
    }

    return new Promise((resolve, reject) => {
      // Connection timeout
      connectionTimeoutTimer = setTimeout(() => {
        if (socket && socket.readyState === WebSocket.CONNECTING) {
          socket.close();
          const error = new WebSocketError(
            `Connection timeout after ${connectionTimeout}ms`,
            WS_ERROR_CODES.CONNECTION_TIMEOUT,
            true
          );
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

      socket!.onopen = () => {
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

      socket!.onerror = (event) => {
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }

        const error = new WebSocketError(
          'Connection failed',
          WS_ERROR_CODES.CONNECTION_FAILED,
          true,
          event
        );
        updateState({ status: 'failed', lastError: error });
        stats.errors++;

        notifyEventListeners({
          type: 'error',
          error,
          timestamp: Date.now()
        });

        reject(error);
      };

      socket!.onmessage = (event) => {
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

      socket!.onclose = (event) => {
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
        await connect(state.url!, state.protocols);
        stats.reconnects++;
        notifyEventListeners({
          type: 'reconnected',
          attempts: attempt,
          totalDelay: delay,
          timestamp: Date.now()
        });
      } catch (error) {
        // Reconnection failed, scheduleReconnect will be called by onclose
        console.warn(`[WebSocket] Reconnection attempt ${attempt} failed:`, error);
      }
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
    return () => messageListeners.delete(listener);
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
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
```

### 3. Effect Integration

```typescript
// ============================================================================
// Effect.websocket() Helpers
// ============================================================================

/**
 * Connect to a WebSocket server with automatic event subscription.
 *
 * **Cleanup**: Automatically disconnects when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param url - WebSocket URL
 * @param protocols - Optional WebSocket protocols
 * @param onEvent - Optional callback to transform events into actions
 *
 * @example
 * ```typescript
 * case 'connect':
 *   return [
 *     { ...state, connection: { ...state.connection, status: 'connecting' } },
 *     Effect.websocket.connect(
 *       deps.websocket,
 *       'websocket-connection',
 *       'wss://chat.example.com',
 *       undefined,
 *       (event) => ({ type: 'websocketEvent', event })
 *     )
 *   ];
 * ```
 */
export function connect<Action>(
  client: WebSocketClient,
  subscriptionId: string,
  url: string,
  protocols?: string[],
  onEvent?: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    let unsubscribe: Unsubscribe | undefined;

    // Subscribe to events if callback provided
    if (onEvent) {
      unsubscribe = client.subscribeToEvents((event) => {
        dispatch(onEvent(event));
      });
    }

    // Connect
    client.connect(url, protocols).catch((error) => {
      console.error('[WebSocket] Connection failed:', error);
    });

    // Return cleanup function
    return async () => {
      unsubscribe?.();
      await client.disconnect();
    };
  });
}

/**
 * Disconnect from a WebSocket server.
 *
 * @param client - WebSocket client instance
 * @param code - Optional close code
 * @param reason - Optional close reason
 *
 * @example
 * ```typescript
 * case 'disconnect':
 *   return [
 *     state,
 *     Effect.websocket.disconnect(deps.websocket)
 *   ];
 * ```
 */
export function disconnect<Action>(
  client: WebSocketClient,
  code?: number,
  reason?: string
): EffectType<Action> {
  return Effect.run(async () => {
    await client.disconnect(code, reason);
  });
}

/**
 * Send a message through WebSocket.
 *
 * @param client - WebSocket client instance
 * @param message - Message to send
 * @param onSuccess - Optional success callback
 * @param onFailure - Optional failure callback
 *
 * @example
 * ```typescript
 * case 'sendMessage':
 *   return [
 *     state,
 *     Effect.websocket.send(
 *       deps.websocket,
 *       { type: 'chat', text: state.draft },
 *       () => ({ type: 'messageSent' }),
 *       (error) => ({ type: 'messageFailed', error })
 *     )
 *   ];
 * ```
 */
export function send<T, Action>(
  client: WebSocketClient<T>,
  message: T,
  onSuccess?: () => Action,
  onFailure?: (error: WebSocketError) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    try {
      await client.send(message);
      if (onSuccess) {
        dispatch(onSuccess());
      }
    } catch (error) {
      if (onFailure) {
        const wsError = error instanceof WebSocketError
          ? error
          : new WebSocketError(
              String(error),
              WS_ERROR_CODES.SEND_FAILED,
              true,
              error
            );
        dispatch(onFailure(wsError));
      } else {
        // Re-throw if no failure handler
        throw error;
      }
    }
  });
}

/**
 * Subscribe to messages from WebSocket.
 *
 * **Cleanup**: Automatically unsubscribes when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param onMessage - Callback to transform messages into actions
 *
 * @example
 * ```typescript
 * case 'subscribeToMessages':
 *   return [
 *     state,
 *     Effect.websocket.subscribe(
 *       deps.websocket,
 *       'websocket-messages',
 *       (message) => ({ type: 'messageReceived', message: message.data })
 *     )
 *   ];
 * ```
 */
export function subscribe<T, Action>(
  client: WebSocketClient<T>,
  subscriptionId: string,
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    const unsubscribe = client.subscribe((message) => {
      dispatch(onMessage(message));
    });

    return unsubscribe;
  });
}

/**
 * Subscribe to connection events from WebSocket.
 *
 * **Cleanup**: Automatically unsubscribes when effect is cancelled.
 *
 * @param client - WebSocket client instance
 * @param subscriptionId - Unique ID for subscription cleanup
 * @param onEvent - Callback to transform events into actions
 *
 * @example
 * ```typescript
 * case 'subscribeToEvents':
 *   return [
 *     state,
 *     Effect.websocket.subscribeToEvents(
 *       deps.websocket,
 *       'websocket-events',
 *       (event) => ({ type: 'websocketEvent', event })
 *     )
 *   ];
 * ```
 */
export function subscribeToEvents<Action>(
  client: WebSocketClient,
  subscriptionId: string,
  onEvent: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    const unsubscribe = client.subscribeToEvents((event) => {
      dispatch(onEvent(event));
    });

    return unsubscribe;
  });
}

// ============================================================================
// Module Augmentation
// ============================================================================

// Extend Effect namespace with websocket helpers
declare module '../../effect.js' {
  interface Effect {
    websocket: {
      connect: typeof connect;
      disconnect: typeof disconnect;
      send: typeof send;
      subscribe: typeof subscribe;
      subscribeToEvents: typeof subscribeToEvents;
    };
  }
}

(Effect as any).websocket = {
  connect,
  disconnect,
  send,
  subscribe,
  subscribeToEvents
};
```

### 4. Testing Utilities

#### Mock Client

```typescript
// ============================================================================
// Mock WebSocket Client
// ============================================================================

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
export function createMockWebSocket<T = unknown>(
  config?: Partial<WebSocketConfig>
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

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    state = {
      ...state,
      status: 'connecting',
      url,
      protocols
    };

    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, config?.connectionTimeout || 10));

    state = {
      ...state,
      status: 'connected',
      connectedAt: new Date()
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
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
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
  }

  function subscribe(listener: MessageListener<T>): Unsubscribe {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function simulateMessage(data: T): void {
    const message: WebSocketMessage<T> = {
      data,
      timestamp: Date.now(),
      raw: JSON.stringify(data)
    };

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
    const event: WebSocketErrorEvent = {
      type: 'error',
      error,
      timestamp: Date.now()
    };
    simulateEvent(event);
  }

  function simulateDisconnect(code: number, reason: string): void {
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
        messagesSent: sentMessages.length,
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        reconnects: 0,
        errors: 0,
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
```

#### Spy Client

```typescript
// ============================================================================
// Spy WebSocket Client
// ============================================================================

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
   * All connection attempts.
   */
  readonly connections: RecordedConnection[];

  /**
   * All disconnections.
   */
  readonly disconnections: RecordedDisconnection[];

  /**
   * All sent messages.
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
  const sentMessages: T[] = [];
  const receivedMessages: WebSocketMessage<T>[] = [];

  async function connect(url: string, protocols?: string[]): Promise<void> {
    connections.push({ url, protocols, timestamp: Date.now() });
    return realClient.connect(url, protocols);
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    disconnections.push({ code, reason, timestamp: Date.now() });
    return realClient.disconnect(code, reason);
  }

  async function send(message: T): Promise<void> {
    sentMessages.push(message);
    return realClient.send(message);
  }

  function subscribe(listener: MessageListener<T>): Unsubscribe {
    return realClient.subscribe((message) => {
      receivedMessages.push(message);
      listener(message);
    });
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
```

### 5. Advanced Features

#### Heartbeat

```typescript
// ============================================================================
// Heartbeat (Ping/Pong)
// ============================================================================

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
export function createHeartbeat(
  client: WebSocketClient,
  config: HeartbeatConfig
): Heartbeat {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pongReceived = true;

  const pingMessage = config.pingMessage ?? 'PING';
  const pongMessage = config.pongMessage ?? 'PONG';

  function start(): void {
    if (intervalId || !config.enabled) return;

    pongReceived = true;

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

    // Listen for pong messages
    client.subscribe((message) => {
      if (message.data === pongMessage) {
        pongReceived = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    });
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pongReceived = true;
  }

  return {
    start,
    stop,
    get isRunning() { return intervalId !== null; }
  };
}
```

#### Message Queue

```typescript
// ============================================================================
// Message Queue (Offline Support)
// ============================================================================

export interface MessageQueue<T = unknown> {
  /**
   * Add message to queue.
   */
  enqueue(message: T): void;

  /**
   * Get all queued messages and clear queue.
   */
  flush(): T[];

  /**
   * Clear all queued messages.
   */
  clear(): void;

  /**
   * Current queue size.
   */
  readonly size: number;

  /**
   * Maximum queue size.
   */
  readonly maxSize: number;
}

/**
 * Create message queue for offline scenarios.
 *
 * @param maxSize - Maximum queue size (default: 100)
 * @returns Message queue
 *
 * @example
 * ```typescript
 * const queue = createMessageQueue(100);
 *
 * // Queue message when offline
 * queue.enqueue({ type: 'chat', text: 'Hello' });
 *
 * // Flush when connected
 * const messages = queue.flush();
 * messages.forEach(msg => client.send(msg));
 * ```
 */
export function createMessageQueue<T = unknown>(maxSize = 100): MessageQueue<T> {
  const queue: T[] = [];

  return {
    enqueue(message: T): void {
      if (queue.length >= maxSize) {
        queue.shift(); // Remove oldest
      }
      queue.push(message);
    },

    flush(): T[] {
      const messages = [...queue];
      queue.length = 0;
      return messages;
    },

    clear(): void {
      queue.length = 0;
    },

    get size() { return queue.length; },
    get maxSize() { return maxSize; }
  };
}

/**
 * Wrap WebSocket client with automatic message queuing.
 *
 * Messages sent while disconnected are queued and sent when reconnected.
 *
 * @param client - WebSocket client to wrap
 * @param queueSize - Maximum queue size (default: 100)
 * @returns Wrapped client with queuing
 *
 * @example
 * ```typescript
 * const baseClient = createLiveWebSocket();
 * const queuedClient = createQueuedWebSocket(baseClient, 100);
 *
 * // Send works even when disconnected (queues message)
 * await queuedClient.send({ type: 'chat', text: 'Hello' });
 *
 * // On reconnection, queued messages are automatically sent
 * ```
 */
export function createQueuedWebSocket<T = unknown>(
  client: WebSocketClient<T>,
  queueSize = 100
): WebSocketClient<T> {
  const queue = createMessageQueue<T>(queueSize);
  let isConnected = false;

  // Monitor connection state
  client.subscribeToEvents((event) => {
    if (event.type === 'connected') {
      isConnected = true;
      // Flush queued messages
      const messages = queue.flush();
      messages.forEach(msg => {
        client.send(msg).catch(console.error);
      });
    } else if (event.type === 'disconnected') {
      isConnected = false;
    }
  });

  return {
    ...client,
    async send(message: T): Promise<void> {
      if (isConnected) {
        return client.send(message);
      } else {
        // Queue message for later
        queue.enqueue(message);
      }
    }
  };
}
```

#### Channel Router

```typescript
// ============================================================================
// Channel/Topic Router
// ============================================================================

export interface ChannelRouter<T = unknown> {
  /**
   * Subscribe to a specific channel.
   */
  subscribe(channel: string, listener: MessageListener<T>): Unsubscribe;

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel: string): void;

  /**
   * Unsubscribe from all channels.
   */
  unsubscribeAll(): void;

  /**
   * Check if subscribed to channel.
   */
  isSubscribed(channel: string): boolean;

  /**
   * Get all subscribed channels.
   */
  getChannels(): string[];
}

/**
 * Create channel router for topic-based messaging.
 *
 * Routes messages to channel-specific listeners based on message type.
 *
 * @param client - WebSocket client
 * @param getChannel - Function to extract channel from message (default: uses message.data.type)
 * @returns Channel router
 *
 * @example
 * ```typescript
 * const router = createChannelRouter(client);
 *
 * // Subscribe to specific channels
 * router.subscribe('chat', (message) => {
 *   console.log('Chat message:', message.data);
 * });
 *
 * router.subscribe('notifications', (message) => {
 *   console.log('Notification:', message.data);
 * });
 *
 * // Messages automatically routed based on type
 * ```
 */
export function createChannelRouter<T = unknown>(
  client: WebSocketClient<T>,
  getChannel: (message: WebSocketMessage<T>) => string = (msg) => {
    if (typeof msg.data === 'object' && msg.data !== null && 'type' in msg.data) {
      return (msg.data as any).type;
    }
    return 'default';
  }
): ChannelRouter<T> {
  const subscriptions = new Map<string, Set<MessageListener<T>>>();

  // Subscribe to all messages from client
  client.subscribe((message) => {
    const channel = getChannel(message);
    const listeners = subscriptions.get(channel);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(message);
        } catch (error) {
          console.error(`[ChannelRouter] Error in listener for channel "${channel}":`, error);
        }
      });
    }
  });

  function subscribe(channel: string, listener: MessageListener<T>): Unsubscribe {
    let listeners = subscriptions.get(channel);
    if (!listeners) {
      listeners = new Set();
      subscriptions.set(channel, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        subscriptions.delete(channel);
      }
    };
  }

  function unsubscribe(channel: string): void {
    subscriptions.delete(channel);
  }

  function unsubscribeAll(): void {
    subscriptions.clear();
  }

  function isSubscribed(channel: string): boolean {
    return subscriptions.has(channel);
  }

  function getChannels(): string[] {
    return Array.from(subscriptions.keys());
  }

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    isSubscribed,
    getChannels
  };
}
```

---

## Usage Examples

### Example 1: Real-Time Chat (Fixed)

```typescript
// ============================================================================
// Chat Feature with WebSocket
// ============================================================================

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
}

interface ChatState {
  connection: ConnectionState;
  messages: ChatMessage[];
  users: string[];
  draft: string;
}

type ChatAction =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'updateDraft'; text: string }
  | { type: 'sendMessage' }
  | { type: 'websocketEvent'; event: WebSocketEvent }
  | { type: 'messageReceived'; message: ChatMessage };

interface ChatDependencies {
  websocket: WebSocketClient<ChatMessage>;
}

const initialState: ChatState = {
  connection: {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  },
  messages: [],
  users: [],
  draft: ''
};

const chatReducer: Reducer<ChatState, ChatAction, ChatDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'connect':
      return [
        { ...state, connection: { ...state.connection, status: 'connecting' } },
        Effect.batch(
          // Connect and subscribe to connection events
          Effect.websocket.connect(
            deps.websocket,
            'websocket-connection',
            'wss://chat.example.com',
            undefined,
            (event) => ({ type: 'websocketEvent', event })
          ),
          // Subscribe to incoming messages
          Effect.websocket.subscribe(
            deps.websocket,
            'websocket-messages',
            (message) => ({ type: 'messageReceived', message: message.data })
          )
        )
      ];

    case 'disconnect':
      return [
        state,
        Effect.batch(
          Effect.cancel('websocket-connection'),
          Effect.cancel('websocket-messages'),
          Effect.websocket.disconnect(deps.websocket)
        )
      ];

    case 'updateDraft':
      return [
        { ...state, draft: action.text },
        Effect.none()
      ];

    case 'sendMessage':
      if (!state.draft.trim()) {
        return [state, Effect.none()];
      }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        user: 'me',
        text: state.draft,
        timestamp: Date.now()
      };

      return [
        { ...state, draft: '', messages: [...state.messages, message] },
        Effect.websocket.send(
          deps.websocket,
          message,
          undefined,
          (error) => ({
            type: 'websocketEvent',
            event: { type: 'error', error, timestamp: Date.now() }
          })
        )
      ];

    case 'websocketEvent':
      return handleWebSocketEvent(state, action.event);

    case 'messageReceived':
      return [
        {
          ...state,
          messages: [...state.messages, action.message]
        },
        Effect.none()
      ];
  }
};

function handleWebSocketEvent(
  state: ChatState,
  event: WebSocketEvent
): [ChatState, Effect<ChatAction>] {
  switch (event.type) {
    case 'connected':
      return [
        {
          ...state,
          connection: {
            ...state.connection,
            status: 'connected',
            url: event.url,
            connectedAt: new Date(event.timestamp)
          }
        },
        Effect.none()
      ];

    case 'disconnected':
      return [
        {
          ...state,
          connection: {
            ...state.connection,
            status: 'disconnected',
            url: null
          }
        },
        Effect.none()
      ];

    case 'error':
      return [
        {
          ...state,
          connection: {
            ...state.connection,
            lastError: event.error
          }
        },
        Effect.none()
      ];

    case 'reconnecting':
      return [
        {
          ...state,
          connection: {
            ...state.connection,
            status: 'reconnecting',
            reconnectAttempts: event.attempt
          }
        },
        Effect.none()
      ];

    case 'reconnected':
      return [
        {
          ...state,
          connection: {
            ...state.connection,
            status: 'connected',
            reconnectAttempts: 0
          }
        },
        Effect.none()
      ];
  }
}
```

### Example 2: Live Notifications

```typescript
// ============================================================================
// Notifications Feature
// ============================================================================

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read?: boolean;
}

interface NotificationState {
  connection: ConnectionState;
  notifications: Notification[];
  unreadCount: number;
}

type NotificationAction =
  | { type: 'connectToNotifications' }
  | { type: 'markAsRead'; id: string }
  | { type: 'clearAll' }
  | { type: 'websocketEvent'; event: WebSocketEvent }
  | { type: 'notificationReceived'; notification: Notification };

const notificationReducer: Reducer<
  NotificationState,
  NotificationAction,
  { websocket: WebSocketClient<Notification> }
> = (state, action, deps) => {
  switch (action.type) {
    case 'connectToNotifications':
      return [
        { ...state, connection: { ...state.connection, status: 'connecting' } },
        Effect.batch(
          Effect.websocket.connect(
            deps.websocket,
            'notifications-connection',
            'wss://api.example.com/notifications',
            undefined,
            (event) => ({ type: 'websocketEvent', event })
          ),
          Effect.websocket.subscribe(
            deps.websocket,
            'notifications-messages',
            (message) => ({ type: 'notificationReceived', notification: message.data })
          )
        )
      ];

    case 'markAsRead':
      return [
        {
          ...state,
          notifications: state.notifications.map(n =>
            n.id === action.id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1)
        },
        Effect.websocket.send(
          deps.websocket,
          { type: 'mark_read', id: action.id } as any
        )
      ];

    case 'clearAll':
      return [
        { ...state, notifications: [], unreadCount: 0 },
        Effect.websocket.send(
          deps.websocket,
          { type: 'clear_all' } as any
        )
      ];

    case 'notificationReceived':
      return [
        {
          ...state,
          notifications: [action.notification, ...state.notifications],
          unreadCount: state.unreadCount + 1
        },
        Effect.none()
      ];

    case 'websocketEvent':
      // Handle connection events
      return [state, Effect.none()];
  }
};
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('WebSocketClient', () => {
  it('connects to server', async () => {
    const client = createMockWebSocket();
    await client.connect('wss://example.com');
    expect(client.state.status).toBe('connected');
  });

  it('sends messages when connected', async () => {
    const client = createMockWebSocket();
    await client.connect('wss://example.com');
    await client.send({ type: 'test', data: 'hello' });
    expect(client.sentMessages).toHaveLength(1);
  });

  it('throws error when sending while disconnected', async () => {
    const client = createMockWebSocket();
    await expect(
      client.send({ type: 'test' })
    ).rejects.toThrow(WebSocketError);
  });

  it('handles reconnection with exponential backoff', async () => {
    const client = createLiveWebSocket({
      reconnect: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false
      }
    });

    // Test reconnection logic
    await client.connect('wss://example.com');

    // Simulate unexpected disconnect
    client.disconnect(1006, '');

    // Verify reconnection attempts
    // ... test implementation
  });
});

describe('SpyWebSocket', () => {
  it('tracks all connections', async () => {
    const realClient = createMockWebSocket();
    const spyClient = createSpyWebSocket(realClient);

    await spyClient.connect('wss://example.com');
    await spyClient.connect('wss://other.com');

    expect(spyClient.connections).toHaveLength(2);
    expect(spyClient.connectionsTo('wss://example.com')).toBe(1);
  });

  it('tracks all sent messages', async () => {
    const realClient = createMockWebSocket();
    const spyClient = createSpyWebSocket(realClient);

    await spyClient.connect('wss://example.com');
    await spyClient.send({ type: 'msg1' });
    await spyClient.send({ type: 'msg2' });

    expect(spyClient.sentMessages).toHaveLength(2);
  });
});
```

### Integration Tests

```typescript
describe('Chat Reducer with WebSocket', () => {
  it('handles full chat flow', async () => {
    const mockWS = createMockWebSocket<ChatMessage>();
    const store = createStore({
      initialState,
      reducer: chatReducer,
      dependencies: { websocket: mockWS }
    });

    // Connect
    await store.send({ type: 'connect' });
    expect(store.state.connection.status).toBe('connected');

    // Send message
    await store.send({ type: 'updateDraft', text: 'Hello!' });
    await store.send({ type: 'sendMessage' });

    expect(mockWS.sentMessages).toHaveLength(1);
    expect(store.state.messages).toHaveLength(1);

    // Simulate incoming message
    mockWS.simulateMessage({
      id: '2',
      user: 'other',
      text: 'Hi!',
      timestamp: Date.now()
    });

    await store.receive({ type: 'messageReceived', message: expect.any(Object) });
    expect(store.state.messages).toHaveLength(2);

    // Disconnect
    await store.send({ type: 'disconnect' });
    expect(store.state.connection.status).toBe('disconnected');
  });
});
```

---

## Success Criteria

- [x] **Effect System Extension**: Effect.subscription() added and documented
- [ ] **WebSocket Client Interface**: Complete and well-typed
- [ ] **Live Client Implementation**: Production-ready with reconnection
- [ ] **Connection Management**: Lifecycle, reconnection, state tracking
- [ ] **Effect Integration**: Effect.websocket() helpers
- [ ] **Testing Utilities**: Mock and spy clients
- [ ] **Heartbeat**: Ping/pong health monitoring
- [ ] **Message Queue**: Offline message queuing
- [ ] **Channel Router**: Topic-based message routing
- [ ] **Error Handling**: Graceful degradation and recovery
- [ ] **Type Safety**: Full TypeScript inference
- [ ] **Documentation**: Comprehensive API docs and examples
- [ ] **Test Coverage**: >90% coverage with 100+ tests
- [ ] **Examples**: Real-world chat and notification examples

---

## Future Enhancements (Post-v1)

1. **Node.js Support**: WebSocket adapter for Node.js environments
2. **Protocol Support**: Socket.IO, STOMP, MQTT adapters
3. **Compression**: Per-message deflate support
4. **Binary Protocols**: Protocol Buffers, MessagePack serializers
5. **Advanced Routing**: Pattern-based message routing with regex
6. **Presence System**: User presence tracking and status updates
7. **Connection Pooling**: Multiple connections for load balancing
8. **Message Persistence**: Local storage for offline support
9. **Rate Limiting**: Client-side rate limiting and throttling
10. **Metrics**: Connection quality metrics and monitoring

---

## References

- **WebSocket API**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **RFC 6455**: The WebSocket Protocol specification
- **Web API Plan**: `plans/phase-8/web-api.md` - Similar patterns for consistency
- **Effect System**: `packages/core/src/effect.ts` - Integration patterns
- **Testing Patterns**: `packages/core/tests/api/` - Similar test structure
- **Code Review**: `plans/phase-8/WEBSOCKET_REVIEW.md` - Detailed analysis and rationale

---

**Status**: Ready for review and implementation.
**Next Steps**: Review revised plan, approve architectural decisions, begin Week 1 implementation.
