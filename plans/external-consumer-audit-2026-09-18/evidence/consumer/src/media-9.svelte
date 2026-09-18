<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    VoiceInput,
    voiceInputReducer,
    createInitialVoiceInputState,
    getVoiceInputAudioManager
  } from '@composable-svelte/media';

  const sendToSpeechToText = async (_audio: Blob): Promise<string> => 'Application-provided transcription';

  const store = createStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    dependencies: {
      transcribeAudio: async (audio: Blob) => sendToSpeechToText(audio),
      getAudioManager: getVoiceInputAudioManager
    }
  });
</script>

<VoiceInput {store} defaultMode="push-to-talk" onTranscript={(text) => console.log(text)} />
