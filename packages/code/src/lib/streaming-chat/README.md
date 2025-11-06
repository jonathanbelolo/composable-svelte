# StreamingChat Component

Transport-agnostic streaming chat interface for LLM interactions.

## Features

- 🔄 **Transport-Agnostic**: Works with SSE, WebSocket, or any streaming mechanism
- 🏗️ **Composable Architecture**: Pure reducer pattern with full testability
- 🎨 **Auto-Scroll**: Intelligent scroll behavior (pauses when user scrolls up)
- ⚡ **Real-time Streaming**: Displays response as it streams in
- 🌓 **Dark Mode**: Built-in dark mode support
- ♿ **Accessible**: ARIA labels and keyboard navigation
- 📱 **Responsive**: Mobile-friendly design

## Basic Usage

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    StreamingChat,
    streamingChatReducer,
    createInitialStreamingChatState,
    createMockStreamingChat
  } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialStreamingChatState(),
    reducer: streamingChatReducer,
    dependencies: createMockStreamingChat() // Use mock for demo
  });
</script>

<div style="height: 600px;">
  <StreamingChat {store} placeholder="Ask me anything..." />
</div>
```

## Transport Implementations

The component is transport-agnostic. You implement the `StreamingChatDependencies` interface:

```typescript
interface StreamingChatDependencies {
  streamMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ) => AbortController | void;

  generateId?: () => string;        // Default: crypto.randomUUID()
  getTimestamp?: () => number;      // Default: Date.now()
}
```

### SSE (Server-Sent Events) Implementation

```typescript
const sseStreamingChat: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError) => {
    const controller = new AbortController();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
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

### Using Existing WebSocket Client

```typescript
import { createWebSocketClient } from '@composable-svelte/core';

const wsClient = createWebSocketClient({ url: 'wss://your-backend.com' });

const wsStreamingChat: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError) => {
    const channel = `chat-${Date.now()}`;

    wsClient.subscribe(channel, (event) => {
      if (event.type === 'chunk') {
        onChunk(event.data);
      } else if (event.type === 'complete') {
        onComplete();
      } else if (event.type === 'error') {
        onError(event.data);
      }
    });

    wsClient.send({ channel, message });

    const controller = new AbortController();
    controller.signal.addEventListener('abort', () => {
      wsClient.unsubscribe(channel);
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

```typescript
interface StreamingChatProps {
  /** Store managing chat state */
  store: Store<StreamingChatState, StreamingChatAction>;

  /** Placeholder text for input */
  placeholder?: string;

  /** Show clear button */
  showClearButton?: boolean;

  /** Custom CSS class */
  class?: string;
}
```

## State Structure

```typescript
interface StreamingChatState {
  messages: Message[];
  currentStreaming: {
    content: string;
    isComplete: boolean;
  } | null;
  isWaitingForResponse: boolean;
  error: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

## Actions

```typescript
type StreamingChatAction =
  | { type: 'sendMessage'; message: string }
  | { type: 'chunkReceived'; chunk: string }
  | { type: 'streamComplete' }
  | { type: 'streamError'; error: string }
  | { type: 'clearError' }
  | { type: 'clearMessages' };
```

## Testing

Use the mock implementation for testing:

```typescript
import { createTestStore } from '@composable-svelte/core/test';
import {
  streamingChatReducer,
  createInitialStreamingChatState,
  createMockStreamingChat
} from '@composable-svelte/code';

describe('StreamingChat', () => {
  it('sends message and receives streaming response', async () => {
    const store = createTestStore({
      initialState: createInitialStreamingChatState(),
      reducer: streamingChatReducer,
      dependencies: createMockStreamingChat()
    });

    await store.send({ type: 'sendMessage', message: 'Hello' }, (state) => {
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('Hello');
      expect(state.isWaitingForResponse).toBe(true);
    });

    // Receive chunks
    await store.receive({ type: 'chunkReceived' }, (state) => {
      expect(state.currentStreaming).not.toBeNull();
    });

    // Stream completes
    await store.receive({ type: 'streamComplete' }, (state) => {
      expect(state.messages).toHaveLength(2);
      expect(state.currentStreaming).toBeNull();
    });

    await store.finish();
  });
});
```

## Styling

The component uses CSS custom properties for theming:

```css
.streaming-chat {
  --chat-bg: #ffffff;
  --chat-border: #e0e0e0;
  --user-bg: #007aff;
  --assistant-bg: #f0f0f0;
}

/* Dark mode automatically applied via :global(.dark) */
```

## Future Enhancements

Planned features for future versions:

- Markdown rendering with syntax highlighting
- Code block copy buttons
- Multi-modal support (images, files)
- Regenerate/edit functionality
- Token usage display
- Thinking/reasoning blocks (Claude-style)
- Message reactions
- Conversation export
