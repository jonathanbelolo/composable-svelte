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
