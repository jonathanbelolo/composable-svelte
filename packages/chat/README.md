# @composable-svelte/chat

Streaming chat components with collaborative features for Composable Svelte. Built for LLM interactions with a transport-agnostic design.

## Features

- **Transport-agnostic** - Bring your own streaming backend (WebSocket, SSE, REST, etc.)
- **Three UI tiers** - Minimal, Standard, and Full chat variants for different complexity needs
- **Markdown rendering** - via `marked`, with optional Prism syntax highlighting
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
pnpm add @composable-svelte/media  # YouTube/Vimeo/Twitch embeds detected in markdown
pnpm add prismjs                   # Prism.js syntax highlighting
pnpm add pdfjs-dist                # PDF attachment previews
```

Each is loaded on first use with a dynamic `import()`, never by the package
entry points, and none appears in the published type declarations. Without
them, code blocks render as plain escaped text, video links stay links, and a
PDF attachment shows an error in its own preview instead of a page; nothing else
changes. A peer installed later is picked up on the next load, with no code
change. Without `prismjs`, a production Vite build (client or `--ssr`) resolves
the import to an empty stub rather than failing it. The chat recognises the stub
as "not installed", so code blocks render quietly, with no per-block warning.
`scripts/verify-optional-peers.mjs` in the repository checks this against a
packed install with none of the four present, including that the console stays
clean.

## Quick Start

<!-- consumer-file: Chat.svelte -->
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
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ message, attachments }),
              signal: controller.signal
            });
            if (!response.ok || !response.body) {
              throw new Error(`Chat request failed (${response.status})`);
            }
            // This example's endpoint streams plain UTF-8 text, not SSE frames.
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onChunk(decoder.decode(value, { stream: true }));
              }
              const tail = decoder.decode();
              if (tail) onChunk(tail);
            } finally {
              reader.releaseLock();
            }
            onComplete();
          } catch (e) {
            if (!controller.signal.aborted) onError(String(e));
          }
        })();

        return controller; // Returned so `stopGeneration` can abort
      }
    }
  });
</script>

<FullStreamingChat {store} />
```

The application supplies `POST /api/chat`: this example sends JSON and expects a
plain UTF-8 streaming response. For SSE or another protocol, decode its frames in
`streamMessage` before calling `onChunk`. Non-success HTTP responses become errors.

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

`ChatMessage` renders markdown, attachments, reactions, image galleries and
video embeds. `SimpleChatMessage` renders markdown for assistant messages too,
with copy buttons on code blocks — it leaves out the attachment, reaction and
embed machinery, not the formatting.

## Collaborative Features

**Collaboration is a second store.** `collaborativeReducer` has its own state —
`CollaborativeStreamingChatState` does not extend `StreamingChatState`, and the
chat store has no `users` field. Build both and let each do its own job.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createStore } from '@composable-svelte/core';
  import {
    collaborativeReducer,
    createInitialCollaborativeState,
    PresenceAvatarStack,
    TypingIndicator,
    getActiveUsers,
    getTypingUsers
  } from '@composable-svelte/chat';

  const currentUserId = 'me';

  const collabStore = createStore({
    initialState: createInitialCollaborativeState(),
    reducer: collaborativeReducer,
    dependencies: {
      connectWebSocket: (conversationId, userId, onMessage, onConnectionChange) => {
        // See "Supplying the connection" below. A cleanup is required.
        const socket = new WebSocket(`wss://chat.example.com/${conversationId}`);
        socket.onmessage = (e) => onMessage(JSON.parse(e.data));
        socket.onopen = () => onConnectionChange({ status: 'connected', connectedAt: Date.now() });
        return () => socket.close();
      },
      sendWebSocketMessage: async (message) => {
        /* send it */
      }
    }
  });

  // Nothing works until this: it is what opens the socket and what tells the
  // store who you are. Presence, typing and cursors all no-op without it.
  onMount(() => {
    collabStore.dispatch({
      type: 'connectToConversation',
      conversationId: 'room-1',
      userId: currentUserId
    });
    return () => collabStore.destroy();
  });

  // Users live in one flat Map — there is no `presence` sub-object. Both
  // selectors take your own id and leave you out, so nobody is shown their own
  // presence dot or told that they are typing.
  const online = $derived(getActiveUsers($collabStore.users, currentUserId));
  const typing = $derived(getTypingUsers($collabStore.users, currentUserId, 'message'));
</script>

<PresenceAvatarStack users={online} />
<TypingIndicator users={typing} />
```

### Live cursors

`CursorOverlay` floats other users' carets over your composer. It measures a
single line, so give it an `<input>` rather than a wrapping `<textarea>`, and it
must not take pointer events — which is why each marker's name flag is always
visible rather than shown on hover.

Continuing from the collaborative store above:

```svelte
<script lang="ts">
  import { CursorOverlay, getCursorPositions, useCursorTracking } from '@composable-svelte/chat';

  let inputElement = $state<HTMLInputElement | undefined>(undefined);
  let draft = $state('');

  // Returns its own teardown, which is what an effect wants returned.
  $effect(() => {
    if (!inputElement) return;
    return useCursorTracking(collabStore, inputElement);
  });
</script>

<input type="text" bind:this={inputElement} bind:value={draft} />
{#if inputElement}
  <CursorOverlay {inputElement} text={draft}
    cursors={getCursorPositions($collabStore.users, currentUserId)} />
{/if}
```

`examples/styleguide`'s Collaborative Chat page is the full working version —
same wiring, plus seeded users and a mock socket so it runs without a server.

### Collaborative Hooks

Each takes the **collaborative** store, and each only transmits once
`connectToConversation` has run. Three return a teardown function;
`useTypingEmitter` returns an object with one on it.

| Hook | Signature | Purpose |
|------|-----------|---------|
| `usePresenceTracking` | `(store)` | Watches activity and broadcasts `active` / `idle` / `away`. It never reports `offline` — that is a disconnect, not an idle timer. |
| `useTypingEmitter` | `(store, target, messageId?)` | Returns `{ start, stop, update, cleanup }` rather than a bare teardown |
| `useCursorTracking` | `(store, element, throttleMs?)` | Shares the caret position in `element` |
| `useHeartbeat` | `(store, intervalMs?)` | Periodic keep-alive so a server that drops idle connections does not drop a quiet one |

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

The return type is `() => void`, not optional: a cleanup is required on every
path, including the failure path, because the store is what runs it. Reports made
from inside a cleanup are ignored, so a socket's `onclose` cannot overwrite the
state of the connection that replaced it.

## Managed applications

The chat variants (`MinimalStreamingChat`, `StandardStreamingChat`,
`FullStreamingChat`), the `./streaming-chat` primitives that take a store
(`ChatMessageWithActions`, `ActionButtons`) and the four collaborative hooks
accept either a standalone `Store` or the managed `ChildView` a feature view
receives from `@composable-svelte/core/application` (`FeatureViewProps.store`,
`composition.bind`, typed `scopeTo`). Pass the view you were given, unchanged.
`ChatMessage`, `SimpleChatMessage` and the presence, typing and cursor
components take plain props and need no store.

The chat reducer composes like any other child: `streamingChatReducer` goes in a
slot, and it reads `StreamingChatDependencies` from the application's
`dependencies`. This recipe keeps completed replies and reaction changes as
parent state:

```svelte
<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    FullStreamingChat,
    streamingChatReducer,
    createInitialStreamingChatState,
    type StreamingChatAction,
    type StreamingChatDependencies,
    type StreamingChatState
  } from '@composable-svelte/chat';

  // The same dependencies as the standalone Quick Start (`streamMessage`, ...).
  let { dependencies }: { dependencies: StreamingChatDependencies } = $props();

  type Support = {
    chat: StreamingChatState | null;
    replies: { messageId: string; content: string }[];
    reactions: { messageId: string; emoji: string; on: boolean }[];
  };
  type SupportAction =
    | { type: 'chat'; action: PresentationAction<StreamingChatAction> }
    | { type: 'openChat' }
    | { type: 'closeChat' };

  // The chat reduces its own actions first, then the parent sees each one once.
  // Reactions, deletes and edits only change the chat's local state: sending
  // them to a server is the parent's job, here or in an effect of its own.
  const support: Reducer<Support, SupportAction, StreamingChatDependencies> = (state, action) => {
    switch (action.type) {
      case 'openChat':
        return [{ ...state, chat: state.chat ?? createInitialStreamingChatState() }, Effect.none()];
      case 'closeChat':
        // Retiring the slot aborts the stream and cancels any upload in flight.
        return [{ ...state, chat: null }, Effect.none()];
      case 'chat': {
        if (action.action.type !== 'presented') return [state, Effect.none()];
        const child = action.action.action;
        if (child.type === 'streamComplete') {
          // The chat ignores a completion with no reply in flight, but the parent
          // still receives it: archive each reply once, by its message id.
          const reply = state.chat?.messages.at(-1);
          return reply?.role === 'assistant' && !state.replies.some((r) => r.messageId === reply.id)
            ? [{ ...state, replies: [...state.replies, { messageId: reply.id, content: reply.content }] }, Effect.none()]
            : [state, Effect.none()];
        }
        if (child.type === 'addReaction' || child.type === 'removeReaction') {
          const change = { messageId: child.messageId, emoji: child.emoji, on: child.type === 'addReaction' };
          return [{ ...state, reactions: [...state.reactions, change] }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    }
  };

  const chatSlot = optionalSlot<Support, SupportAction>()('chat');
  const composition = new ManagedIntegrationBuilder(support).with(chatSlot, streamingChatReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Support => ({ chat: null, replies: [], reactions: [] })
  });
  const views = defineViews(composition, { chat: { content: chatView } });
</script>

{#snippet chatView({ store }: FeatureViewProps<StreamingChatState, StreamingChatAction>)}
  <FullStreamingChat {store} />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          {#if app.store.state.chat}
            <button onclick={() => app.store.dispatch({ type: 'closeChat' })}>Close chat</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'openChat' })}>Open chat</button>
          {/if}
          <FeatureOutlet view={outlets.chat} />
          <p>{app.store.state.replies.length} replies archived</p>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

- **The stream and uploads belong to the owner.** `streamMessage` runs in a
  store-owned subscription and each message's uploads in a cancellable effect,
  exactly as with a standalone store. Removing the slot, replacing it
  (`replaceOn`) or destroying the root aborts the controller `streamMessage`
  returned, cancels uploads in flight, and drops any chunk, completion or
  upload result that arrives afterwards. Sibling chats in one application do
  not share streams or uploads, although they use the same effect ids.
- **Retirement.** A managed view's state becomes `undefined` when its owner
  retires. Every component then renders nothing. `FullStreamingChat` revokes
  the blob URLs of attachments still waiting in its composer, as it does when it
  unmounts. Rendered through `FeatureOutlet`, the component is also unmounted; a
  view you bind by hand and render yourself behaves the same way. A
  replacement owner is a new view with fresh state (its stream ids start again
  at `1`, so ownership, not the id, is what rejects its predecessor's late
  callbacks): bind it again, or render through `FeatureOutlet`.
- **A chat's `store` can change.** A variant that is not keyed and receives a
  different `store` clears its unsent draft first, so text typed into one
  conversation is never sent to another. Files being read when the store
  changes are added to the store they were picked in, or released if that
  owner has retired. `FullStreamingChat` does not revoke the previous
  conversation's pending attachments on the change, since that conversation
  still holds them. It keeps following the previous store while it stays
  mounted, and revokes those attachments when that store's owner retires. When
  it unmounts, it revokes the pending attachments of every conversation it still
  holds.
- **The collaborative hooks release themselves** when a managed owner retires:
  window and input listeners, the heartbeat interval and typing timers go with
  it, and calling the returned teardown afterwards is harmless. So is calling
  `useTypingEmitter`'s `start`, `update` or `stop`: once released, they
  dispatch nothing and start no timer. The socket is
  the owner's subscription and closes too. With a standalone store nothing
  retires; call the teardown, as before.

**Business results go through the parent reducer.** The chat reduces each
action first; the parent then receives it, wrapped as
`{ type: 'chat', action: { type: 'presented', action } }`, and reads the
child's updated state. What the chat does itself, and what is left to you:

| Child action | What the chat does | What the parent typically does |
|---|---|---|
| `sendMessage` | Appends the message, uploads attachments (`uploadFile`), calls `streamMessage` | Record the prompt; there is no separate `messageSent` |
| `streamComplete` / `streamError` | Settles the reply or shows the error; ignores a completion with no reply in flight | Persist the reply, which is the child's last message, once per message id |
| `streamSuperseded` | Nothing: a newer send, edit or regeneration took over | Offer a retry, or ignore it |
| `copyMessage` → `copySuccess` / `copyError` | Writes to the clipboard | Show a confirmation |
| `addReaction` / `removeReaction` | Updates the local count | Send it to your server |
| `deleteMessage`, `submitEditedMessage`, `clearMessages` | Updates the local conversation (an edit re-streams) | Mirror it on your server |

Nothing in the chat sends reactions, deletions or edits anywhere: without a
parent that does, they last as long as the chat's state.

Operational limits:

- There is no action callback on any chat component, and none is needed under
  managed composition. Observe business results in the parent reducer, as
  above, not with `observeChildActions`: it is for native commands, and chat
  has none.
- The unsent draft and scroll position are component state. They do not
  survive a remount, and a hidden chat keeps nothing but its store.
- The blob URLs of attachments already *sent* are not revoked when the owner
  retires, because messages may be moved or archived by the parent. Use
  `uploadFile`, so sent attachments point at your server rather than at the
  tab's memory.

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

The npm archive includes a [runnable managed recipe](./recipes/managed/README.md)
and a deterministic stream handoff and retirement test.

<!-- consumer-file: chat.test.ts -->
```typescript
import { describe, it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { streamingChatReducer, createInitialStreamingChatState } from '@composable-svelte/chat';

describe('StreamingChat', () => {
  it('sends a message and receives the reply', async () => {
    let chunk!: (text: string) => void;
    let complete!: () => void;

    const store = createTestStore({
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
        generateId: () => 'test-id',
        getTimestamp: () => 1000
      }
    });

    await store.send({ type: 'sendMessage', message: 'Hello' }, (state) => {
      expect(state.messages).toHaveLength(1);
      expect(state.isWaitingForResponse).toBe(true);
    });

    chunk('Hi');
    await store.receive({ type: 'chunkReceived', chunk: 'Hi' });

    complete();
    await store.receive({ type: 'streamComplete' });
    await store.finish();
  });
});
```

The full version of this is `packages/chat/tests/teststore-example.test.ts`,
which runs on every build.

`createMockStreamingChat()` supplies `streamMessage`, `generateId` and
`getTimestamp`, faking a streamed reply — for demos and for tests that do not
care about the transport. It supplies no `uploadFile`, so attachments keep their
local URLs under it.

It fakes a *slow* reply — two to three seconds. `TestStore.receive` times out
after one second and `finish()` refuses any unasserted action, so a `TestStore`
driven by this mock needs its own `streamMessage` — like the one above — rather
than this.

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
| `createMockStreamingChat()` | Fakes a streamed reply (`streamMessage`, `generateId`, `getTimestamp`) |
| `collaborativeReducer` | Reducer for collaborative features |
| `createInitialCollaborativeState()` | Initial state for the above |
| `getActiveUsers(users, currentUserId)` | Everyone present but you, minus the offline |
| `getTypingUsers(users, currentUserId, target?)` | Everyone typing but you |
| `getCursorPositions(users, currentUserId)` | Every caret but yours, for `CursorOverlay` |
| `formatTypingIndicator(users)` | "Ada is typing", "3 people are typing" — no ellipsis; `TypingIndicator` draws animated dots beside it |
| `generateRandomUserColor(userId)` | Stable colour from an id |

Markdown helpers — `renderMarkdown`, `extractVideosFromMarkdown`,
`extractImagesFromMarkdown` — are on the `@composable-svelte/chat/streaming-chat/markdown`
subpath rather than the root barrel. Video extraction returns `[]` until
`@composable-svelte/media` has loaded, since that peer is optional and imported
dynamically.

All three selectors take the current user's id and exclude them: nobody is shown
their own presence dot, told that they are typing, or given their own caret.

## Dependencies

- **Runtime**: [marked](https://github.com/markedjs/marked) (markdown parsing),
  [isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify) (sanitising it)
- **Peer**: `@composable-svelte/core`, `svelte`
- **Optional**: `@composable-svelte/code`, `@composable-svelte/media`, `prismjs`, `pdfjs-dist`
