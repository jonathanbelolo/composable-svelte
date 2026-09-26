import { mount } from 'svelte';
import { getVoiceInputAudioManager, type VoiceInputDependencies } from '@composable-svelte/media';
import ManagedPlayer from '../recipes/managed/ManagedPlayer.svelte';
import ManagedVoice from '../recipes/managed/ManagedVoice.svelte';

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

mount(ManagedPlayer, { target: document.getElementById('player')! });
mount(ManagedVoice, { target: document.getElementById('voice')!, props: { dependencies: voiceDependencies } });
