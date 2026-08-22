---
name: composable-svelte-chat
description: Streaming chat and collaborative features for Composable Svelte. Use when implementing LLM chat interfaces, real-time messaging, or collaborative features. Covers StreamingChat (transport-agnostic), presence tracking, typing indicators, live cursors, and WebSocket integration from @composable-svelte/chat package.
---

# Composable Svelte Chat Package

Streaming chat with collaborative features for LLM interactions and real-time messaging.

---

## PACKAGE OVERVIEW

**Package**: `@composable-svelte/chat`

**Purpose**: Transport-agnostic streaming chat designed for LLM interactions with collaborative features.

**Technology Stack**:
- **Markdown**: `marked` for rendering, `isomorphic-dompurify` for sanitising the result
- **Syntax highlighting**: Prism.js (optional peer, loaded lazily)
- **PDF.js**: PDF attachment preview (`pdfjs-dist`, optional peer)
- **Animation**: Motion One helpers from `@composable-svelte/core/animation`
- **WebSocket**: supplied by the consumer through the `connectWebSocket` dependency

**Core Components**:
- `MinimalStreamingChat` / `StandardStreamingChat` / `FullStreamingChat` - transport-agnostic streaming chat
- `Collaborative Features` - presence, typing, live cursors

**State Management**:
All components follow Composable Architecture patterns with dedicated reducers and type-safe actions.

---

## STREAMING CHAT

**Purpose**: Transport-agnostic streaming chat for LLM interactions (OpenAI, Anthropic, Ollama, etc.).

### Quick Start

```typescript
import { createStore } from '@composable-svelte/core';
import {
  StandardStreamingChat,
  streamingChatReducer,
  createInitialStreamingChatState
} from '@composable-svelte/chat';

// Create chat store
const store = createStore({
  initialState: createInitialStreamingChatState(),
  reducer: streamingChatReducer,
  dependencies: {
    // Callback-based, not an async generator. Return an AbortController and
    // `stopGeneration` will use it to cancel.
    streamMessage: (message, onChunk, onComplete, onError, attachments) => {
      const controller = new AbortController();

      (async () => {
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, attachments }),
            signal: controller.signal
          });

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n').filter(Boolean)) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                if (data.content) onChunk(data.content);
              }
            }
          }

          onComplete();
        } catch (error) {
          if (!controller.signal.aborted) {
            onError(error instanceof Error ? error.message : 'Stream failed');
          }
        }
      })();

      return controller;
    }
  }
});

<StandardStreamingChat {store} />
```

### Component Variants

**MinimalStreamingChat**:
- Message list + input, error banner
- No Stop button, no Clear button, no per-message actions
- Best for embedded chat

**StandardStreamingChat** (recommended):
- Message list + input
- Stop button while streaming, Clear button
- Best for most use cases

**FullStreamingChat**:
- Standard features
- Per-message actions: Copy, Edit, Regenerate, Delete
- Message reactions (emoji picker per message)
- File attachments (images, video, audio, PDF, documents) with upload progress and a preview modal
- Avatars and prefill support
- Best for feature-rich chat apps

There is no legacy `StreamingChat` component and no voice input in this package.

### Props

All variants:
- `store: Store<StreamingChatState, StreamingChatAction>` - Chat store (required)
- `placeholder?: string` - Input placeholder (default: `'Type your message...'`)
- `class?: string` - Custom CSS class
- `userLabel?: string` - Label for user messages (default: `'You'`)
- `assistantLabel?: string` - Label for assistant messages (default: `'Assistant'`)

**StandardStreamingChat** and **FullStreamingChat** additionally:
- `showClearButton?: boolean` (default: `true`)

**FullStreamingChat** additionally:
- `maxFileSizeMB?: number` (default: `10`)
- `acceptedFileTypes?: string[]` - e.g. `['image/*', '.pdf']`; empty allows all (default)
- `prefillValue?: string` - Value to prefill the input with
- `onPrefillApplied?: () => void` - Called once the prefill has been applied
- `userAvatarUrl?: string`
- `assistantAvatarUrl?: string`

There are no `showReactions` / `showAttachments` / `enableAttachments` /
`enableReactions` flags. A variant either has the feature or it does not.

### State Interface

```typescript
interface StreamingChatState {
  // Messages
  messages: Message[];

  /** Non-null while a response is streaming */
  currentStreaming: {
    content: string;
    abortController?: AbortController;
  } | null;

  /** True between sending and the first chunk */
  isWaitingForResponse: boolean;

  error: string | null;

  /** Message being edited, if any */
  editingMessage: { id: string; content: string } | null;

  /** Attachments staged in the composer, before sending */
  pendingAttachments: MessageAttachment[];

  /**
   * Id of the message `sendMessage` just appended, so the list can animate
   * exactly that one in. Cleared by `restoreMessages`.
   */
  lastAppendedId: string | null;

  /** Attachment preview modal lifecycle */
  attachmentPreview: {
    presentation: PresentationState<MessageAttachment>;
    /** Remove was pressed; the removal waits for the exit animation */
    removeOnDismiss: boolean;
  };

  /** Which message's reaction picker is open. `content` is the message id */
  reactionPicker: PresentationState<string>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  /** Overrides userLabel/assistantLabel for this message */
  senderName?: string;
}

interface MessageAttachment {
  id: string;
  type: 'image' | 'video' | 'pdf' | 'document' | 'audio' | 'file';
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  metadata?: AttachmentMetadata;
  /** Present only once a send has attempted an upload */
  uploadStatus?: 'uploading' | 'success' | 'error';
  uploadProgress?: number;  // 0-100, clamped
  uploadError?: string;
}

interface MessageReaction {
  emoji: string;
  count: number;
  /** Whether the current user is one of them. Absent means "not mine" */
  reactedByMe?: boolean;
}
```

There is no `isLoading` field — the equivalent is `isWaitingForResponse`. There
is no `isStreaming` boolean either; a stream is in flight exactly when
`currentStreaming !== null`.

### Actions

```typescript
type StreamingChatAction =
  // Message sending and streaming
  | { type: 'sendMessage'; message: string; attachments?: MessageAttachment[] }
  | { type: 'chunkReceived'; chunk: string }
  | { type: 'streamComplete' }
  | { type: 'streamError'; error: string }
  | { type: 'stopGeneration' }

  // Message operations
  | { type: 'regenerateMessage'; messageId: string }
  | { type: 'copyMessage'; messageId: string }
  | { type: 'copySuccess' }
  | { type: 'copyError'; error: string }
  | { type: 'deleteMessage'; messageId: string }

  // Message editing (four actions, not one `editMessage`)
  | { type: 'startEditingMessage'; messageId: string }
  | { type: 'updateEditingContent'; content: string }
  | { type: 'submitEditedMessage' }
  | { type: 'cancelEditing' }

  // Attachments
  | { type: 'addAttachment'; attachment: MessageAttachment }
  | { type: 'removeAttachment'; attachmentId: string }
  | { type: 'clearAttachments' }

  // Reactions
  | { type: 'addReaction'; messageId: string; emoji: string }
  | { type: 'removeReaction'; messageId: string; emoji: string }

  // Utility
  | { type: 'clearError' }
  | { type: 'clearMessages' }
  | { type: 'restoreMessages'; messages: Message[] }

  // Attachment preview modal
  | { type: 'attachmentPreviewOpened'; attachment: MessageAttachment }
  | { type: 'attachmentPreviewDismissed' }
  | { type: 'attachmentPreviewRemoveRequested' }
  | { type: 'attachmentPreviewPresentation'; event: ChatPresentationEvent }

  // Reaction picker
  | { type: 'reactionPickerOpened'; messageId: string }
  | { type: 'reactionPickerDismissed' }
  | { type: 'reactionPickerPresentation'; event: ChatPresentationEvent };
```

Notes:
- `sendMessage` carries `message`, not `content`. Omitting `attachments` falls
  back to whatever is in `state.pendingAttachments`.
- `removeReaction` takes the `emoji`, not a reaction id. `addReaction` is
  idempotent — reacting twice with the same emoji does not double the count.
- `ChatPresentationEvent` is chat's own narrow lifecycle union:
  `{ type: 'presentationCompleted' } | { type: 'dismissalCompleted' }`. It is
  declared in `types.ts` but not exported from the package root.
- The union also carries `_internal_`-prefixed members
  (`_internal_setAbortController`, `_internal_attachmentUploadProgress`,
  `_internal_attachmentsResolved`). The reducer dispatches those to itself;
  never send them from a component.

### Dependencies

```typescript
interface StreamingChatDependencies {
  /** Message handler (required) */
  streamMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    attachments?: MessageAttachment[]
  ) => AbortController | void;

  /** @default crypto.randomUUID() */
  generateId?: () => string;

  /** @default Date.now() */
  getTimestamp?: () => number;

  /**
   * Upload a file and resolve to its URL. Optional; when absent, attachments
   * keep the blob URL they were created with.
   */
  uploadFile?: (
    file: File,
    onProgress?: (loaded: number, total: number) => void
  ) => Promise<string>;
}
```

`attachments` is trailing and optional so an existing four-parameter
implementation stays assignable. When `uploadFile` is supplied and the message
carries attachments, the reducer uploads them all first (dispatching progress
per file) and only then calls `streamMessage`, with the resolved URLs in place.
An upload failure is not a send failure: the attachment keeps its local URL,
records `uploadStatus: 'error'`, and the message still goes out.

### Complete Example

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
    // Stream from OpenAI
    streamMessage: (message, onChunk, onComplete, onError, attachments) => {
      const controller = new AbortController();

      (async () => {
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [{ role: 'user', content: message }],
              stream: true
            }),
            signal: controller.signal
          });

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter((l) => l.trim().startsWith('data:'));

            for (const line of lines) {
              const data = line.replace('data: ', '');
              if (data === '[DONE]') {
                onComplete();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;
                if (content) onChunk(content);
              } catch {
                // Skip invalid JSON
              }
            }
          }

          onComplete();
        } catch (error) {
          if (!controller.signal.aborted) {
            onError(error instanceof Error ? error.message : 'Stream failed');
          }
        }
      })();

      return controller;
    },

    // Upload files to your storage. Called on send, before streaming.
    uploadFile: async (file, onProgress) => {
      const formData = new FormData();
      formData.append('file', file);

      onProgress?.(0, file.size);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const { url } = await response.json();
      onProgress?.(file.size, file.size);

      // Resolves to the URL string, not to a MessageAttachment.
      return url;
    }
  }
});
</script>

<div class="chat-container">
  <FullStreamingChat {store} maxFileSizeMB={25} acceptedFileTypes={['image/*', '.pdf']} />
</div>
```

The variants render their own error banner from `state.error`, so a separate
error display is usually redundant.

---

## COLLABORATIVE FEATURES

**Purpose**: Real-time presence tracking, typing indicators, and live cursors for multi-user chat.

`CollaborativeStreamingChatState` is a **separate** state, not an extension of
`StreamingChatState`. Run the two side by side: one store for the conversation,
one for who is in the room. There is no message syncing, CRDT layer or
optimistic-action queue — a `sync_update` frame arriving over the socket is
logged and discarded.

### Quick Start

```typescript
import { createStore } from '@composable-svelte/core';
import {
  collaborativeReducer,
  createInitialCollaborativeState,
  PresenceAvatarStack,
  TypingIndicator
} from '@composable-svelte/chat';

// Create collaborative store
const collabStore = createStore({
  initialState: createInitialCollaborativeState(),
  reducer: collaborativeReducer,
  dependencies: {
    connectWebSocket: (conversationId, userId, onMessage, onConnectionChange) => {
      const ws = new WebSocket(`wss://api.example.com/chat/${conversationId}`);

      ws.onopen = () => {
        onConnectionChange({ status: 'connected', connectedAt: Date.now() });
        ws.send(JSON.stringify({ type: 'join', userId }));
      };

      ws.onmessage = (event) => {
        onMessage(JSON.parse(event.data));
      };

      ws.onclose = () => {
        onConnectionChange({ status: 'disconnected' });
      };

      // Required: the store registers this as a subscription cleanup and runs
      // it on `disconnectFromConversation`, on reconnect, and on destroy().
      return () => ws.close();
    },
    sendWebSocketMessage: async (message) => {
      // Your own socket reference
      ws.send(JSON.stringify(message));
    }
  }
});

// Connect to conversation
collabStore.dispatch({
  type: 'connectToConversation',
  conversationId: 'chat-123',
  userId: 'user-456'
});
```

`connectWebSocket` must return a cleanup function synchronously, on every path
including failure. `connectToConversation` registers it under a single
subscription id, so re-connecting cancels the previous socket first — which is
what makes `reconnectRequested` close-then-open without extra bookkeeping.

The reducer translates these incoming frame types into actions: `user_joined`,
`user_left`, `presence_changed`, `typing_started`, `typing_stopped`,
`cursor_moved`, `cursor_cleared`.

### Collaborative State

```typescript
interface CollaborativeStreamingChatState {
  /** All collaborative users (single source of truth) */
  users: Map<string, CollaborativeUser>;

  /** Current user's ID */
  currentUserId: string | null;

  /** WebSocket connection state */
  connection: WebSocketConnectionState;

  /** Conversation/room ID */
  conversationId: string | null;
}

interface CollaborativeUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  presence: 'active' | 'idle' | 'away' | 'offline';
  typing: TypingInfo | null;
  cursor: CursorPosition | null;
  lastSeen: number;
}

interface TypingInfo {
  target: 'message' | 'edit';
  messageId?: string;
  startedAt: number;
  lastUpdate: number;
}

interface CursorPosition {
  position: number;         // Cursor offset in the text
  selectionLength: number;  // 0 if no selection
  lastUpdate: number;
}

type WebSocketConnectionState =
  | { status: 'disconnected'; reason?: string }
  | { status: 'connecting'; attempt: number }
  | { status: 'connected'; connectedAt: number }
  | { status: 'reconnecting'; attempt: number; nextRetryAt: number }
  | { status: 'failed'; reason: string; canRetry: boolean };
```

There is no `permissions` field on `CollaborativeUser` and no `UserPermissions`
type; there is no `pendingActions` or `syncState` on the state.

### Presence Components

**PresenceBadge** — `presence` (required), `size?: 'sm' | 'md' | 'lg'`, `showText?`, `class?`:
```svelte
<PresenceBadge presence="active" showText={true} />
```

**PresenceAvatarStack** — `users` (required), `maxVisible?` (default 5), `size?`, `class?`:
```svelte
<script>
  import { PresenceAvatarStack, getActiveUsers } from '@composable-svelte/chat';

  const activeUsers = $derived(getActiveUsers($collabStore.users, currentUserId));
</script>

<PresenceAvatarStack users={activeUsers} maxVisible={5} />
```

**PresenceList** — `users` (required), `groupByPresence?`, `showEmptyState?` (default true), `class?`, `locale?`:
```svelte
<PresenceList users={activeUsers} groupByPresence={true} />
```

`PresenceList` renders a relative "last seen" label for users who are not
`active`, using core's `createIntlFormatters()`. `getActiveUsers` carries
`lastSeen` through, so feeding it straight from that selector shows the label.

### Typing Indicators

**TypingIndicator** — `users` (required, `Array<{ id; name; color }>`), `class?`:
```svelte
<script>
  import { TypingIndicator, getTypingUsers } from '@composable-svelte/chat';

  const typingUsers = $derived(
    getTypingUsers($collabStore.users, currentUserId, 'message')
  );
</script>

<TypingIndicator users={typingUsers} />
```

`TypingIndicator` renders nothing when the list is empty, so guarding it with an
`{#if}` is unnecessary. It formats its own text ("Alice is typing", "3 people
are typing"); `formatTypingIndicator(users)` produces the same text with a
trailing ellipsis for use elsewhere.

**TypingUsersList** — `users` (required), `showAvatars?` (default true), `compact?`, `class?`:
```svelte
<TypingUsersList users={typingUsers} />
```

### Cursor Tracking

Live cursors work end to end; `examples/styleguide/src/lib/components/demos/CollaborativeChatDemo.svelte`
is a working demonstration.

**CursorMarker** — `name`, `color`, `left`, `top` (all required), `hasSelection?`, `selectionWidth?`, `class?`:
```svelte
<CursorMarker name={user.name} color={user.color} left={x} top={y} />
```

The name flag is **always visible**, never on hover. The marker floats over a
live text input and must not take pointer events — intercepting one would stop
the user typing — which rules out both hover and `title`.

**CursorOverlay** — `inputElement`, `cursors` and `text` are all **required**, plus `class?`:
```svelte
<script>
  import { CursorOverlay, getCursorPositions } from '@composable-svelte/chat';

  let inputElement = $state<HTMLInputElement | undefined>(undefined);
  let draft = $state('');

  const cursors = $derived(getCursorPositions($collabStore.users, currentUserId));
</script>

<div style="position: relative;">
  <input bind:this={inputElement} bind:value={draft} />
  {#if inputElement}
    <CursorOverlay {inputElement} {cursors} text={draft} />
  {/if}
</div>
```

The overlay measures caret offsets by rendering the text before the caret into a
hidden span, which makes it **single-line only**: pass an `<input>`, not a
wrapping `<textarea>`, or every caret lands on the first line. It also mirrors
the input's horizontal scroll, and reserves a 24px gutter above the field for
the name flags.

**useCursorTracking(store, element, throttleMs = 100)** — `element` is required.
It dispatches `updateCursor` on click, keyup, focus and selection change
(throttled), `clearCursor` on blur, and returns its own teardown:

```svelte
$effect(() => {
  if (!inputElement) return;
  return useCursorTracking(collabStore, inputElement);
});
```

### Collaborative Actions

```typescript
type CollaborativeAction =
  // Connection management
  | { type: 'connectToConversation'; conversationId: string; userId: string }
  | { type: 'connectionStateChanged'; connection: WebSocketConnectionState }
  | { type: 'disconnectFromConversation' }
  | { type: 'reconnectRequested' }

  // User management
  | { type: 'userJoined'; user: CollaborativeUser }
  | { type: 'userLeft'; userId: string }
  | { type: 'userPresenceChanged'; userId: string; presence: UserPresence }
  | { type: 'heartbeatReceived'; userId: string; timestamp: number }

  // Typing indicators
  | { type: 'userStartedTyping'; userId: string; info: TypingInfo }   // remote
  | { type: 'userStoppedTyping'; userId: string }                     // remote
  | { type: 'startTyping'; target: 'message' | 'edit'; messageId?: string }  // local
  | { type: 'stopTyping' }                                            // local

  // Live cursors
  | { type: 'userCursorMoved'; userId: string; cursor: CursorPosition }  // remote
  | { type: 'userCursorCleared'; userId: string }                        // remote
  | { type: 'updateCursor'; position: number; selectionLength: number }  // local
  | { type: 'clearCursor' };                                             // local
```

The `user*` actions apply someone else's state, arriving from the socket. The
bare `startTyping` / `stopTyping` / `updateCursor` / `clearCursor` actions are
the local user's: they update `currentUserId`'s entry optimistically **and**
send a `sendWebSocketMessage` frame. They no-op when `currentUserId` is null.

`connectionStateChanged` carries `connection`, not `state`.

### Complete Collaborative Example

```svelte
<script lang="ts">
import { onMount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import {
  StandardStreamingChat,
  streamingChatReducer,
  createInitialStreamingChatState,
  createMockStreamingChat,
  collaborativeReducer,
  createInitialCollaborativeState,
  generateRandomUserColor,
  PresenceAvatarStack,
  TypingIndicator,
  CursorOverlay,
  getActiveUsers,
  getTypingUsers,
  getCursorPositions,
  useTypingEmitter,
  useCursorTracking,
  usePresenceTracking,
  useHeartbeat,
  type CollaborativeDependencies
} from '@composable-svelte/chat';

const currentUserId = 'user-123';

let ws: WebSocket;

// One store for the conversation...
const chatStore = createStore({
  initialState: createInitialStreamingChatState(),
  reducer: streamingChatReducer,
  dependencies: createMockStreamingChat()
});

// ...and one for who is in the room.
const collabDeps: CollaborativeDependencies = {
  connectWebSocket: (conversationId, userId, onMessage, onConnectionChange) => {
    ws = new WebSocket(`wss://api.example.com/chat/${conversationId}`);

    ws.onopen = () => {
      onConnectionChange({ status: 'connected', connectedAt: Date.now() });
      ws.send(
        JSON.stringify({
          type: 'join',
          userId,
          user: {
            id: userId,
            name: 'Current User',
            color: generateRandomUserColor(userId),
            presence: 'active',
            typing: null,
            cursor: null,
            lastSeen: Date.now()
          }
        })
      );
    };

    ws.onmessage = (event) => onMessage(JSON.parse(event.data));

    ws.onerror = () => {
      onConnectionChange({ status: 'failed', reason: 'Connection failed', canRetry: true });
    };

    ws.onclose = () => {
      onConnectionChange({ status: 'disconnected' });
    };

    return () => ws.close();
  },

  sendWebSocketMessage: async (message) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  },

  generateUserColor: generateRandomUserColor
};

const collabStore = createStore({
  initialState: createInitialCollaborativeState(),
  reducer: collaborativeReducer,
  dependencies: collabDeps
});

// Typing indicators for the local user. Throttled, auto-stops after 3s idle.
const typing = useTypingEmitter(collabStore, 'message');

// Connect once. Not an `$effect`: dispatching reads the store's state, so an
// effect that dispatches re-runs itself forever.
onMount(() => {
  collabStore.dispatch({
    type: 'connectToConversation',
    conversationId: 'chat-room-123',
    userId: currentUserId
  });

  const stopPresence = usePresenceTracking(collabStore, currentUserId);
  const stopHeartbeat = useHeartbeat(collabStore, currentUserId);

  return () => {
    stopPresence();
    stopHeartbeat();
    typing.cleanup();
    collabStore.destroy();  // runs the connectWebSocket cleanup
  };
});

let draft = $state('');
let inputElement = $state<HTMLInputElement | undefined>(undefined);

$effect(() => {
  if (!inputElement) return;
  return useCursorTracking(collabStore, inputElement);
});

// Derived state
const activeUsers = $derived(getActiveUsers($collabStore.users, currentUserId));
const typingUsers = $derived(getTypingUsers($collabStore.users, currentUserId, 'message'));
const cursors = $derived(getCursorPositions($collabStore.users, currentUserId));
</script>

<div class="collaborative-chat">
  <!-- Presence indicators -->
  <div class="chat-header">
    <h2>Team Chat</h2>
    <PresenceAvatarStack users={activeUsers} maxVisible={5} />
  </div>

  <!-- Chat interface (its own store) -->
  <StandardStreamingChat store={chatStore} />

  <!-- Shared draft line with live cursors -->
  <div style="position: relative;">
    <input
      bind:this={inputElement}
      bind:value={draft}
      oninput={() => typing.start()}
      onblur={() => typing.stop()}
    />
    {#if inputElement}
      <CursorOverlay {inputElement} {cursors} text={draft} />
    {/if}
  </div>

  <!-- Typing indicator (renders nothing when nobody is typing) -->
  <TypingIndicator users={typingUsers} />

  <!-- Connection status -->
  <div class="connection-status">
    {$collabStore.connection.status}
  </div>
</div>
```

---

## MOCK UTILITIES

**Purpose**: Testing and development without backend.

```typescript
import { createMockStreamingChat } from '@composable-svelte/chat';

const store = createStore({
  initialState: createInitialStreamingChatState(),
  reducer: streamingChatReducer,
  dependencies: createMockStreamingChat()
});
```

`createMockStreamingChat()` takes no configuration. It streams a canned markdown
response word by word — 300ms lead-in, 50ms between words — honours the
`AbortController` it returns, and picks an image-gallery or video-embed response
when the message mentions images or videos. It supplies no `uploadFile`, so
attachments keep their local URLs under it, and its delays make it unsuitable
for a `TestStore` (see StreamingChat Testing above).

---

## COMPONENT SELECTION GUIDE

**When to use each variant**:

**MinimalStreamingChat**:
- Embedded chat
- Minimal UI needed
- Custom chrome/header

**StandardStreamingChat** (recommended):
- Most use cases
- Need Stop and Clear
- Good defaults

**FullStreamingChat**:
- Feature-rich chat app
- Need reactions
- Need attachments
- Need per-message copy/edit/regenerate/delete

**Collaborative Features**:
- Multi-user chat
- Team collaboration
- Need presence, typing indicators, or live cursors

---

## CROSS-REFERENCES

**Related Skills**:
- **composable-svelte-core**: Store, reducer, Effect system, Motion One animation helpers
- **composable-svelte-code**: Prism syntax highlighting in messages (optional peer)
- **composable-svelte-media**: `VideoEmbed`, used for videos detected in message markdown (optional peer)
- **composable-svelte-components**: UI components

**When to Use Each Package**:
- **chat**: Real-time chat, streaming responses, LLM interfaces
- **media**: Audio players, video embeds, standalone voice input (chat itself has none)
- **code**: Code editors, syntax highlighting
- **core**: Base architecture (Store, reducer, effects)

---

## TESTING PATTERNS

### StreamingChat Testing

**Do not use `createMockStreamingChat()` here.** It fakes a realistic reply — a
300ms lead-in, then a word every 50ms, forty-odd words — while `receive` times
out after one second and `finish()` refuses to pass with any dispatched action
unasserted. A one-chunk fake is what a reducer test wants; the mock is for demos
and component tests, where the delays are the point.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { streamingChatReducer, createInitialStreamingChatState } from '@composable-svelte/chat';

describe('StreamingChat', () => {
  // `finish()` advances virtual time, and throws outright if the timer APIs
  // are not mocked.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends a message and receives the reply', async () => {
    let chunk!: (text: string) => void;
    let complete!: () => void;

    const store = new TestStore({
      initialState: createInitialStreamingChatState(),
      reducer: streamingChatReducer,
      dependencies: {
        // Hand the callbacks out rather than calling them here: `send` starts
        // the effect *before* running its assertion, so a fake that streams
        // synchronously means the whole reply lands first and every line of
        // that assertion is wrong.
        streamMessage: (_message, onChunk, onComplete) => {
          chunk = onChunk;
          complete = onComplete;
        },
        generateId: () => 'm1',
        getTimestamp: () => 0
      }
    });

    await store.send({ type: 'sendMessage', message: 'Hello' }, (state) => {
      expect(state.messages).toHaveLength(1);
      expect(state.isWaitingForResponse).toBe(true);
      expect(state.currentStreaming).toEqual({ content: '' });
    });

    chunk('Hi');
    await store.receive({ type: 'chunkReceived', chunk: 'Hi' }, (state) => {
      expect(state.currentStreaming?.content).toBe('Hi');
    });

    complete();
    await store.receive({ type: 'streamComplete' }, (state) => {
      expect(state.currentStreaming).toBeNull();
      expect(state.messages).toHaveLength(2); // User + assistant
    });

    await store.finish();
  });
});
```

This example is `packages/chat/tests/teststore-example.test.ts`, so it is run on
every build rather than trusted.

`createTestStore(config)` is the function form of the same thing; both are
exported from `@composable-svelte/core/test`.

### Collaborative Testing

```typescript
import { TestStore } from '@composable-svelte/core/test';
import {
  collaborativeReducer,
  createInitialCollaborativeState
} from '@composable-svelte/chat';

const store = new TestStore({
  initialState: createInitialCollaborativeState(),
  reducer: collaborativeReducer,
  dependencies: {
    connectWebSocket: vi.fn(() => () => {}),  // must return a cleanup
    sendWebSocketMessage: vi.fn()
  }
});

// Test user join — `user` must be a complete CollaborativeUser
await store.send({
  type: 'userJoined',
  user: {
    id: 'user-2',
    name: 'Alice',
    color: '#3b82f6',
    presence: 'active',
    typing: null,
    cursor: null,
    lastSeen: 0
  }
}, (state) => {
  expect(state.users.size).toBe(1);
  expect(state.users.get('user-2')?.name).toBe('Alice');
});

// Test typing indicator
await store.send({
  type: 'userStartedTyping',
  userId: 'user-2',
  info: {
    target: 'message',
    startedAt: Date.now(),
    lastUpdate: Date.now()
  }
}, (state) => {
  expect(state.users.get('user-2')?.typing).toBeTruthy();
});
```

---

## TROUBLESHOOTING

**Streaming not working**:
- `streamMessage` is callback-based, not an async generator — call `onChunk`,
  then `onComplete` exactly once
- Return the `AbortController`, or `stopGeneration` has nothing to abort
- `chunkReceived` is ignored while `currentStreaming` is null, so chunks arriving
  after `streamComplete` are dropped
- Check network tab for response streaming

**Attachments never reach the backend**:
- Read the fifth `streamMessage` parameter; it is where they arrive
- Without a `uploadFile` dependency the URLs stay blob URLs, which only resolve
  in the sender's own browser

**WebSocket connection failing**:
- Verify WebSocket URL (wss:// for HTTPS, ws:// for HTTP)
- `connectWebSocket` must return a cleanup function on every path, failure
  included — the store calls it on disconnect, reconnect and destroy
- Check CORS/authentication headers
- Check browser console for errors

**Markdown not rendering**:
- Verify message content is valid markdown
- Syntax highlighting needs `prismjs` installed; it is an optional peer and
  degrades to unhighlighted code blocks when absent
- Rendered HTML is sanitised, so raw HTML in a message may be stripped

**Presence or cursors not updating**:
- Verify the socket is delivering the frame types the reducer handles
  (`user_joined`, `user_left`, `presence_changed`, `typing_started`,
  `typing_stopped`, `cursor_moved`, `cursor_cleared`)
- `userJoined` must arrive before any action referencing that user; the other
  reducers no-op on an unknown id
- `getActiveUsers` / `getTypingUsers` / `getCursorPositions` all exclude
  `currentUserId` — passing the wrong id makes the local user appear as a peer
- `CursorOverlay` measures one line; a wrapping `<textarea>` puts every caret on
  the first line

---

## COMPLETE API REFERENCE

All exports from `@composable-svelte/chat`:

### Component Variants

- `MinimalStreamingChat` - Message list + input
- `StandardStreamingChat` - Recommended variant (Stop + Clear)
- `FullStreamingChat` - Feature-rich (per-message actions, reactions, attachments)

### Primitive Components

- `SimpleChatMessage` - Basic message bubble
- `ChatMessage` - Message bubble with markdown, attachments and reaction display

### Collaborative Presence Components

- `PresenceBadge` - User presence status indicator
- `PresenceAvatarStack` - Stacked avatar display for active users
- `PresenceList` - Full user presence list with grouping and "last seen"
- `TypingIndicator` - Animated typing indicator
- `TypingUsersList` - List of users currently typing
- `CursorMarker` - Single user cursor position marker
- `CursorOverlay` - Overlay showing all user cursors on one input

### Reducers & State Factories

- `streamingChatReducer`
- `createInitialStreamingChatState()`
- `collaborativeReducer`
- `createInitialCollaborativeState()`

### Collaborative Hooks

- `usePresenceTracking(store, userId)` - Activity-driven presence, broadcast over
  the socket; returns cleanup. Reports `active`/`idle`/`away`, never `offline` —
  that is a disconnect, not an idle timer.
- `useTypingEmitter(store, target, messageId?)` - Returns `{ start, stop, update, cleanup }`
- `useCursorTracking(store, element, throttleMs = 100)` - Returns cleanup
- `useHeartbeat(store, userId, intervalMs = 30000)` - Periodic keep-alive frame,
  so a server that drops idle connections does not drop a quiet one; returns
  cleanup

### Helper Functions

- `getTypingUsers(users, currentUserId, target?)` - Users currently typing
- `getActiveUsers(users, currentUserId)` - Non-offline users
- `getCursorPositions(users, currentUserId)` - Cursor positions of other users
- `formatTypingIndicator(users)` - e.g. "Alice is typing"
- `generateRandomUserColor(userId)` - Deterministic HSL colour from an id

### Testing Utilities

- `createMockStreamingChat()` - Mock dependencies; takes no arguments

### Cleanup Utilities

- `CleanupTracker` - Tracks timers, intervals, listeners and custom cleanups
- `createCleanupTracker()` - Factory

### Types

- `Message`
- `MessageAttachment`
- `AttachmentMetadata`
- `MessageReaction`
- `StreamingChatState`
- `StreamingChatAction`
- `StreamingChatDependencies`
- `CollaborativeUser`
- `UserPresence`
- `TypingInfo`
- `CursorPosition`
- `CollaborativeStreamingChatState`
- `CollaborativeAction`
- `CollaborativeDependencies`
- `WebSocketConnectionState`
- `CleanupFunction`

### Constants

- `DEFAULT_REACTIONS` - `['👍', '❤️', '😂', '🎉', '🤔', '👎', '✅', '❌']`

### Available only from the `@composable-svelte/chat/streaming-chat` subpath

Not re-exported from the package root:

- `ActionButtons`, `ChatMessageWithActions` - components
- `createAttachmentFromFile`, `detectFileType`, `extractFileMetadata`,
  `formatFileSize`, `validateFileSize`, `validateFileType`, `createFileBlobURL`,
  `revokeFileBlobURL`, `getFileExtension`, `getFileTypeIcon` - file utilities

`ActionButtons` must be rendered inside a `ChatMessage`, through its
`headerActions` snippet: the buttons stay hidden until the surrounding
`.chat-message` is hovered or holds focus.

Markdown helpers (`renderMarkdown`, `extractImagesFromMarkdown`,
`extractVideosFromMarkdown`, `attachCopyButtons`) live at
`@composable-svelte/chat/streaming-chat/markdown`.
