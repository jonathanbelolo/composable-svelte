# @composable-svelte/chat

Streaming chat components with collaborative features for Composable Svelte. Built for LLM interactions with a transport-agnostic design.

## Features

- **Transport-agnostic** - Bring your own streaming backend (WebSocket, SSE, REST, etc.)
- **Three UI tiers** - Minimal, Standard, and Full chat variants for different complexity needs
- **Markdown rendering** - Built-in markdown support with code highlighting via marked
- **File attachments** - Attach images, documents, and media to messages
- **Message reactions** - Emoji reactions on messages
- **Message editing** - Edit and delete sent messages
- **Collaborative** - Real-time presence, typing indicators, and live cursors
- **Bring your own socket** - You supply `connectWebSocket`; the store owns its
  teardown, including across reconnects
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
      streamMessage: (message, onChunk, onComplete, onError, attachments) => {
        const controller = new AbortController();

        (async () => {
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              body: JSON.stringify({ message, attachments }),
              signal: controller.signal
            });
            // Read response.body and call onChunk(text) per chunk...
            onComplete();
          } catch (e) {
            onError(String(e));
          }
        })();

        return controller; // Returned so `stopGeneration` can abort
      }
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

Attachments and reactions are not feature flags — `FullStreamingChat` is the
variant that has them.

```svelte
<FullStreamingChat
  {store}
  userLabel="You"
  assistantLabel="Assistant"
  maxFileSizeMB={10}
  acceptedFileTypes={['image/*', 'application/pdf']}
/>
```

### SimpleChatMessage / ChatMessage

Individual message components for custom layouts. The role comes from the
message, not from a prop:

```svelte
<ChatMessage message={msg} userLabel="You" assistantLabel="Assistant" />
```

`ChatMessage` renders markdown, attachments, reactions and video embeds;
`SimpleChatMessage` renders text and a timestamp.

## Collaborative Features

For multi-user chat with real-time presence:

```svelte
<script lang="ts">
  import {
    PresenceAvatarStack,
    TypingIndicator,
    getActiveUsers,
    getTypingUsers
  } from '@composable-svelte/chat';

  // Users live in one flat Map — there is no `presence` sub-object. Both
  // selectors take your own id and leave you out, so nobody is shown their own
  // presence dot or told that they are typing.
  const online = $derived(getActiveUsers($store.users, currentUserId));
  const typing = $derived(getTypingUsers($store.users, currentUserId, 'message'));
</script>

<PresenceAvatarStack users={online} />
<TypingIndicator users={typing} />
```

### Live cursors

`CursorOverlay` floats other users' carets over your composer. It measures a
single line, so give it an `<input>` rather than a wrapping `<textarea>`, and it
must not take pointer events — which is why each marker's name flag is always
visible rather than shown on hover.

```svelte
<script lang="ts">
  import { CursorOverlay, getCursorPositions, useCursorTracking } from '@composable-svelte/chat';

  let inputElement = $state<HTMLInputElement | undefined>(undefined);
  let draft = $state('');

  // Returns its own teardown, which is what an effect wants returned.
  $effect(() => {
    if (!inputElement) return;
    return useCursorTracking(store, inputElement);
  });
</script>

<input type="text" bind:this={inputElement} bind:value={draft} />
{#if inputElement}
  <CursorOverlay {inputElement} text={draft}
    cursors={getCursorPositions($store.users, currentUserId)} />
{/if}
```

`examples/styleguide`'s Collaborative Chat page runs this end to end.

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
  currentStreaming: { content: string; abortController?: AbortController } | null;
  isWaitingForResponse: boolean;
  error: string | null;
  editingMessage: { id: string; content: string } | null;
  pendingAttachments: MessageAttachment[];
  /** The message just sent — the one thing on screen that is new rather than
      merely present, so a restored session does not animate every message in. */
  lastAppendedId: string | null;
  attachmentPreview: AttachmentPreviewState;
  /** One picker for the whole conversation; `content` is the message id. */
  reactionPicker: PresentationState<string>;
}
```

`createInitialStreamingChatState()` returns all of it. The last three fields are
lifecycles rather than data — see *Animation* below.

### Key Actions

| Action | Description |
|--------|-------------|
| `sendMessage` | Send a user message (`message`, plus optional `attachments`) and start streaming |
| `stopGeneration` | Abort streaming in progress |
| `addAttachment` / `removeAttachment` / `clearAttachments` | Manage pending attachments; removal is by `attachmentId` |
| `startEditingMessage` / `updateEditingContent` / `submitEditedMessage` / `cancelEditing` | The edit cycle — there is no single `editMessage` |
| `deleteMessage` | Remove a message. Deleting a *user* message also drops everything after it |
| `addReaction` / `removeReaction` | Toggle an emoji. `addReaction` is idempotent and `removeReaction` refuses a reaction that is not yours |
| `reactionPickerOpened` / `reactionPickerDismissed` | Open and close the picker |
| `attachmentPreviewOpened` / `attachmentPreviewDismissed` / `attachmentPreviewRemoveRequested` | The preview modal |
| `restoreMessages` | Restore a previous session |
| `clearMessages` / `clearError` | Reset |

### Dependencies

```typescript
interface StreamingChatDependencies {
  streamMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    /** Attachments, with `uploadFile`'s URLs already resolved. Trailing and
        optional, so an existing four-parameter implementation still fits. */
    attachments?: MessageAttachment[]
  ) => AbortController | void;

  /** Both default: `crypto.randomUUID()` and `Date.now()`. */
  generateId?: () => string;
  getTimestamp?: () => number;

  /**
   * Upload a file and return its URL. Called on **send**, not on attach, so
   * nothing is uploaded until the user commits. Without it, attachments keep
   * the blob URLs they were created with, which do not survive a reload.
   */
  uploadFile?: (
    file: File,
    onProgress?: (loaded: number, total: number) => void
  ) => Promise<string>;
}
```

An upload that fails does not block the send: the attachment keeps its local URL,
`uploadStatus` becomes `'error'`, and the message goes out — the sender still
sees their file, and `uploadError` says why nobody else will.

### Reactions

```typescript
interface MessageReaction {
  emoji: string;
  count: number;
  /** Whether the current user is one of them. */
  reactedByMe?: boolean;
}
```

One bit rather than the list of who reacted: a popular message would otherwise
ship thousands of user ids to render "👍 12". It is also why nothing here needs a
current-user identity — the flag *is* the answer to "did I react?".

### Animation

This package runs no CSS lifecycle animations. Anything that appears, disappears,
expands or collapses uses a Motion One helper from
`@composable-svelte/core/animation`, so the store can sequence on it and a test
can observe it. The two overlays — the attachment preview and the reaction picker
— carry a `PresentationState` and animate both halves; message entry and the
image/video fades are fire-and-forget.

`guides/ANIMATION-GUIDELINES.md` is the rule, and
`packages/core/tests/repo/animation-policy.test.ts` enforces it.

## Testing

```typescript
import { createTestStore } from '@composable-svelte/core/test';
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

await store.send({ type: 'sendMessage', message: 'Hello' }, (state) => {
  expect(state.messages).toHaveLength(1);
});
```

`createMockStreamingChat()` supplies a complete set of dependencies that fakes a
streamed reply, for demos and for tests that do not care about the transport.

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
| `createMockStreamingChat()` | A full set of dependencies that fakes a streamed reply |
| `collaborativeReducer` | Reducer for collaborative features |
| `createInitialCollaborativeState()` | Initial state for the above |
| `getActiveUsers(users, currentUserId)` | Everyone present but you, minus the offline |
| `getTypingUsers(users, currentUserId, target?)` | Everyone typing but you |
| `getCursorPositions(users, currentUserId)` | Every caret but yours, for `CursorOverlay` |
| `formatTypingIndicator(users)` | "Ada is typing…", "3 people are typing…" |
| `generateRandomUserColor(userId)` | Stable colour from an id |

Markdown helpers — `renderMarkdown`, `extractVideosFromMarkdown`,
`extractImagesFromMarkdown` — are on the `@composable-svelte/chat/streaming-chat/markdown`
subpath rather than the root barrel. Video extraction returns `[]` until
`@composable-svelte/media` has loaded, since that peer is optional and imported
dynamically.

All three selectors take the current user's id and exclude them: nobody is shown
their own presence dot, told that they are typing, or given their own caret.

## Dependencies

- **Runtime**: [marked](https://github.com/markedjs/marked) (markdown parsing)
- **Peer**: `@composable-svelte/core`, `svelte`
- **Optional**: `@composable-svelte/code`, `@composable-svelte/media`, `prismjs`, `pdfjs-dist`
