import { mount } from 'svelte';
import type { StreamingChatDependencies } from '@composable-svelte/chat';
import ManagedChat from '../recipes/chat/ManagedChat.svelte';
import CodeHost from './CodeHost.svelte';
import { getVoiceInputAudioManager, type VoiceInputDependencies } from '@composable-svelte/media';
import ManagedPlayer from '../recipes/media/ManagedPlayer.svelte';
import ManagedVoice from '../recipes/media/ManagedVoice.svelte';

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

// Documented production dependencies: @composable-svelte/media README "VoiceInput" (POST /api/transcribe).
const voiceDependencies: VoiceInputDependencies = {
  transcribeAudio: async (audio: Blob) => {
    // Your application supplies this endpoint and its authentication.
    const response = await fetch('/api/transcribe', { method: 'POST', body: audio });
    if (!response.ok) throw new Error('Transcription failed');
    return response.text();
  },
  getAudioManager: getVoiceInputAudioManager
};

mount(ManagedChat, { target: document.getElementById('chat')!, props: { dependencies: chatDependencies } });
mount(CodeHost, { target: document.getElementById('code')! });
mount(ManagedPlayer, { target: document.getElementById('player')! });
mount(ManagedVoice, { target: document.getElementById('voice')!, props: { dependencies: voiceDependencies } });
