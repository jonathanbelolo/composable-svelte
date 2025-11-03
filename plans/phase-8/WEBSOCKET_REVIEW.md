# WebSocket Integration Plan - Code Review

**Reviewer**: Claude Code
**Date**: 2025-11-03
**Status**: ❌ **NEEDS MAJOR REVISION**
**Overall Grade**: C- (Requires significant changes before implementation)

## Executive Summary

The WebSocket plan has good intentions and follows many TCA patterns, but contains **critical architectural flaws** that would cause bugs and memory leaks in production. The plan needs major revisions in 5 key areas before implementation can begin.

### Critical Issues Summary

| Category | Count | Severity |
|----------|-------|----------|
| **Critical** (Must Fix) | 6 | 🔴 Blocks implementation |
| **Major** (Should Fix) | 8 | 🟡 Causes bugs/confusion |
| **Minor** (Nice to Fix) | 8 | 🟢 Polish/completeness |

**Recommendation**: **DO NOT BEGIN IMPLEMENTATION** until critical and major issues are resolved.

---

## Critical Issues (🔴 Must Fix Before Implementation)

### 🔴 Issue #1: ConnectionManager Architectural Flaw

**Location**: `websocket.md` line 594
```typescript
export function createConnectionManager(
  socket: WebSocket,  // ❌ PRE-CREATED SOCKET
  config: ReconnectConfig
): ConnectionManager
```

**Problem**: ConnectionManager receives a pre-created WebSocket instance, but:
1. WebSocket is a **stateful object** that cannot be reused after closing
2. Reconnection requires creating a **new WebSocket instance**
3. The current design has no way to create new instances

**Impact**: Reconnection will fail 100% of the time after first disconnect.

**Fix Required**:
```typescript
export function createConnectionManager(
  config: WebSocketConfig & { reconnect: ReconnectConfig }
): ConnectionManager {
  let socket: WebSocket | null = null;

  async function connect(url: string, protocols?: string[]): Promise<void> {
    // Create NEW WebSocket instance for each connection
    socket = new WebSocket(url, protocols);

    return new Promise((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = (err) => reject(err);
    });
  }

  async function reconnect(): Promise<void> {
    // Clean up old socket
    if (socket) {
      socket.close();
      socket = null;
    }
    // Create new connection
    await connect(state.url!, state.protocols);
  }

  return { connect, reconnect, disconnect, ... };
}
```

---

### 🔴 Issue #2: Effect.run() Doesn't Support Cleanup Functions

**Location**: `websocket.md` lines 529-536, 546-551

**Problem**: The plan tries to return cleanup functions from Effect.run():
```typescript
export function subscribe<T, Action>(
  client: WebSocketClient,
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.run(async (dispatch) => {
    const unsubscribe = client.subscribe<T>((message) => {
      dispatch(onMessage(message));
    });

    // Return cleanup function
    return unsubscribe;  // ❌ Effect.run() returns void | Promise<void>
  });
}
```

**Actual EffectExecutor signature** (`packages/core/src/types.ts:32-34`):
```typescript
export type EffectExecutor<Action> = (
  dispatch: Dispatch<Action>
) => void | Promise<void>;  // ❌ NO RETURN VALUE
```

**Impact**:
- Subscriptions will **never be cleaned up**
- **Memory leaks** in every component using WebSockets
- **Multiple subscriptions** will accumulate over time

**Fix Required**: Use `Effect.cancellable()` for subscriptions with explicit cleanup:

```typescript
export function subscribe<T, Action>(
  client: WebSocketClient,
  subscriptionId: string,  // Unique ID for cancellation
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.cancellable(subscriptionId, async (dispatch) => {
    const unsubscribe = client.subscribe<T>((message) => {
      dispatch(onMessage(message));
    });

    // Store cleanup for when effect is cancelled
    return { cleanup: unsubscribe };
  });
}

// Users must manually cancel subscription:
case 'disconnect':
  return [
    state,
    Effect.cancel('websocket-subscription')
  ];
```

**Alternative**: Add a new `Effect.subscription()` type to the Effect system specifically for long-running subscriptions with cleanup.

---

### 🔴 Issue #3: Missing Live Client Implementation

**Location**: `websocket.md` - References `live-client.ts` but no implementation

**Problem**: The plan provides:
- ✅ `WebSocketClient` interface
- ✅ `createMockWebSocket()` for testing
- ❌ **No production implementation**

**Impact**: Cannot implement Week 1 deliverables without this critical component.

**Fix Required**: Add complete `createLiveWebSocket()` implementation:

```typescript
export function createLiveWebSocket(
  config: WebSocketConfig
): WebSocketClient {
  let socket: WebSocket | null = null;
  let state: ConnectionState = {
    status: 'disconnected',
    url: null,
    protocols: [],
    reconnectAttempts: 0,
    lastError: null,
    connectedAt: null
  };

  const messageListeners: Set<MessageListener<any>> = new Set();
  const eventListeners: Set<EventListener> = new Set();
  const stats: ConnectionStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    reconnects: 0,
    errors: 0,
    uptime: 0
  };

  async function connect(url: string, protocols?: string[]): Promise<void> {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      throw new WebSocketError(
        'Already connected or connecting',
        WS_ERROR_CODES.CONNECTION_FAILED,
        false
      );
    }

    // Create new WebSocket
    socket = new WebSocket(url, protocols);
    state = { ...state, status: 'connecting', url, protocols: protocols || [] };

    return new Promise((resolve, reject) => {
      const connectionTimeout = config.connectionTimeout || 10000;
      const timeoutId = setTimeout(() => {
        socket?.close();
        const error = new WebSocketError(
          'Connection timeout',
          WS_ERROR_CODES.CONNECTION_TIMEOUT,
          true
        );
        state = { ...state, status: 'failed', lastError: error };
        notifyEventListeners({ type: 'error', error, timestamp: Date.now() });
        reject(error);
      }, connectionTimeout);

      socket.onopen = () => {
        clearTimeout(timeoutId);
        state = {
          ...state,
          status: 'connected',
          connectedAt: new Date(),
          lastError: null
        };
        notifyEventListeners({
          type: 'connected',
          url,
          protocols: protocols || [],
          timestamp: Date.now()
        });
        resolve();
      };

      socket.onerror = (event) => {
        clearTimeout(timeoutId);
        const error = new WebSocketError(
          'Connection failed',
          WS_ERROR_CODES.CONNECTION_FAILED,
          true,
          event
        );
        state = { ...state, status: 'failed', lastError: error };
        stats.errors++;
        notifyEventListeners({ type: 'error', error, timestamp: Date.now() });
        reject(error);
      };

      socket.onmessage = (event) => {
        stats.messagesReceived++;
        stats.bytesReceived += event.data.length || 0;

        // Parse message
        try {
          const data = config.serializer
            ? config.serializer.deserialize(event.data)
            : JSON.parse(event.data);

          const message: WebSocketMessage<any> = {
            type: data.type || 'message',
            data: data.data !== undefined ? data.data : data,
            timestamp: Date.now(),
            id: data.id
          };

          notifyMessageListeners(message);
        } catch (error) {
          const wsError = new WebSocketError(
            'Invalid message format',
            WS_ERROR_CODES.INVALID_MESSAGE,
            true,
            error
          );
          stats.errors++;
          notifyEventListeners({ type: 'error', error: wsError, timestamp: Date.now() });
        }
      };

      socket.onclose = (event) => {
        state = {
          ...state,
          status: 'disconnected',
          url: null,
          connectedAt: null
        };
        notifyEventListeners({
          type: 'disconnected',
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: Date.now()
        });
      };
    });
  }

  async function disconnect(code = 1000, reason = ''): Promise<void> {
    if (socket) {
      socket.close(code, reason);
      socket = null;
    }
    state = {
      status: 'disconnected',
      url: null,
      protocols: [],
      reconnectAttempts: 0,
      lastError: null,
      connectedAt: null
    };
  }

  async function send<T>(message: T): Promise<void> {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new WebSocketError(
        'Not connected',
        WS_ERROR_CODES.SEND_FAILED,
        true
      );
    }

    const serialized = config.serializer
      ? config.serializer.serialize(message)
      : JSON.stringify(message);

    socket.send(serialized);
    stats.messagesSent++;
    stats.bytesSent += serialized.toString().length;
  }

  function subscribe<T>(listener: MessageListener<T>): Unsubscribe {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function subscribeToEvents(listener: EventListener): Unsubscribe {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function notifyMessageListeners<T>(message: WebSocketMessage<T>): void {
    messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('[WebSocket] Error in message listener:', error);
      }
    });
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

  return {
    connect,
    disconnect,
    send,
    subscribe,
    subscribeToEvents,
    get state() { return state; },
    get stats() { return stats; }
  };
}
```

---

### 🔴 Issue #4: Connection Timeout Not Implemented

**Location**: `websocket.md` line 374 (config) vs line 614 (connect implementation)

**Problem**:
- Config defines `connectionTimeout?: number`
- Connection logic has no timeout implementation
- Promise hangs forever if server doesn't respond

**Impact**: Applications will freeze when connecting to unresponsive servers.

**Fix**: See Issue #3 implementation above (includes timeout handling).

---

### 🔴 Issue #5: Double Subscription in Examples

**Location**: `websocket.md` lines 1079-1093

**Problem**: The chat example creates TWO subscriptions:
```typescript
case 'connect':
  return [
    { ...state, connection: { ...state.connection, status: 'connecting' } },
    Effect.batch(
      Effect.websocket.connect(
        deps.websocket,
        'wss://chat.example.com',
        undefined,
        (event) => ({ type: 'websocket', event })  // ✅ Subscription #1
      ),
      Effect.websocket.subscribe(  // ❌ Subscription #2 (duplicate!)
        deps.websocket,
        (message) => ({
          type: 'websocket',
          event: { type: 'message', data: message.data, timestamp: message.timestamp }
        })
      )
    )
  ];
```

The `connect` function already subscribes to events via the `onEvent` parameter, so the second `subscribe` call is redundant.

**Impact**: Every WebSocket message will dispatch **TWO** actions instead of one, causing:
- Duplicate state updates
- Unnecessary re-renders
- Confusing reducer logic

**Fix**: Remove the redundant `subscribe` call:
```typescript
case 'connect':
  return [
    { ...state, connection: { ...state.connection, status: 'connecting' } },
    Effect.websocket.connect(
      deps.websocket,
      'wss://chat.example.com',
      undefined,
      (event) => ({ type: 'websocket', event })  // ✅ Handles ALL events including messages
    )
  ];
```

OR: Separate connection events from message events:
```typescript
case 'connect':
  return [
    { ...state, connection: { ...state.connection, status: 'connecting' } },
    Effect.batch(
      Effect.websocket.connect(
        deps.websocket,
        'wss://chat.example.com',
        undefined,
        undefined  // ❌ Don't subscribe here
      ),
      Effect.websocket.subscribeToConnectionEvents(  // ✅ Explicit connection events only
        deps.websocket,
        (event) => ({ type: 'websocketConnection', event })
      ),
      Effect.websocket.subscribeToMessages(  // ✅ Explicit messages only
        deps.websocket,
        (message) => ({ type: 'websocketMessage', message })
      )
    )
  ];
```

---

### 🔴 Issue #6: Reconnection Race Condition

**Location**: `websocket.md` lines 717-722

**Problem**: Reconnection logic schedules next retry even when max attempts reached:
```typescript
try {
  await connect(state.url, state.protocols);
} catch (error) {
  // Schedule next reconnect
  if (config.maxAttempts === 0 || attempt < config.maxAttempts) {
    reconnectTimer = setTimeout(() => reconnect(), 0);  // ❌ Never executes
  }
  throw error;  // ❌ Throws BEFORE setTimeout executes
}
```

The `throw error` causes the function to exit immediately, so the `setTimeout` is unreachable.

**Impact**: Automatic reconnection stops after first failure.

**Fix**:
```typescript
try {
  await connect(state.url, state.protocols);
  // Success! Reset reconnect attempts
  updateState({ reconnectAttempts: 0 });
} catch (error) {
  // Check if we should retry
  if (config.maxAttempts === 0 || attempt < config.maxAttempts) {
    // Schedule next reconnect (don't throw)
    reconnectTimer = setTimeout(() => {
      reconnect().catch(console.error);  // ✅ Handle errors internally
    }, 0);
  } else {
    // Max attempts reached, give up
    updateState({ status: 'failed' });
    throw new WebSocketError(
      `Max reconnection attempts (${config.maxAttempts}) exceeded`,
      WS_ERROR_CODES.MAX_RECONNECTS,
      false
    );
  }
}
```

---

## Major Issues (🟡 Should Fix)

### 🟡 Issue #7: MessageEvent Naming Conflict

**Location**: `websocket.md` line 288

**Problem**: `MessageEvent<T>` conflicts with browser's built-in `MessageEvent`:
```typescript
export interface MessageEvent<T> {  // ❌ Conflicts with window.MessageEvent
  readonly type: 'message';
  readonly data: T;
  readonly timestamp: number;
}
```

**Impact**: Type errors when importing both types, ambiguous code.

**Fix**: Rename to `WebSocketMessageEvent` or `WSMessageEvent`:
```typescript
export interface WebSocketMessageEvent<T> {
  readonly type: 'message';
  readonly data: T;
  readonly timestamp: number;
}
```

---

### 🟡 Issue #8: WebSocketMessage Structure Too Rigid

**Location**: `websocket.md` line 220

**Problem**: Assumes all WebSocket messages follow this structure:
```typescript
export interface WebSocketMessage<T = unknown> {
  readonly type: string;  // ❌ Not all protocols use this
  readonly data: T;       // ❌ Not all protocols use this
  readonly timestamp: number;
  readonly id?: string;
}
```

But WebSocket messages are **just raw data** (string, ArrayBuffer, Blob). Different applications use different formats:
- JSON-RPC: `{ jsonrpc: '2.0', method: 'foo', params: [...] }`
- Protobuf: Binary data (no structure)
- Plain strings: `"PING"`, `"PONG"`
- Custom formats: `{ event: 'chat', payload: {...} }`

**Impact**: Users cannot use WebSockets with non-conforming protocols.

**Fix**: Make message structure flexible:
```typescript
// Raw WebSocket message (what actually comes over the wire)
export type WebSocketRawMessage = string | ArrayBuffer | Blob;

// Optional structured message (users can define their own)
export interface WebSocketMessage<T = unknown> {
  readonly data: T;
  readonly timestamp: number;
  readonly raw: WebSocketRawMessage;
}

// Let users define their own message parser
export interface MessageParser<T> {
  parse(raw: WebSocketRawMessage): T;
}

// Client accepts optional parser
export interface WebSocketClient<T = unknown> {
  connect(url: string, protocols?: string[]): Promise<void>;
  send(message: T): Promise<void>;
  subscribe(listener: (message: WebSocketMessage<T>) => void): Unsubscribe;
  // ...
}
```

---

### 🟡 Issue #9: Missing Spy Client

**Location**: `websocket.md` - Has mock client but no spy client

**Problem**: Web API system has both `createMockAPI()` and `createSpyAPI()`. WebSocket plan only has `createMockWebSocket()`.

**Impact**: Testing is less ergonomic - users can't track calls made to a real WebSocket client.

**Fix**: Add `createSpyWebSocket()`:
```typescript
export interface SpyWebSocketClient extends WebSocketClient {
  readonly connections: Array<{ url: string; protocols?: string[]; timestamp: number }>;
  readonly disconnections: Array<{ code: number; reason: string; timestamp: number }>;
  readonly sentMessages: unknown[];
  readonly receivedMessages: WebSocketMessage<any>[];
  connectionsTo(url: string): number;
  reset(): void;
}

export function createSpyWebSocket(
  realClient: WebSocketClient
): SpyWebSocketClient {
  const connections: Array<{ url: string; protocols?: string[]; timestamp: number }> = [];
  const disconnections: Array<{ code: number; reason: string; timestamp: number }> = [];
  const sentMessages: unknown[] = [];
  const receivedMessages: WebSocketMessage<any>[] = [];

  return {
    async connect(url: string, protocols?: string[]): Promise<void> {
      connections.push({ url, protocols, timestamp: Date.now() });
      return realClient.connect(url, protocols);
    },

    async disconnect(code?: number, reason?: string): Promise<void> {
      disconnections.push({ code: code || 1000, reason: reason || '', timestamp: Date.now() });
      return realClient.disconnect(code, reason);
    },

    async send<T>(message: T): Promise<void> {
      sentMessages.push(message);
      return realClient.send(message);
    },

    subscribe<T>(listener: MessageListener<T>): Unsubscribe {
      return realClient.subscribe((message) => {
        receivedMessages.push(message);
        listener(message);
      });
    },

    subscribeToEvents(listener: EventListener): Unsubscribe {
      return realClient.subscribeToEvents(listener);
    },

    get state() { return realClient.state; },
    get stats() { return realClient.stats; },

    // Spy-specific methods
    connections,
    disconnections,
    sentMessages,
    receivedMessages,
    connectionsTo(url: string): number {
      return connections.filter(c => c.url === url).length;
    },
    reset(): void {
      connections.length = 0;
      disconnections.length = 0;
      sentMessages.length = 0;
      receivedMessages.length = 0;
    }
  };
}
```

---

### 🟡 Issue #10: ConnectionManager/LiveClient Layering Unclear

**Location**: Entire plan - references both `ConnectionManager` and `WebSocketClient`

**Problem**: The architecture has confusing separation:
- `WebSocketClient` interface (line 179)
- `ConnectionManager` interface (line 584)
- `live-client.ts` mentioned but not implemented

It's unclear:
- Does `live-client.ts` implement `WebSocketClient`?
- Does it use `ConnectionManager` internally?
- Or are these meant to be separate layers?

**Impact**: Implementation confusion, unclear responsibilities.

**Fix**: Clarify the layering:

**Option A: Flat Architecture** (Recommended)
```
WebSocketClient (interface)
├── createLiveWebSocket() - Production implementation with built-in reconnection
├── createMockWebSocket() - Test implementation
└── createSpyWebSocket() - Spy wrapper
```

**Option B: Layered Architecture**
```
WebSocketClient (interface)
├── createLiveWebSocket() - Wraps ConnectionManager
│   └── ConnectionManager (internal) - Handles lifecycle
├── createMockWebSocket()
└── createSpyWebSocket()
```

Recommend **Option A** for simplicity.

---

### 🟡 Issue #11: Subscription Manager Not Integrated

**Location**: `websocket.md` line 763 (defined) but never used

**Problem**: `SubscriptionManager` is defined with channel/topic management:
```typescript
export interface SubscriptionManager {
  subscribe<T>(channel: string, listener: MessageListener<T>): Unsubscribe;
  unsubscribe(channel: string): void;
  // ...
}
```

But it's never integrated with `WebSocketClient`. How does channel routing work?

**Impact**: Users don't know how to use channel-based subscriptions.

**Fix**: Either:

**Option A**: Integrate into `WebSocketClient`:
```typescript
export interface WebSocketClient {
  // ... existing methods
  subscribeToChannel<T>(channel: string, listener: MessageListener<T>): Unsubscribe;
}
```

**Option B**: Make it a separate utility:
```typescript
export function createChannelRouter(client: WebSocketClient): SubscriptionManager {
  const subscriptions = new Map<string, Set<MessageListener<any>>>();

  // Subscribe to ALL messages from client
  client.subscribe((message) => {
    const channel = message.type; // Assume message.type is channel name
    const listeners = subscriptions.get(channel);
    if (listeners) {
      listeners.forEach(listener => listener(message));
    }
  });

  return {
    subscribe<T>(channel: string, listener: MessageListener<T>): Unsubscribe {
      // ... implementation
    },
    // ... other methods
  };
}
```

**Option C**: Remove it if not needed for v1.

---

### 🟡 Issue #12: Module Path Might Be Incorrect

**Location**: `websocket.md` line 556

**Problem**:
```typescript
declare module '../effect.js' {  // ❌ Relative path from websocket/effect-websocket.ts
  interface Effect {
    websocket: {
      // ...
    };
  }
}
```

If `effect-websocket.ts` is in `src/websocket/`, the path should be `'../../effect.js'` (two levels up).

**Impact**: TypeScript compilation error.

**Fix**: Use absolute module path:
```typescript
declare module '@composable-svelte/core/effect' {
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
```

OR use correct relative path:
```typescript
// From src/websocket/effect-websocket.ts
declare module '../../effect.js' {
  // ...
}
```

---

### 🟡 Issue #13: Browser vs Node.js WebSocket Not Clarified

**Location**: Throughout plan (assumes browser WebSocket)

**Problem**: WebSocket API differs between environments:
- **Browser**: Native `WebSocket` global
- **Node.js**: Requires library like `ws`

The plan uses `WebSocket.OPEN`, `socket.readyState` which are browser-specific.

**Impact**: Library won't work in Node.js environments (SSR, testing).

**Fix**: Clarify as browser-only OR provide adapters:

```typescript
// Option 1: Clarify as browser-only
/**
 * Create live WebSocket client.
 *
 * **Platform**: Browser only (uses native WebSocket API)
 * For Node.js, use a WebSocket adapter library.
 */
export function createLiveWebSocket(config: WebSocketConfig): WebSocketClient

// Option 2: Provide adapter interface
export interface WebSocketAdapter {
  create(url: string, protocols?: string[]): {
    send(data: string | ArrayBuffer): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    readonly readyState: number;
  };
}

export const BrowserWebSocketAdapter: WebSocketAdapter = {
  create(url, protocols) {
    return new WebSocket(url, protocols);
  }
};

export const NodeWebSocketAdapter: WebSocketAdapter = {
  create(url, protocols) {
    const WS = require('ws');
    return new WS(url, protocols);
  }
};

export function createLiveWebSocket(
  config: WebSocketConfig & { adapter?: WebSocketAdapter }
): WebSocketClient {
  const adapter = config.adapter || BrowserWebSocketAdapter;
  // ... use adapter.create() instead of new WebSocket()
}
```

---

### 🟡 Issue #14: Effect System Doesn't Support Subscriptions

**Location**: Core architectural pattern

**Problem**: The Effect system is designed for **fire-and-forget** operations:
- Effects return `void | Promise<void>`
- No built-in subscription/cleanup pattern
- Cancellable effects require explicit IDs

But WebSockets need **long-running subscriptions** with cleanup.

**Impact**: Subscription management is awkward and error-prone.

**Fix**: Add new `Effect.subscription()` type to the Effect system:

```typescript
// In packages/core/src/types.ts
export type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action> }
  // ... other types

export type SubscriptionSetup<Action> = (dispatch: Dispatch<Action>) => SubscriptionCleanup;
export type SubscriptionCleanup = () => void;

// In packages/core/src/effect.ts
export const Effect = {
  // ... existing methods

  subscription<A>(id: string, setup: SubscriptionSetup<A>): EffectType<A> {
    return { _tag: 'Subscription', id, setup };
  }
};

// Store tracks active subscriptions and cleans them up automatically
```

Then WebSocket subscriptions become natural:
```typescript
export function subscribe<T, Action>(
  client: WebSocketClient,
  subscriptionId: string,
  onMessage: (message: WebSocketMessage<T>) => Action
): EffectType<Action> {
  return Effect.subscription(subscriptionId, (dispatch) => {
    const unsubscribe = client.subscribe<T>((message) => {
      dispatch(onMessage(message));
    });

    // Return cleanup function
    return unsubscribe;  // ✅ Properly supported
  });
}
```

---

## Minor Issues (🟢 Nice to Fix)

### 🟢 Issue #15: Heartbeat Not Specified

**Location**: `websocket.md` - Config defines `HeartbeatConfig` (line 414) but no implementation

**Problem**: Week 3 deliverables mention heartbeat, but no specification provided.

**Impact**: Cannot implement Week 3 without this.

**Fix**: Add heartbeat specification:

```typescript
export function createHeartbeat(
  client: WebSocketClient,
  config: HeartbeatConfig
): { start: () => void; stop: () => void } {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pongReceived = true;

  const start = () => {
    if (intervalId) return; // Already started

    intervalId = setInterval(() => {
      if (!pongReceived) {
        // Pong not received, connection might be dead
        console.warn('[WebSocket] Heartbeat timeout - no pong received');
        client.disconnect(1001, 'Heartbeat timeout');
        stop();
        return;
      }

      // Send ping
      pongReceived = false;
      client.send(config.pingMessage || 'PING').catch(console.error);

      // Set timeout for pong
      timeoutId = setTimeout(() => {
        if (!pongReceived) {
          console.warn('[WebSocket] Pong timeout');
          client.disconnect(1001, 'Pong timeout');
          stop();
        }
      }, config.timeout);

    }, config.interval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // Listen for pong messages
  client.subscribe((message) => {
    if (message.data === (config.pongMessage || 'PONG')) {
      pongReceived = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  });

  return { start, stop };
}
```

---

### 🟢 Issue #16: Message Queue Not Specified

**Location**: Week 3 deliverables mention offline message queuing

**Problem**: No specification for how message queuing should work.

**Suggested Design**:
```typescript
export interface MessageQueue {
  enqueue<T>(message: T): void;
  flush<T>(): T[];
  clear(): void;
  readonly size: number;
}

export function createMessageQueue(maxSize = 100): MessageQueue {
  const queue: unknown[] = [];

  return {
    enqueue<T>(message: T): void {
      if (queue.length >= maxSize) {
        queue.shift(); // Remove oldest
      }
      queue.push(message);
    },

    flush<T>(): T[] {
      const messages = [...queue] as T[];
      queue.length = 0;
      return messages;
    },

    clear(): void {
      queue.length = 0;
    },

    get size() { return queue.length; }
  };
}

// Integrate with WebSocket client
export function createQueuedWebSocket(
  client: WebSocketClient,
  queueSize?: number
): WebSocketClient {
  const queue = createMessageQueue(queueSize);
  let isConnected = false;

  client.subscribeToEvents((event) => {
    if (event.type === 'connected') {
      isConnected = true;
      // Flush queued messages
      const messages = queue.flush();
      messages.forEach(msg => client.send(msg));
    } else if (event.type === 'disconnected') {
      isConnected = false;
    }
  });

  return {
    ...client,
    async send<T>(message: T): Promise<void> {
      if (isConnected) {
        return client.send(message);
      } else {
        queue.enqueue(message);
      }
    }
  };
}
```

---

### 🟢 Issue #17: Binary Message Support Not Specified

**Location**: Week 3 deliverables mention binary support

**Problem**: All examples use JSON. How to handle ArrayBuffer, Blob?

**Fix**: Update `MessageSerializer` to handle binary:
```typescript
export interface MessageSerializer {
  serialize<T>(message: T): string | ArrayBuffer | Blob;
  deserialize<T>(data: string | ArrayBuffer | Blob): T;
}

// JSON serializer (default)
export const JSONSerializer: MessageSerializer = {
  serialize<T>(message: T): string {
    return JSON.stringify(message);
  },
  deserialize<T>(data: string | ArrayBuffer | Blob): T {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    throw new Error('JSONSerializer only supports string messages');
  }
};

// Binary serializer (example)
export const ProtobufSerializer: MessageSerializer = {
  serialize<T>(message: T): ArrayBuffer {
    // Use protobuf library
    return protoEncode(message);
  },
  deserialize<T>(data: string | ArrayBuffer | Blob): T {
    if (data instanceof ArrayBuffer) {
      return protoDecode(data);
    }
    throw new Error('ProtobufSerializer only supports ArrayBuffer');
  }
};
```

---

### 🟢 Issue #18-22: Additional Minor Issues

18. **Error recovery strategy not defined** - What happens when max reconnects reached?
19. **Type safety in deserialization** - No runtime validation of message types
20. **No examples of error handling** - Examples don't show error cases
21. **Stats tracking incomplete** - `byteSent` mentioned but not implemented
22. **No documentation for testing patterns** - How to test WebSocket reducers?

---

## Recommendations

### Immediate Actions (Before Implementation)

1. **Fix Effect.run() cleanup issue** (Critical #2)
   - Add `Effect.subscription()` to core Effect system
   - OR use `Effect.cancellable()` with explicit cleanup

2. **Implement createLiveWebSocket()** (Critical #3)
   - Follow implementation in Issue #3
   - Include connection timeout
   - Handle all WebSocket events

3. **Fix ConnectionManager architecture** (Critical #1)
   - Allow creating new WebSocket instances
   - Store URL/protocols for reconnection

4. **Fix example code** (Critical #5)
   - Remove double subscription
   - Clarify message vs event subscriptions

5. **Add spy client** (Major #9)
   - Follow Web API pattern

6. **Rename MessageEvent** (Major #7)
   - Avoid conflicts with browser types

### Architecture Decisions Needed

1. **Subscription cleanup strategy**: Add `Effect.subscription()` or use `Effect.cancellable()`?
2. **Message structure**: Keep rigid structure or make flexible?
3. **ConnectionManager**: Keep separate or fold into LiveClient?
4. **Channel routing**: Integrate into client or separate utility?
5. **Binary support**: Required for v1 or defer to v2?

### Testing Strategy

Add test scenarios for:
- Connection timeout
- Reconnection after disconnect
- Memory leak prevention (subscription cleanup)
- Message queue overflow
- Binary message handling
- Error recovery

---

## Conclusion

The WebSocket plan has good foundations but **requires major revisions** before implementation. The critical issues around Effect.run() cleanup and ConnectionManager architecture are **blockers** that will cause production bugs if not fixed.

**Recommendation**:
1. ✅ Fix all 6 critical issues
2. ✅ Fix major issues #7-#14
3. ⚠️ Consider minor issues for completeness
4. ✅ Update plan document with corrections
5. ✅ Get architectural decisions approved
6. ✅ THEN begin Week 1 implementation

**Estimated Revision Time**: 1-2 days to update plan with fixes.

---

**Reviewer Sign-off**: Ready for revision phase.
