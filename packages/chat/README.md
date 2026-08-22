# @composable-svelte/chat

Streaming chat components with collaborative features for Composable Svelte. Built for LLM interactions with a transport-agnostic design.

## Features

- **Transport-agnostic** - Bring your own streaming backend (WebSocket, SSE, REST, etc.)
- **Three UI tiers** - Minimal, Standard, and Full chat variants for different complexity needs
- **Markdown rendering** - Built-in markdown support with code highlighting via marked
- **File attachments** - Attach images, documents, and media to messages
- **Message reactions** - Emoji reactions on messages
- **Message editing** - Edit and delete sent messages
- **Collaborative** - Real-time presence tracking, typing indicators, and cursor markers
- **WebSocket management** - Built-in WebSocket client with reconnection and cleanup
- **State-driven** - Full Composable Architecture integration with testable reducers
- **Customizable** - Custom sender names, avatars, labels, and message rendering

## Installation

```bash
pnpm add @composable-svelte/chat
```

**Peer dependencies:**

```bash
pnpm add @composable-svelte/core svelte
```

**Optional peer dependencies** (for enhanced features):

```bash
pnpm add @composable-svelte/code   # Code block syntax highlighting
pnpm add @composable-svelte/media  # Audio/video embeds in messages
pnpm add prismjs                   # Prism.js syntax highlighting
pnpm add pdfjs-dist                # PDF attachment previews
```

## Quick Start

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    FullStreamingChat,
    streamingChatReducer,
    createInitialStreamingChatState
  } from '@composable-svelte/chat';

  const store = createStore({
    initialState: createInitialStreamingChatState(),
    reducer: streamingChatReducer,
    dependencies: {
      streamMessage: (message, onChunk, onComplete, onError) => {
        // Connect to your LLM backend
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({ message })
        });
        const reader = response.body.getReader();
        // Stream chunks...
        return new AbortController(); // For cancellation
      },
      generateId: () => crypto.randomUUID(),
      getTimestamp: () => Date.now()
    }
  });
</script>

<FullStreamingChat {store} />
```

## Chat Variants

### MinimalStreamingChat

Bare-bones chat with just messages and input. Best for embedding in tight spaces.

```svelte
<MinimalStreamingChat {store} />
```

### StandardStreamingChat

Adds message metadata (timestamps, sender info), typing indicators, and scroll management.

```svelte
<StandardStreamingChat {store} userLabel="You" assistantLabel="AI" />
```

### FullStreamingChat

Complete chat experience with attachments, reactions, editing, and all features enabled.

```svelte
<FullStreamingChat
  {store}
  userLabel="You"
  assistantLabel="Assistant"
  enableAttachments={true}
  enableReactions={true}
/>
```

### SimpleChatMessage / ChatMessage

Individual message components for custom layouts:

```svelte
<ChatMessage message={msg} variant="assistant" showAvatar={true} />
```

## Collaborative Features

For multi-user chat with real-time presence:

```svelte
<script lang="ts">
  import {
    collaborativeReducer,
    PresenceAvatarStack,
    TypingIndicator,
    usePresenceTracking,
    useTypingEmitter
  } from '@composable-svelte/chat';
</script>

<!-- Show who's online. Users live in a flat Map, not under `presence`. -->
<PresenceAvatarStack users={[...$store.users.values()]} />

<!-- Show who's typing -->
<TypingIndicator users={getTypingUsers($store.users)} />
```

### Collaborative Hooks

| Hook | Purpose |
|------|---------|
| `usePresenceTracking` | Track user online/offline/idle status |
| `useTypingEmitter` | Broadcast typing start/stop events |
| `useCursorTracking` | Share cursor position in real-time |
| `useHeartbeat` | Keep-alive pings for connection health |

### Supplying the connection

There is no `WebSocketManager`. The socket is yours: pass a `connectWebSocket`
dependency that opens it and **returns a cleanup function**. The store owns that
cleanup — `disconnectFromConversation` runs it, re-connecting runs it before
opening the next one, and destroying the store runs it too.

```typescript
dependencies: {
  connectWebSocket: (conversationId, userId, onMessage, onConnectionChange) => {
    const socket = new WebSocket(`wss://chat.example.com/${conversationId}`);
    socket.onmessage = (e) => onMessage(JSON.parse(e.data));
    socket.onopen = () => onConnectionChange({ status: 'connected', connectedAt: Date.now() });
    return () => socket.close();
  }
}
```

Returning nothing is allowed but means nothing is ever closed. Reports made from
inside a cleanup are ignored, so a socket's `onclose` cannot overwrite the state
of the connection that replaced it.

## State Management

### State Shape

```typescript
interface StreamingChatState {
  messages: Message[];
  currentStreaming: StreamingState | null;
  pendingAttachments: MessageAttachment[];
  isLoading: boolean;
  error: string | null;
}
```

### Key Actions

| Action | Description |
|--------|-------------|
| `sendMessage` | Send a user message and trigger streaming |
| `addAttachment` / `removeAttachment` | Manage file attachments |
| `editMessage` / `deleteMessage` | Modify existing messages |
| `addReaction` / `removeReaction` | Toggle emoji reactions |
| `cancelStreaming` | Abort in-progress streaming |
| `restoreMessages` | Restore messages from a previous session |

### Dependencies

```typescript
interface StreamingChatDependencies {
  streamMessage: (message: string, onChunk, onComplete, onError) => AbortController;
  generateId: () => string;
  getTimestamp: () => number;
}
```

## Testing

```typescript
import { createTestStore } from '@composable-svelte/core';
import { streamingChatReducer, createInitialStreamingChatState } from '@composable-svelte/chat';

const store = createTestStore({
  initialState: createInitialStreamingChatState(),
  reducer: streamingChatReducer,
  dependencies: {
    streamMessage: vi.fn((msg, onChunk, onComplete) => {
      setTimeout(() => onComplete(), 0);
      return new AbortController();
    }),
    generateId: () => 'test-id',
    getTimestamp: () => 1000
  }
});

await store.send({ type: 'sendMessage', content: 'Hello' }, (state) => {
  expect(state.messages).toHaveLength(1);
});
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `MinimalStreamingChat` | Minimal chat UI (messages + input) |
| `StandardStreamingChat` | Standard chat with metadata and typing |
| `FullStreamingChat` | Full-featured chat with attachments and reactions |
| `SimpleChatMessage` | Single message display (simple) |
| `ChatMessage` | Single message display (full features) |
| `PresenceBadge` | Online status indicator |
| `PresenceAvatarStack` | Stacked avatar display for online users |
| `PresenceList` | List of users with presence status |
| `TypingIndicator` | Animated typing dots |
| `TypingUsersList` | List of currently typing users |
| `CursorMarker` | Remote cursor position display |
| `CursorOverlay` | Overlay layer for all remote cursors |

### Functions

| Function | Description |
|----------|-------------|
| `streamingChatReducer` | Main chat reducer |
| `createInitialStreamingChatState()` | Create initial state with defaults |
| `collaborativeReducer` | Reducer for collaborative features |
| `createMockStreamingChat()` | Mock for testing |

## Dependencies

- **Runtime**: [marked](https://github.com/markedjs/marked) (markdown parsing)
- **Peer**: `@composable-svelte/core`, `svelte`
- **Optional**: `@composable-svelte/code`, `@composable-svelte/media`, `prismjs`, `pdfjs-dist`
