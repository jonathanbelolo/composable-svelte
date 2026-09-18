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
