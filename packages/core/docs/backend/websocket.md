# WebSocket Client

Comprehensive guide to real-time WebSocket communication in Composable Svelte.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Creating a WebSocket Client](#creating-a-websocket-client)
4. [Connection Lifecycle](#connection-lifecycle)
5. [Sending Messages](#sending-messages)
6. [Receiving Messages](#receiving-messages)
7. [Connection Events](#connection-events)
8. [Reconnection](#reconnection)
9. [Heartbeat](#heartbeat)
10. [Channel Routing](#channel-routing)
11. [Message Queuing](#message-queuing)
12. [Error Handling](#error-handling)
13. [Effect Integration](#effect-integration)
14. [Testing](#testing)
15. [Best Practices](#best-practices)
16. [Advanced Patterns](#advanced-patterns)

## Overview

The WebSocket client provides production-ready real-time communication with:

- **Automatic reconnection**: Exponential backoff with configurable retry
- **Connection lifecycle**: Connect, disconnect, reconnecting, failed states
- **Type-safe messages**: Full TypeScript inference for message types
- **Heartbeat/ping-pong**: Keep-alive monitoring with automatic disconnect
- **Channel routing**: Topic-based message routing
- **Message queuing**: Offline message buffering
- **Effect integration**: Declarative WebSocket operations in reducers
- **Testing utilities**: Mock and spy clients for testing

## Quick Start

```typescript
import { createLiveWebSocket, Effect } from '@composable-svelte/core';

// 1. Create client
const websocket = createLiveWebSocket({
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000
  }
});

// 2. Connect
await websocket.connect('wss://api.example.com');

// 3. Subscribe to messages
websocket.subscribe((message) => {
  console.log('Message received:', message.data);
});

// 4. Send messages
await websocket.send({ type: 'chat', text: 'Hello!' });

// 5. Use in reducers
case 'connect':
  return [
    { ...state, connecting: true },
    Effect.websocket.connect(
      deps.websocket,
      'websocket-connection',
      'wss://api.example.com',
      undefined,
      (event) => ({ type: 'websocketEvent', event })
    )
  ];
```

## Creating a WebSocket Client

### Basic Client

```typescript
import { createLiveWebSocket } from '@composable-svelte/core';

const websocket = createLiveWebSocket();

// Connect later
await websocket.connect('wss://api.example.com');
```

### Full Configuration

```typescript
const websocket = createLiveWebSocket({
  // Reconnection strategy
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },

  // Heartbeat/ping-pong
  heartbeat: {
    enabled: true,
    interval: 30000,
    timeout: 5000,
    pingMessage: 'PING',
    pongMessage: 'PONG'
  },

  // Message serialization
  serializer: JSONSerializer, // or custom serializer

  // Connection timeout
  connectionTimeout: 10000,

  // Message queue size
  queueSize: 100
});
```

### Custom Message Types

```typescript
// Define message types
interface ChatMessage {
  type: 'chat';
  user: string;
  text: string;
  timestamp: number;
}

interface StatusMessage {
  type: 'status';
  online: boolean;
}

type Message = ChatMessage | StatusMessage;

// Create typed client
const websocket = createLiveWebSocket<Message>({
  reconnect: { enabled: true }
});

// Type-safe messages
websocket.subscribe((message) => {
  switch (message.data.type) {
    case 'chat':
      console.log(message.data.text); // Type-safe!
      break;
    case 'status':
      console.log(message.data.online); // Type-safe!
      break;
  }
});
```

## Connection Lifecycle

WebSocket connections have five states: `disconnected`, `connecting`, `connected`, `reconnecting`, `failed`.

### Connecting

```typescript
// Start connection
await websocket.connect('wss://api.example.com');

// With protocols
await websocket.connect('wss://api.example.com', ['chat', 'v1']);

// Check state
console.log(websocket.state.status); // 'connected'
console.log(websocket.state.url); // 'wss://api.example.com'
console.log(websocket.state.protocols); // ['chat', 'v1']
```

### Disconnecting

```typescript
// Clean disconnect
await websocket.disconnect();

// With custom close code and reason
await websocket.disconnect(1000, 'User logged out');
```

### Connection State

```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  url: string | null;
  protocols: string[];
  reconnectAttempts: number;
  lastError: WebSocketError | null;
  connectedAt: Date | null;
}

// Access state
const state = websocket.state;
console.log(state.status); // 'connected'
console.log(state.reconnectAttempts); // 0
console.log(state.connectedAt); // Date
```

### Connection Statistics

```typescript
interface ConnectionStats {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  reconnects: number;
  errors: number;
  uptime: number; // milliseconds
}

// Access stats
const stats = websocket.stats;
console.log(stats.messagesSent); // 42
console.log(stats.reconnects); // 2
console.log(stats.uptime); // 123456 (ms)
```

## Sending Messages

### Basic Send

```typescript
// Send JSON message
await websocket.send({ type: 'chat', text: 'Hello!' });

// Send with type safety
interface Message {
  type: 'chat';
  text: string;
}

const websocket = createLiveWebSocket<Message>();
await websocket.send({ type: 'chat', text: 'Hello!' }); // Type-safe!
```

### Error Handling

```typescript
try {
  await websocket.send({ type: 'chat', text: 'Hello!' });
} catch (error) {
  if (error instanceof WebSocketError) {
    if (error.code === WS_ERROR_CODES.SEND_FAILED) {
      console.log('Not connected - queue message');
    }
  }
}
```

### Queued Messages

Messages sent while disconnected can be queued:

```typescript
import { createQueuedWebSocket } from '@composable-svelte/core';

const websocket = createQueuedWebSocket(
  createLiveWebSocket(),
  { maxSize: 100 }
);

// Send while disconnected - queued automatically
await websocket.send({ type: 'chat', text: 'Hello!' });

// Connect later - queue flushes automatically
await websocket.connect('wss://api.example.com');
```

## Receiving Messages

### Subscribe to Messages

```typescript
// Subscribe to all messages
const unsubscribe = websocket.subscribe((message) => {
  console.log('Received:', message.data);
  console.log('Timestamp:', message.timestamp);
  console.log('Raw:', message.raw);
});

// Later: unsubscribe
unsubscribe();
```

### Multiple Subscribers

```typescript
// Multiple subscribers work independently
const unsubscribe1 = websocket.subscribe((message) => {
  console.log('Handler 1:', message.data);
});

const unsubscribe2 = websocket.subscribe((message) => {
  console.log('Handler 2:', message.data);
});

// Each can unsubscribe independently
unsubscribe1();
unsubscribe2();
```

### Message Structure

```typescript
interface WebSocketMessage<T> {
  data: T;              // Parsed message data
  timestamp: number;    // Client-side timestamp
  raw: string | ArrayBuffer | Blob; // Raw WebSocket data
}
```

## Connection Events

Subscribe to connection lifecycle events.

### Event Types

```typescript
type WebSocketEvent =
  | { type: 'connected'; url: string; protocols: string[]; timestamp: number }
  | { type: 'disconnected'; code: number; reason: string; wasClean: boolean; timestamp: number }
  | { type: 'error'; error: WebSocketError; timestamp: number }
  | { type: 'reconnecting'; attempt: number; delay: number; maxAttempts: number; timestamp: number }
  | { type: 'reconnected'; attempts: number; totalDelay: number; timestamp: number };
```

### Subscribe to Events

```typescript
const unsubscribe = websocket.subscribeToEvents((event) => {
  switch (event.type) {
    case 'connected':
      console.log('Connected to:', event.url);
      break;

    case 'disconnected':
      console.log('Disconnected:', event.reason);
      if (!event.wasClean) {
        console.log('Unexpected disconnect');
      }
      break;

    case 'error':
      console.error('WebSocket error:', event.error);
      break;

    case 'reconnecting':
      console.log(`Reconnecting (${event.attempt}/${event.maxAttempts})...`);
      console.log(`Waiting ${event.delay}ms`);
      break;

    case 'reconnected':
      console.log(`Reconnected after ${event.attempts} attempts`);
      break;
  }
});

// Later: unsubscribe
unsubscribe();
```

## Reconnection

Automatic reconnection with exponential backoff.

### Default Reconnection

```typescript
const websocket = createLiveWebSocket({
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  }
});

// Reconnects automatically on unexpected disconnect
await websocket.connect('wss://api.example.com');

// Simulate disconnect
// WebSocket will automatically attempt reconnection
```

### Reconnection Delays

Delays use exponential backoff:

```
Attempt 1: 1000ms
Attempt 2: 2000ms
Attempt 3: 4000ms
Attempt 4: 8000ms
Attempt 5: 16000ms (capped at maxDelay)
```

Jitter adds randomness (±30%) to prevent thundering herd.

### Disable Reconnection

```typescript
const websocket = createLiveWebSocket({
  reconnect: {
    enabled: false
  }
});

// No automatic reconnection
```

### Infinite Reconnection

```typescript
const websocket = createLiveWebSocket({
  reconnect: {
    enabled: true,
    maxAttempts: 0 // 0 = infinite attempts
  }
});
```

### Manual Reconnection

```typescript
websocket.subscribeToEvents((event) => {
  if (event.type === 'disconnected' && !event.wasClean) {
    // Custom reconnection logic
    setTimeout(() => {
      websocket.connect(websocket.state.url!);
    }, 5000);
  }
});
```

## Heartbeat

Keep-alive monitoring with ping/pong messages.

### Enable Heartbeat

```typescript
import { createLiveWebSocket, createHeartbeat } from '@composable-svelte/core';

const websocket = createLiveWebSocket();
const heartbeat = createHeartbeat(websocket, {
  enabled: true,
  interval: 30000,    // Ping every 30 seconds
  timeout: 5000,      // Expect pong within 5 seconds
  pingMessage: 'PING',
  pongMessage: 'PONG'
});

// Start heartbeat on connection
websocket.subscribeToEvents((event) => {
  if (event.type === 'connected') {
    heartbeat.start();
  } else if (event.type === 'disconnected') {
    heartbeat.stop();
  }
});

await websocket.connect('wss://api.example.com');
```

### Custom Ping/Pong

```typescript
const heartbeat = createHeartbeat(websocket, {
  enabled: true,
  interval: 30000,
  timeout: 5000,
  pingMessage: { type: 'ping', timestamp: Date.now() },
  pongMessage: { type: 'pong', timestamp: Date.now() }
});
```

### Heartbeat Timeout

If pong not received within timeout, connection is closed:

```typescript
websocket.subscribeToEvents((event) => {
  if (event.type === 'disconnected') {
    if (event.reason === 'Heartbeat timeout') {
      console.log('Server not responding - reconnecting...');
    }
  }
});
```

## Channel Routing

Topic-based message routing for multi-channel applications.

### Create Channel Router

```typescript
import { createChannelRouter } from '@composable-svelte/core';

// Message structure: { channel: 'chat', data: {...} }
const router = createChannelRouter(
  websocket,
  (msg) => msg.channel // Extract channel from message
);

// Subscribe to specific channel
const unsubscribe = router.subscribe('chat', (message) => {
  console.log('Chat message:', message.data);
});

// Subscribe to multiple channels
const unsubNotifications = router.subscribe('notifications', (message) => {
  console.log('Notification:', message.data);
});

// Get active channels
console.log(router.getChannels()); // ['chat', 'notifications']

// Get listener count
console.log(router.getListenerCount('chat')); // 1

// Unsubscribe from channel
unsubscribe();

// Clear all subscriptions
router.clear();
```

### Channel WebSocket

Convenience wrapper combining client + router:

```typescript
import { createChannelWebSocket } from '@composable-svelte/core';

const client = createChannelWebSocket(
  createLiveWebSocket(),
  (msg) => msg.channel
);

// Connect
await client.connect('wss://api.example.com');

// Subscribe to channel
const unsubscribe = client.router.subscribe('chat', (message) => {
  console.log('Chat:', message.data);
});

// Send to channel
await client.send({ channel: 'chat', text: 'Hello!' });

// Access base client
console.log(client.state);
console.log(client.stats);
```

### Example: Chat Application

```typescript
interface Message {
  channel: string;
  user: string;
  text: string;
  timestamp: number;
}

const client = createChannelWebSocket<Message>(
  createLiveWebSocket(),
  (msg) => msg.channel
);

await client.connect('wss://chat.example.com');

// Subscribe to room channels
client.router.subscribe('room:lobby', (message) => {
  displayMessage('Lobby', message.data);
});

client.router.subscribe('room:general', (message) => {
  displayMessage('General', message.data);
});

// Send to specific room
await client.send({
  channel: 'room:lobby',
  user: 'Alice',
  text: 'Hello lobby!',
  timestamp: Date.now()
});
```

## Message Queuing

Buffer messages while offline and send when reconnected.

### Create Queued WebSocket

```typescript
import { createQueuedWebSocket } from '@composable-svelte/core';

const websocket = createQueuedWebSocket(
  createLiveWebSocket(),
  {
    maxSize: 100,  // Queue up to 100 messages
    dropStrategy: 'oldest' // Drop oldest when full
  }
);

// Send while disconnected - queued automatically
await websocket.send({ type: 'chat', text: 'Message 1' });
await websocket.send({ type: 'chat', text: 'Message 2' });

console.log(websocket.queue.size); // 2
console.log(websocket.queue.isFull); // false

// Connect - queue flushes automatically
await websocket.connect('wss://api.example.com');
// Both messages sent
console.log(websocket.queue.size); // 0
```

### Manual Queue Management

```typescript
// Peek at queue
const messages = websocket.queue.peek();
console.log(messages);

// Clear queue
websocket.queue.clear();

// Check if full
if (websocket.queue.isFull) {
  console.log('Queue full - dropping messages');
}
```

## Error Handling

WebSocket-specific error types and handling patterns.

### Error Types

```typescript
import { WebSocketError, WS_ERROR_CODES } from '@composable-svelte/core';

// Error codes
WS_ERROR_CODES.CONNECTION_FAILED;    // Connection failed
WS_ERROR_CODES.CONNECTION_TIMEOUT;   // Connection timeout
WS_ERROR_CODES.SEND_FAILED;          // Send failed
WS_ERROR_CODES.INVALID_MESSAGE;      // Invalid message format
WS_ERROR_CODES.MAX_RECONNECTS;       // Max reconnect attempts exceeded
WS_ERROR_CODES.PROTOCOL_ERROR;       // Protocol error
WS_ERROR_CODES.HEARTBEAT_TIMEOUT;    // Heartbeat timeout
```

### Handle Connection Errors

```typescript
try {
  await websocket.connect('wss://api.example.com');
} catch (error) {
  if (error instanceof WebSocketError) {
    console.log(error.code); // WS_ERROR_CODES.CONNECTION_FAILED
    console.log(error.recoverable); // true/false
    console.log(error.cause); // Original error

    if (error.code === WS_ERROR_CODES.CONNECTION_TIMEOUT) {
      // Handle timeout
      showTimeoutMessage();
    } else if (error.code === WS_ERROR_CODES.CONNECTION_FAILED) {
      // Handle connection failure
      showConnectionError();
    }
  }
}
```

### Handle Send Errors

```typescript
try {
  await websocket.send({ type: 'chat', text: 'Hello!' });
} catch (error) {
  if (error instanceof WebSocketError) {
    if (error.code === WS_ERROR_CODES.SEND_FAILED) {
      // Queue message for retry
      queueMessage({ type: 'chat', text: 'Hello!' });
    }
  }
}
```

### Handle Message Errors

```typescript
websocket.subscribeToEvents((event) => {
  if (event.type === 'error') {
    const error = event.error;

    if (error.code === WS_ERROR_CODES.INVALID_MESSAGE) {
      console.error('Invalid message format:', error.cause);
    } else if (error.code === WS_ERROR_CODES.MAX_RECONNECTS) {
      console.error('Max reconnects exceeded - giving up');
      showReconnectButton();
    }
  }
});
```

## Effect Integration

Declarative WebSocket operations in reducers.

### Effect.websocket.connect()

```typescript
case 'connect':
  return [
    { ...state, connecting: true },
    Effect.websocket.connect(
      deps.websocket,
      'websocket-connection',
      'wss://chat.example.com',
      undefined,
      (event) => ({ type: 'websocketEvent', event })
    )
  ];

case 'websocketEvent':
  if (action.event.type === 'connected') {
    return [
      { ...state, connecting: false, connected: true },
      Effect.none()
    ];
  } else if (action.event.type === 'disconnected') {
    return [
      { ...state, connected: false },
      Effect.none()
    ];
  }
  return [state, Effect.none()];
```

### Effect.websocket.disconnect()

```typescript
case 'disconnect':
  return [
    { ...state, connected: false },
    Effect.websocket.disconnect(deps.websocket)
  ];
```

### Effect.websocket.send()

```typescript
case 'sendMessage':
  return [
    state,
    Effect.websocket.send(
      deps.websocket,
      { type: 'chat', text: action.text },
      () => ({ type: 'messageSent' }),
      (error) => ({ type: 'messageFailed', error: error.message })
    )
  ];

case 'messageSent':
  return [
    { ...state, lastSent: Date.now() },
    Effect.none()
  ];
```

### Effect.websocket.subscribe()

```typescript
case 'subscribeToMessages':
  return [
    state,
    Effect.websocket.subscribe(
      deps.websocket,
      'websocket-messages',
      (message) => ({ type: 'messageReceived', message: message.data })
    )
  ];

case 'messageReceived':
  return [
    { ...state, messages: [...state.messages, action.message] },
    Effect.none()
  ];
```

### Full Example: Chat Application

```typescript
// State
interface ChatState {
  connected: boolean;
  connecting: boolean;
  messages: ChatMessage[];
  draft: string;
  error: string | null;
}

// Actions
type ChatAction =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'websocketEvent'; event: WebSocketEvent }
  | { type: 'sendMessage'; text: string }
  | { type: 'messageSent' }
  | { type: 'messageReceived'; message: ChatMessage }
  | { type: 'messageFailed'; error: string };

// Dependencies
interface ChatDependencies {
  websocket: WebSocketClient<ChatMessage>;
}

// Reducer
const chatReducer = (
  state: ChatState,
  action: ChatAction,
  deps: ChatDependencies
): [ChatState, Effect<ChatAction>] => {
  switch (action.type) {
    case 'connect':
      return [
        { ...state, connecting: true },
        Effect.batch(
          Effect.websocket.connect(
            deps.websocket,
            'websocket-connection',
            'wss://chat.example.com',
            undefined,
            (event) => ({ type: 'websocketEvent', event })
          ),
          Effect.websocket.subscribe(
            deps.websocket,
            'websocket-messages',
            (message) => ({ type: 'messageReceived', message: message.data })
          )
        )
      ];

    case 'websocketEvent':
      if (action.event.type === 'connected') {
        return [
          { ...state, connecting: false, connected: true },
          Effect.none()
        ];
      } else if (action.event.type === 'disconnected') {
        return [
          { ...state, connected: false, connecting: false },
          Effect.none()
        ];
      }
      return [state, Effect.none()];

    case 'sendMessage':
      return [
        state,
        Effect.websocket.send(
          deps.websocket,
          { type: 'chat', text: action.text, user: 'me', timestamp: Date.now() },
          () => ({ type: 'messageSent' }),
          (error) => ({ type: 'messageFailed', error: error.message })
        )
      ];

    case 'messageReceived':
      return [
        { ...state, messages: [...state.messages, action.message] },
        Effect.none()
      ];

    case 'messageFailed':
      return [
        { ...state, error: action.error },
        Effect.none()
      ];

    case 'disconnect':
      return [
        { ...state, connected: false },
        Effect.websocket.disconnect(deps.websocket)
      ];
  }
};

// Store
const store = createStore({
  initialState: {
    connected: false,
    connecting: false,
    messages: [],
    draft: '',
    error: null
  },
  reducer: chatReducer,
  dependencies: {
    websocket: createLiveWebSocket({
      reconnect: { enabled: true, maxAttempts: 5 }
    })
  }
});
```

## Testing

Mock and spy clients for testing WebSocket interactions.

### createMockWebSocket

```typescript
import { createMockWebSocket } from '@composable-svelte/core';

const mockWS = createMockWebSocket<ChatMessage>();

// Connect
await mockWS.connect('wss://example.com');
console.log(mockWS.state.status); // 'connected'

// Simulate incoming message
mockWS.simulateMessage({
  type: 'chat',
  user: 'Alice',
  text: 'Hello!',
  timestamp: Date.now()
});

// Check sent messages
await mockWS.send({ type: 'chat', user: 'Bob', text: 'Hi!' });
console.log(mockWS.sentMessages); // [{ type: 'chat', ... }]

// Simulate error
mockWS.simulateError(
  new WebSocketError('Connection lost', WS_ERROR_CODES.CONNECTION_FAILED, true)
);

// Simulate disconnect
mockWS.simulateDisconnect(1001, 'Going away');

// Reset between tests
mockWS.reset();
```

### Testing Reducers

```typescript
import { TestStore } from '@composable-svelte/core';

describe('Chat Reducer', () => {
  it('should connect and receive messages', async () => {
    const mockWS = createMockWebSocket<ChatMessage>();

    const store = new TestStore({
      initialState: { connected: false, messages: [] },
      reducer: chatReducer,
      dependencies: { websocket: mockWS }
    });

    // Test connect
    await store.send({ type: 'connect' }, (state) => {
      expect(state.connecting).toBe(true);
    });

    // Simulate connection
    mockWS.simulateEvent({
      type: 'connected',
      url: 'wss://example.com',
      protocols: [],
      timestamp: Date.now()
    });

    await store.receive({ type: 'websocketEvent' }, (state) => {
      expect(state.connected).toBe(true);
      expect(state.connecting).toBe(false);
    });

    // Simulate incoming message
    mockWS.simulateMessage({
      type: 'chat',
      user: 'Alice',
      text: 'Hello!',
      timestamp: Date.now()
    });

    await store.receive({ type: 'messageReceived' }, (state) => {
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].text).toBe('Hello!');
    });
  });
});
```

### createSpyWebSocket

```typescript
import { createSpyWebSocket } from '@composable-svelte/core';

const mockWS = createMockWebSocket();
const spy = createSpyWebSocket(mockWS);

// Connect
await spy.connect('wss://example.com');

// Send messages
await spy.send({ type: 'chat', text: 'Message 1' });
await spy.send({ type: 'chat', text: 'Message 2' });

// Verify connections
expect(spy.connections).toHaveLength(1);
expect(spy.connections[0].url).toBe('wss://example.com');

// Verify sent messages
expect(spy.sentMessages).toHaveLength(2);
expect(spy.sentMessages[0].text).toBe('Message 1');

// Disconnect
await spy.disconnect();

// Verify disconnections
expect(spy.disconnections).toHaveLength(1);
expect(spy.disconnections[0].code).toBe(1000);

// Reset
spy.reset();
```

## Best Practices

### 1. Use Type-Safe Messages

```typescript
// Bad - no type safety
const websocket = createLiveWebSocket();

// Good - typed messages
interface Message {
  type: 'chat' | 'status';
  data: any;
}

const websocket = createLiveWebSocket<Message>();
```

### 2. Enable Reconnection

```typescript
// Bad - no reconnection
const websocket = createLiveWebSocket();

// Good - automatic reconnection
const websocket = createLiveWebSocket({
  reconnect: {
    enabled: true,
    maxAttempts: 5
  }
});
```

### 3. Use Heartbeat for Long-Lived Connections

```typescript
const websocket = createLiveWebSocket();
const heartbeat = createHeartbeat(websocket, {
  enabled: true,
  interval: 30000,
  timeout: 5000
});

websocket.subscribeToEvents((event) => {
  if (event.type === 'connected') heartbeat.start();
  if (event.type === 'disconnected') heartbeat.stop();
});
```

### 4. Handle Connection Events

```typescript
websocket.subscribeToEvents((event) => {
  switch (event.type) {
    case 'connected':
      // Subscribe to channels, send queued messages
      break;
    case 'disconnected':
      // Show offline indicator
      break;
    case 'reconnecting':
      // Show reconnecting indicator
      break;
    case 'error':
      // Log error, show notification
      break;
  }
});
```

### 5. Use Channel Routing for Multi-Topic Apps

```typescript
// Bad - manual routing
websocket.subscribe((message) => {
  if (message.data.channel === 'chat') {
    handleChat(message.data);
  } else if (message.data.channel === 'notifications') {
    handleNotification(message.data);
  }
});

// Good - channel router
const router = createChannelRouter(websocket, (msg) => msg.channel);
router.subscribe('chat', handleChat);
router.subscribe('notifications', handleNotification);
```

## Advanced Patterns

### Binary Messages

```typescript
// Custom serializer for binary data
const binarySerializer: MessageSerializer = {
  serialize<T>(message: T): ArrayBuffer {
    // Custom binary encoding
    return encoder.encode(message);
  },
  deserialize<T>(data: string | ArrayBuffer | Blob): T {
    if (data instanceof ArrayBuffer) {
      return decoder.decode(data);
    }
    throw new Error('Expected ArrayBuffer');
  }
};

const websocket = createLiveWebSocket({
  serializer: binarySerializer
});
```

### Presence Tracking

```typescript
interface PresenceMessage {
  type: 'presence';
  users: string[];
}

const router = createChannelRouter(websocket, (msg) => msg.type);

router.subscribe('presence', (message) => {
  const data = message.data as PresenceMessage;
  updateUserList(data.users);
});

// Send presence updates
await websocket.send({
  type: 'presence',
  action: 'join',
  user: currentUser
});
```

### Request/Response Pattern

```typescript
interface Request {
  id: string;
  method: string;
  params: any;
}

interface Response {
  id: string;
  result?: any;
  error?: string;
}

const pendingRequests = new Map<string, (response: Response) => void>();

websocket.subscribe((message) => {
  const response = message.data as Response;
  const callback = pendingRequests.get(response.id);
  if (callback) {
    callback(response);
    pendingRequests.delete(response.id);
  }
});

async function sendRequest(method: string, params: any): Promise<any> {
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.result);
      }
    });

    websocket.send({ id, method, params });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}
```

### Connection Pool

```typescript
class WebSocketPool {
  private clients: Map<string, WebSocketClient> = new Map();

  getClient(url: string): WebSocketClient {
    if (!this.clients.has(url)) {
      const client = createLiveWebSocket({ reconnect: { enabled: true } });
      client.connect(url);
      this.clients.set(url, client);
    }
    return this.clients.get(url)!;
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}

const pool = new WebSocketPool();
const chatWS = pool.getClient('wss://chat.example.com');
const notifWS = pool.getClient('wss://notifications.example.com');
```

---

For more information, see:
- [API Client](./api-client.md)
- [Dependencies Overview](./dependencies.md)
- [Effect System](../core-concepts/effects.md)
- [Testing Guide](../testing/unit-testing.md)
