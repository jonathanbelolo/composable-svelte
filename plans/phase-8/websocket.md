# WebSocket Integration Plan

**Status**: 📋 Planning
**Started**: 2025-11-03
**Target**: TBD

## Overview

This plan defines the integration of WebSockets into the Composable Svelte architecture, following the same TCA-inspired dependency injection patterns established in the Web API system. WebSockets enable real-time, bidirectional communication for features like live updates, chat, notifications, and collaborative editing.

## Goals

1. **Dependency-Based Architecture**: WebSocket clients as injected dependencies
2. **Effect System Integration**: WebSocket operations as declarative effects
3. **Connection Lifecycle Management**: Handle connect/disconnect/reconnect with state tracking
4. **Type-Safe Messaging**: Full TypeScript inference for message types
5. **Testing Support**: Mock and spy utilities for comprehensive testing
6. **Reconnection Strategy**: Automatic reconnection with exponential backoff
7. **Subscription Management**: Handle multiple channels/topics with clean APIs
8. **Error Recovery**: Graceful degradation and error handling

## Architecture Overview

### Core Components

```
packages/core/src/websocket/
├── types.ts                    # Core types and interfaces
├── client.ts                   # WebSocketClient interface
├── live-client.ts              # Production WebSocket implementation
├── connection-manager.ts       # Connection lifecycle and reconnection
├── subscription-manager.ts     # Channel/topic subscription handling
├── effect-websocket.ts         # Effect.websocket() helpers
├── testing/
│   ├── mock-client.ts         # Mock WebSocket for testing
│   └── spy-client.ts          # Spy wrapper for call tracking
└── index.ts                   # Public exports
```

## Design Principles

### 1. Dependency Injection Pattern

WebSocket clients are injected as dependencies, exactly like API clients:

```typescript
interface Dependencies {
  websocket: WebSocketClient;
}

const chatReducer: Reducer<ChatState, ChatAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'connectToChat':
      return [
        { ...state, connectionState: 'connecting' },
        Effect.websocket.connect(deps.websocket, 'wss://chat.example.com')
      ];

    case 'sendMessage':
      return [
        state,
        Effect.websocket.send(deps.websocket, { type: 'message', text: action.text })
      ];

    case 'websocket':
      return handleWebSocketEvent(state, action.event);
  }
};
```

### 2. Event-Driven Architecture

WebSocket events flow through actions:

```typescript
type WebSocketEvent<T = unknown> =
  | { type: 'connected'; url: string }
  | { type: 'disconnected'; code: number; reason: string }
  | { type: 'message'; data: T }
  | { type: 'error'; error: WebSocketError }
  | { type: 'reconnecting'; attempt: number; delay: number };

type ChatAction =
  | { type: 'connectToChat' }
  | { type: 'sendMessage'; text: string }
  | { type: 'websocket'; event: WebSocketEvent<ChatMessage> }
  | { type: 'typing'; user: string };
```

### 3. Connection State Management

Track connection lifecycle in reducer state:

```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  url: string | null;
  reconnectAttempts: number;
  lastError: WebSocketError | null;
  connectedAt: Date | null;
}

interface ChatState {
  connection: ConnectionState;
  messages: ChatMessage[];
  activeUsers: User[];
}
```

## Implementation Roadmap

### Week 1: Core WebSocket Client & Connection Management

**Deliverables**:
- WebSocket client interface and types
- Production WebSocket client implementation
- Connection lifecycle management
- Reconnection strategy with exponential backoff
- Connection state tracking

**Files**:
- `packages/core/src/websocket/types.ts` - Core types
- `packages/core/src/websocket/client.ts` - WebSocketClient interface
- `packages/core/src/websocket/live-client.ts` - Production client
- `packages/core/src/websocket/connection-manager.ts` - Lifecycle management
- `packages/core/tests/websocket/connection.test.ts` - Connection tests

**Estimated Effort**: 2-3 days

### Week 2: Subscription Management & Effect Integration

**Deliverables**:
- Subscription/channel management system
- Message routing and filtering
- Effect.websocket() helper functions
- Type-safe message handling
- Event transformation utilities

**Files**:
- `packages/core/src/websocket/subscription-manager.ts` - Subscription handling
- `packages/core/src/websocket/effect-websocket.ts` - Effect helpers
- `packages/core/tests/websocket/subscriptions.test.ts` - Subscription tests
- `packages/core/tests/websocket/effect-websocket.test.ts` - Effect tests

**Estimated Effort**: 2-3 days

### Week 3: Testing Utilities & Advanced Features

**Deliverables**:
- Mock WebSocket client for testing
- Spy WebSocket client for call tracking
- Ping/pong heartbeat mechanism
- Message queuing for offline scenarios
- Binary message support

**Files**:
- `packages/core/src/websocket/testing/mock-client.ts` - Mock client
- `packages/core/src/websocket/testing/spy-client.ts` - Spy client
- `packages/core/src/websocket/heartbeat.ts` - Ping/pong handling
- `packages/core/src/websocket/message-queue.ts` - Offline queuing
- `packages/core/tests/websocket/mock-client.test.ts` - Mock tests
- `packages/core/tests/websocket/spy-client.test.ts` - Spy tests

**Estimated Effort**: 2-3 days

## Detailed Specifications

### 1. Core Types

```typescript
// ============================================================================
// WebSocket Client Interface
// ============================================================================

export interface WebSocketClient {
  /**
   * Connect to a WebSocket server
   */
  connect(url: string, protocols?: string[]): Promise<void>;

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(code?: number, reason?: string): Promise<void>;

  /**
   * Send a message through the WebSocket
   */
  send<T>(message: T): Promise<void>;

  /**
   * Subscribe to messages from the WebSocket
   */
  subscribe<T>(listener: MessageListener<T>): Unsubscribe;

  /**
   * Subscribe to connection events
   */
  subscribeToEvents(listener: EventListener): Unsubscribe;

  /**
   * Get current connection state
   */
  readonly state: ConnectionState;

  /**
   * Get connection statistics
   */
  readonly stats: ConnectionStats;
}

// ============================================================================
// Message Types
// ============================================================================

export interface WebSocketMessage<T = unknown> {
  readonly type: string;
  readonly data: T;
  readonly timestamp: number;
  readonly id?: string;
}

export type MessageListener<T> = (message: WebSocketMessage<T>) => void;
export type EventListener = (event: WebSocketEvent) => void;
export type Unsubscribe = () => void;

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
  readonly byteSent: number;
  readonly bytesReceived: number;
  readonly reconnects: number;
  readonly errors: number;
  readonly uptime: number; // milliseconds
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WebSocketEvent<T = unknown> =
  | ConnectedEvent
  | DisconnectedEvent
  | MessageEvent<T>
  | ErrorEvent
  | ReconnectingEvent
  | ReconnectedEvent;

export interface ConnectedEvent {
  readonly type: 'connected';
  readonly url: string;
  readonly protocols: string[];
  readonly timestamp: number;
}

export interface DisconnectedEvent {
  readonly type: 'disconnected';
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
  readonly timestamp: number;
}

export interface MessageEvent<T> {
  readonly type: 'message';
  readonly data: T;
  readonly timestamp: number;
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly error: WebSocketError;
  readonly timestamp: number;
}

export interface ReconnectingEvent {
  readonly type: 'reconnecting';
  readonly attempt: number;
  readonly delay: number;
  readonly maxAttempts: number;
  readonly timestamp: number;
}

export interface ReconnectedEvent {
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
  PROTOCOL_ERROR: 'WS_PROTOCOL_ERROR'
} as const;

// ============================================================================
// Configuration
// ============================================================================

export interface WebSocketConfig {
  /**
   * WebSocket URL
   */
  readonly url: string;

  /**
   * WebSocket protocols
   */
  readonly protocols?: string[];

  /**
   * Reconnection strategy
   */
  readonly reconnect?: ReconnectConfig;

  /**
   * Heartbeat configuration
   */
  readonly heartbeat?: HeartbeatConfig;

  /**
   * Message serialization
   */
  readonly serializer?: MessageSerializer;

  /**
   * Connection timeout (ms)
   */
  readonly connectionTimeout?: number;

  /**
   * Message queue size for offline scenarios
   */
  readonly queueSize?: number;
}

export interface ReconnectConfig {
  /**
   * Enable automatic reconnection
   */
  readonly enabled: boolean;

  /**
   * Maximum reconnection attempts (0 = infinite)
   */
  readonly maxAttempts: number;

  /**
   * Initial delay between reconnection attempts (ms)
   */
  readonly initialDelay: number;

  /**
   * Maximum delay between attempts (ms)
   */
  readonly maxDelay: number;

  /**
   * Backoff multiplier
   */
  readonly backoffMultiplier: number;

  /**
   * Add random jitter to delays
   */
  readonly jitter: boolean;
}

export interface HeartbeatConfig {
  /**
   * Enable heartbeat/ping-pong
   */
  readonly enabled: boolean;

  /**
   * Interval between pings (ms)
   */
  readonly interval: number;

  /**
   * Timeout for pong response (ms)
   */
  readonly timeout: number;

  /**
   * Ping message
   */
  readonly pingMessage?: unknown;

  /**
   * Expected pong message
   */
  readonly pongMessage?: unknown;
}

export interface MessageSerializer {
  serialize<T>(message: T): string | ArrayBuffer | Blob;
  deserialize<T>(data: string | ArrayBuffer | Blob): T;
}
```

### 2. Effect Integration

```typescript
// ============================================================================
// Effect.websocket() Helpers
// ============================================================================

/**
 * Connect to a WebSocket server
 */
export function connect<Action>(
  client: WebSocketClient,
  url: string,
  protocols?: string[],
  onEvent?: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    // Subscribe to events before connecting
    const unsubscribe = onEvent
      ? client.subscribeToEvents((event) => dispatch(onEvent(event)))
      : undefined;

    try {
      await client.connect(url, protocols);
    } catch (error) {
      unsubscribe?.();
      throw error;
    }
  });
}

/**
 * Disconnect from a WebSocket server
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
 * Send a message through WebSocket
 */
export function send<T, Action>(
  client: WebSocketClient,
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
      }
    }
  });
}

/**
 * Subscribe to messages from WebSocket
 */
export function subscribe<T, Action>(
  client: WebSocketClient,
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    const unsubscribe = client.subscribe<T>((message) => {
      dispatch(onMessage(message));
    });

    // Return cleanup function
    return unsubscribe;
  });
}

/**
 * Subscribe to connection events
 */
export function subscribeToEvents<Action>(
  client: WebSocketClient,
  onEvent: (event: WebSocketEvent) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    const unsubscribe = client.subscribeToEvents((event) => {
      dispatch(onEvent(event));
    });

    return unsubscribe;
  });
}

// Augment Effect namespace
declare module '../effect.js' {
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

### 3. Connection Manager

```typescript
// ============================================================================
// Connection Lifecycle Management
// ============================================================================

export interface ConnectionManager {
  connect(url: string, protocols?: string[]): Promise<void>;
  disconnect(code?: number, reason?: string): Promise<void>;
  reconnect(): Promise<void>;
  readonly state: ConnectionState;
  readonly isConnected: boolean;
  onStateChange(listener: (state: ConnectionState) => void): Unsubscribe;
}

export function createConnectionManager(
  socket: WebSocket,
  config: ReconnectConfig
): ConnectionManager {
  let state: ConnectionState = {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  };

  const listeners: Array<(state: ConnectionState) => void> = [];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function updateState(updates: Partial<ConnectionState>): void {
    state = { ...state, ...updates };
    listeners.forEach(listener => listener(state));
  }

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    if (state.status === 'connected' || state.status === 'connecting') {
      throw new WebSocketError(
        'Already connected or connecting',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    updateState({
      status: 'connecting',
      url,
      protocols,
      reconnectAttempts: 0
    });

    return new Promise((resolve, reject) => {
      socket.onopen = () => {
        updateState({
          status: 'connected',
          connectedAt: new Date(),
          lastError: null
        });
        resolve();
      };

      socket.onerror = (event) => {
        const error = new WebSocketError(
          'Connection failed',
          WS_ERROR_CODES.CONNECTION_FAILED,
          true,
          event
        );
        updateState({
          status: 'failed',
          lastError: error
        });
        reject(error);
      };
    });
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(code, reason);
    }

    updateState({
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      connectedAt: null
    });
  }

  async function reconnect(): Promise<void> {
    if (!state.url) {
      throw new WebSocketError(
        'No URL to reconnect to',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    if (!config.enabled) {
      throw new WebSocketError(
        'Reconnection is disabled',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    const attempt = state.reconnectAttempts + 1;

    if (config.maxAttempts > 0 && attempt > config.maxAttempts) {
      throw new WebSocketError(
        `Max reconnection attempts (${config.maxAttempts}) exceeded`,
        WS_ERROR_CODES.MAX_RECONNECTS,
        false
      );
    }

    // Calculate delay with exponential backoff
    const baseDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const delay = Math.min(baseDelay, config.maxDelay);
    const jitter = config.jitter ? delay * Math.random() * 0.3 : 0;
    const totalDelay = delay + jitter;

    updateState({
      status: 'reconnecting',
      reconnectAttempts: attempt
    });

    await new Promise(resolve => setTimeout(resolve, totalDelay));

    try {
      await connect(state.url, state.protocols);
    } catch (error) {
      // Schedule next reconnect
      if (config.maxAttempts === 0 || attempt < config.maxAttempts) {
        reconnectTimer = setTimeout(() => reconnect(), 0);
      }
      throw error;
    }
  }

  function onStateChange(listener: (state: ConnectionState) => void): Unsubscribe {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  }

  return {
    connect,
    disconnect,
    reconnect,
    get state() { return state; },
    get isConnected() { return state.status === 'connected'; },
    onStateChange
  };
}
```

### 4. Subscription Management

```typescript
// ============================================================================
// Channel/Topic Subscription Management
// ============================================================================

export interface SubscriptionManager {
  subscribe<T>(channel: string, listener: MessageListener<T>): Unsubscribe;
  unsubscribe(channel: string): void;
  unsubscribeAll(): void;
  isSubscribed(channel: string): boolean;
  getChannels(): string[];
  dispatch<T>(channel: string, message: WebSocketMessage<T>): void;
}

export function createSubscriptionManager(): SubscriptionManager {
  const subscriptions = new Map<string, Set<MessageListener<any>>>();

  function subscribe<T>(
    channel: string,
    listener: MessageListener<T>
  ): Unsubscribe {
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

  function dispatch<T>(channel: string, message: WebSocketMessage<T>): void {
    const listeners = subscriptions.get(channel);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(message);
        } catch (error) {
          console.error(`[WebSocket] Error in listener for channel "${channel}":`, error);
        }
      });
    }
  }

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    isSubscribed,
    getChannels,
    dispatch
  };
}
```

### 5. Testing Utilities

```typescript
// ============================================================================
// Mock WebSocket Client
// ============================================================================

export interface MockWebSocketClient extends WebSocketClient {
  simulateMessage<T>(message: WebSocketMessage<T>): void;
  simulateEvent(event: WebSocketEvent): void;
  simulateError(error: WebSocketError): void;
  simulateDisconnect(code: number, reason: string): void;
  readonly sentMessages: unknown[];
  reset(): void;
}

export function createMockWebSocket(
  config?: Partial<WebSocketConfig>
): MockWebSocketClient {
  let state: ConnectionState = {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  };

  const messageListeners: MessageListener<any>[] = [];
  const eventListeners: EventListener[] = [];
  const sentMessages: unknown[] = [];

  async function connect(url: string, protocols: string[] = []): Promise<void> {
    state = {
      ...state,
      status: 'connecting',
      url,
      protocols
    };

    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, 10));

    state = {
      ...state,
      status: 'connected',
      connectedAt: new Date()
    };

    const event: ConnectedEvent = {
      type: 'connected',
      url,
      protocols,
      timestamp: Date.now()
    };

    eventListeners.forEach(listener => listener(event));
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
      const event: DisconnectedEvent = {
        type: 'disconnected',
        code,
        reason,
        wasClean: true,
        timestamp: Date.now()
      };

      eventListeners.forEach(listener => listener(event));
    }
  }

  async function send<T>(message: T): Promise<void> {
    if (state.status !== 'connected') {
      throw new WebSocketError(
        'Not connected',
        WS_ERROR_CODES.SEND_FAILED,
        true
      );
    }

    sentMessages.push(message);
  }

  function subscribe<T>(listener: MessageListener<T>): Unsubscribe {
    messageListeners.push(listener);
    return () => {
      const index = messageListeners.indexOf(listener);
      if (index >= 0) {
        messageListeners.splice(index, 1);
      }
    };
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    eventListeners.push(listener);
    return () => {
      const index = eventListeners.indexOf(listener);
      if (index >= 0) {
        eventListeners.splice(index, 1);
      }
    };
  }

  function simulateMessage<T>(message: WebSocketMessage<T>): void {
    messageListeners.forEach(listener => listener(message));
  }

  function simulateEvent(event: WebSocketEvent): void {
    eventListeners.forEach(listener => listener(event));
  }

  function simulateError(error: WebSocketError): void {
    state = { ...state, lastError: error };
    const event: ErrorEvent = {
      type: 'error',
      error,
      timestamp: Date.now()
    };
    eventListeners.forEach(listener => listener(event));
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

    const event: DisconnectedEvent = {
      type: 'disconnected',
      code,
      reason,
      wasClean: false,
      timestamp: Date.now()
    };

    eventListeners.forEach(listener => listener(event));
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
    messageListeners.length = 0;
    eventListeners.length = 0;
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
        byteSent: 0,
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

## Usage Examples

### Example 1: Real-Time Chat

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
  | { type: 'websocket'; event: WebSocketEvent<ChatMessage> };

interface ChatDependencies {
  websocket: WebSocketClient;
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
          Effect.websocket.connect(
            deps.websocket,
            'wss://chat.example.com',
            undefined,
            (event) => ({ type: 'websocket', event })
          ),
          Effect.websocket.subscribe(
            deps.websocket,
            (message) => ({
              type: 'websocket',
              event: { type: 'message', data: message.data, timestamp: message.timestamp }
            })
          )
        )
      ];

    case 'disconnect':
      return [
        state,
        Effect.websocket.disconnect(deps.websocket)
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
            type: 'websocket',
            event: { type: 'error', error, timestamp: Date.now() }
          })
        )
      ];

    case 'websocket':
      return handleWebSocketEvent(state, action.event);
  }
};

function handleWebSocketEvent(
  state: ChatState,
  event: WebSocketEvent<ChatMessage>
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

    case 'message':
      return [
        {
          ...state,
          messages: [...state.messages, event.data]
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
  | { type: 'websocket'; event: WebSocketEvent<Notification> };

const notificationReducer: Reducer<
  NotificationState,
  NotificationAction,
  { websocket: WebSocketClient }
> = (state, action, deps) => {
  switch (action.type) {
    case 'connectToNotifications':
      return [
        { ...state, connection: { ...state.connection, status: 'connecting' } },
        Effect.batch(
          Effect.websocket.connect(
            deps.websocket,
            'wss://api.example.com/notifications',
            undefined,
            (event) => ({ type: 'websocket', event })
          ),
          Effect.websocket.subscribe(
            deps.websocket,
            (message) => ({
              type: 'websocket',
              event: { type: 'message', data: message.data, timestamp: message.timestamp }
            })
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
          { type: 'mark_read', id: action.id }
        )
      ];

    case 'clearAll':
      return [
        { ...state, notifications: [], unreadCount: 0 },
        Effect.websocket.send(
          deps.websocket,
          { type: 'clear_all' }
        )
      ];

    case 'websocket':
      if (action.event.type === 'message') {
        return [
          {
            ...state,
            notifications: [action.event.data, ...state.notifications],
            unreadCount: state.unreadCount + 1
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
  }
};
```

## Testing Strategy

### Unit Tests

Test each component in isolation:

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
});

describe('ConnectionManager', () => {
  it('reconnects with exponential backoff', async () => {
    const config: ReconnectConfig = {
      enabled: true,
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false
    };

    // Test reconnection logic
  });
});
```

### Integration Tests

Test WebSocket integration with reducers:

```typescript
describe('Chat Reducer with WebSocket', () => {
  it('handles full chat flow', async () => {
    const mockWS = createMockWebSocket();
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
      type: 'message',
      data: { id: '2', user: 'other', text: 'Hi!', timestamp: Date.now() },
      timestamp: Date.now()
    });

    await store.receive({ type: 'websocket', event: expect.any(Object) });
    expect(store.state.messages).toHaveLength(2);
  });
});
```

## Success Criteria

- [ ] **WebSocket Client Interface**: Complete and well-typed
- [ ] **Connection Management**: Lifecycle, reconnection, state tracking
- [ ] **Subscription Management**: Channel/topic subscriptions
- [ ] **Effect Integration**: Effect.websocket() helpers
- [ ] **Testing Utilities**: Mock and spy clients
- [ ] **Error Handling**: Graceful degradation and recovery
- [ ] **Type Safety**: Full TypeScript inference
- [ ] **Documentation**: Comprehensive API docs and examples
- [ ] **Test Coverage**: >90% coverage with 100+ tests
- [ ] **Examples**: Real-world chat and notification examples

## Future Enhancements (Post-v1)

1. **Protocol Support**: Socket.IO, STOMP, MQTT adapters
2. **Compression**: Per-message deflate support
3. **Binary Protocols**: Protocol Buffers, MessagePack
4. **Advanced Routing**: Pattern-based message routing
5. **Presence System**: User presence tracking
6. **Connection Pooling**: Multiple connections for load balancing
7. **Message Persistence**: Local storage for offline support
8. **Rate Limiting**: Client-side rate limiting and throttling

## References

- **WebSocket API**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **RFC 6455**: The WebSocket Protocol specification
- **Web API Plan**: `plans/phase-8/web-api.md` - Similar patterns for consistency
- **Effect System**: `packages/core/src/effect.ts` - Integration patterns
- **Testing Patterns**: `packages/core/tests/api/` - Similar test structure

---

**Next Steps**: Review this plan, gather feedback, and begin Week 1 implementation.
