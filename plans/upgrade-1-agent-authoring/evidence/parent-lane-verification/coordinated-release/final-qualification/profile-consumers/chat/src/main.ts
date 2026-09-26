import { mount } from 'svelte';
import type { StreamingChatDependencies } from '@composable-svelte/chat';
import ManagedChat from '../recipes/managed/ManagedChat.svelte';

// Documented production transport: @composable-svelte/chat README "Quick Start" (streams POST /api/chat).
const chatDependencies: StreamingChatDependencies = {
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
};

mount(ManagedChat, { target: document.getElementById('chat')!, props: { dependencies: chatDependencies } });
