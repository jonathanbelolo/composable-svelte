# StreamingChat Component

Transport-agnostic streaming chat interface for LLM interactions.

## Features

- 🔄 **Transport-Agnostic**: Works with SSE, WebSocket, or any streaming mechanism
- 🏗️ **Composable Architecture**: Pure reducer pattern with full testability
- 🎨 **Auto-Scroll**: Follows the stream, and stops following once the user scrolls up
- ⚡ **Real-time Streaming**: Displays response as it streams in
- 🌓 **Dark Mode**: Styles under a `.dark` ancestor
- ♿ **Accessible**: ARIA labels; Enter sends, Shift+Enter inserts a newline

## Basic Usage

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    StandardStreamingChat,
    streamingChatReducer,
    createInitialStreamingChatState,
    createMockStreamingChat
  } from '@composable-svelte/chat';

  const store = createStore({
    initialState: createInitialStreamingChatState(),
    reducer: streamingChatReducer,
    dependencies: createMockStreamingChat() // Use mock for demo
  });
</script>

<div style="height: 600px;">
  <StandardStreamingChat {store} placeholder="Ask me anything..." />
</div>
```

Three variants are exported — `MinimalStreamingChat`, `StandardStreamingChat` and
`FullStreamingChat`. They differ in props and chrome, not in state: all three
drive the same store. See [Component Props](#component-props).

## Transport Implementations

The component is transport-agnostic. You implement the `StreamingChatDependencies` interface:

```typescript
interface StreamingChatDependencies {
  streamMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    attachments?: MessageAttachment[]
  ) => AbortController | void;

  generateId?: () => string;        // Default: crypto.randomUUID()
  getTimestamp?: () => number;      // Default: Date.now()

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
carries attachments, the reducer uploads them all first and only then calls
`streamMessage`, with the resolved URLs in place.

### SSE (Server-Sent Events) Implementation

```typescript
const sseStreamingChat: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError, attachments) => {
    const controller = new AbortController();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, attachments }),
      signal: controller.signal
    })
      .then(response => {
        if (!response.ok) throw new Error('Request failed');
        return response.body!.getReader();
      })
      .then(reader => {
        const decoder = new TextDecoder();

        const read = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              onComplete();
              return;
            }

            const chunk = decoder.decode(value, { stream: true });
            onChunk(chunk);
            read();
          });
        };

        read();
      })
      .catch(error => onError(error.message));

    return controller;
  }
};
```

### WebSocket Implementation

```typescript
const wsStreamingChat: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError) => {
    const ws = new WebSocket('wss://your-backend.com/chat');

    ws.onopen = () => {
      ws.send(JSON.stringify({ message }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'chunk') {
        onChunk(data.content);
      } else if (data.type === 'complete') {
        onComplete();
        ws.close();
      }
    };

    ws.onerror = () => {
      onError('WebSocket connection failed');
      ws.close();
    };

    const controller = new AbortController();
    controller.signal.addEventListener('abort', () => ws.close());

    return controller;
  }
};
```

### Using Core's WebSocket Client

`@composable-svelte/core` exports `createLiveWebSocket`, which adds reconnection
and typed message parsing on top of the raw socket.

```typescript
import { createLiveWebSocket } from '@composable-svelte/core';

const wsStreamingChat: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError) => {
    const client = createLiveWebSocket<{ type: string; content?: string }>();
    const controller = new AbortController();

    // `subscribe` takes a single listener and returns an unsubscribe function;
    // it receives the whole `WebSocketMessage`, whose `data` is the parsed body.
    const unsubscribe = client.subscribe(({ data }) => {
      if (data.type === 'chunk' && data.content) {
        onChunk(data.content);
      } else if (data.type === 'complete') {
        onComplete();
        void client.disconnect();
      } else if (data.type === 'error') {
        onError(data.content ?? 'Stream failed');
      }
    });

    client
      .connect('wss://your-backend.com/chat')
      .then(() => client.send({ type: 'message', content: message }))
      .catch((error) =>
        onError(error instanceof Error ? error.message : 'Connection failed')
      );

    controller.signal.addEventListener('abort', () => {
      void unsubscribe();
      void client.disconnect();
    });

    return controller;
  }
};
```

## Backend Examples

### Node.js/Express with SSE

```javascript
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Call your LLM API (OpenAI, Anthropic, etc.)
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }],
    stream: true
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      res.write(`data: ${content}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

### SvelteKit Endpoint

```typescript
// +server.ts
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST({ request }) {
  const { message } = await request.json();

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }],
    stream: true
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            controller.enqueue(new TextEncoder().encode(content));
          }
        }
        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      }
    }
  );
}
```

## Component Props

Every variant takes the same store. `MinimalStreamingChat`:

```typescript
interface MinimalStreamingChatProps {
  /** Store managing chat state */
  store: Store<StreamingChatState, StreamingChatAction>;

  /** Placeholder text for input (default: "Type your message...") */
  placeholder?: string;

  /** Custom CSS class */
  class?: string;

  /** Label for user messages (default: "You") */
  userLabel?: string;

  /** Label for assistant messages (default: "Assistant") */
  assistantLabel?: string;
}
```

`StandardStreamingChat` adds the Stop and Clear controls:

```typescript
interface StandardStreamingChatProps extends MinimalStreamingChatProps {
  /** Show clear button (default: true) */
  showClearButton?: boolean;
}
```

`FullStreamingChat` adds per-message actions, attachments and avatars:

```typescript
interface FullStreamingChatProps extends StandardStreamingChatProps {
  /** Maximum file size in MB (default: 10) */
  maxFileSizeMB?: number;

  /** Accepted file types, e.g. ["image/*", ".pdf"]. Empty allows all (default) */
  acceptedFileTypes?: string[];

  /** Value to prefill the input with */
  prefillValue?: string;

  /** Called once the prefill has been applied */
  onPrefillApplied?: () => void;

  /** Avatar URL for user messages */
  userAvatarUrl?: string;

  /** Avatar URL for assistant messages */
  assistantAvatarUrl?: string;
}
```

There are no `enableAttachments` / `enableReactions` style flags. A variant
either has the feature or it does not.

## State Structure

```typescript
interface StreamingChatState {
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
   * Id of the message just appended by `sendMessage`, so the list can animate
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

interface MessageReaction {
  emoji: string;
  count: number;
  /** Whether the current user is one of them. Absent means "not mine" */
  reactedByMe?: boolean;
}
```

## Actions

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
  // Message editing
  | { type: 'startEditingMessage'; messageId: string }
  | { type: 'updateEditingContent'; content: string }
  | { type: 'submitEditedMessage' }
  | { type: 'cancelEditing' }
  // File attachments
  | { type: 'addAttachment'; attachment: MessageAttachment }
  | { type: 'removeAttachment'; attachmentId: string }
  | { type: 'clearAttachments' }
  // Message reactions
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

`addReaction` is idempotent: reacting twice with the same emoji does not
increment `count` a second time. `removeReaction` takes the `emoji`, not a
reaction id.

`ChatPresentationEvent` is
`{ type: 'presentationCompleted' } | { type: 'dismissalCompleted' }` — chat's own
narrow lifecycle union, declared in `types.ts` and not exported from the package
root.

The union also carries members prefixed `_internal_`
(`_internal_setAbortController`, `_internal_attachmentUploadProgress`,
`_internal_attachmentsResolved`). The reducer dispatches those to itself; do not
send them from a component.

## Testing

**Do not drive a `TestStore` with `createMockStreamingChat()`.** It fakes a
realistic reply — a 300ms lead-in, then a word every 50ms, forty-odd words — and
`TestStore` is exhaustive: `receive` gives up after one second, and `finish()`
refuses to pass while any dispatched action is unasserted. A one-chunk fake is
what a reducer test wants.

```typescript
import { describe, it, expect } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { streamingChatReducer, createInitialStreamingChatState } from '@composable-svelte/chat';

describe('StreamingChat', () => {
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

`createMockStreamingChat()` takes no configuration and is for demos and
component tests, where the delays are the point. It supplies `streamMessage`,
`generateId` and `getTimestamp` — no `uploadFile`, so attachments keep their
local URLs under it — and honours the `AbortController` it returns.

## Styling

Styles are scoped CSS on each component, with hard-coded values — there are no
`--chat-*` custom properties to override. The hooks a consumer has are the
`class` prop on every variant, and a `.dark` ancestor:

```css
/* Each variant ships its own dark rules, e.g. */
:global(.dark) .standard-streaming-chat { /* ... */ }
```

The package contains no CSS lifecycle animations. Anything that appears,
disappears, expands or collapses is animated with the Motion One helpers from
`@composable-svelte/core/animation` — `animateListItemIn` for a newly sent
message, `animatePopoverIn` / `animatePopoverOut` and `animateBackdropIn` /
`animateBackdropOut` for the reaction picker and the attachment preview modal,
and `createScrollFollower` for auto-scroll, which reads `prefersReducedMotion()`.
The only `@keyframes` left are infinite loops: the streaming caret blink, the
typing-indicator dots, the live-cursor blink, and loading spinners.
