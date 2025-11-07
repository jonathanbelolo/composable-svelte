/**
 * Voice Input Module
 *
 * Standalone, reusable voice input component with push-to-talk and conversation modes.
 * Handles microphone access, audio recording, and transcription via backend API.
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import {
 *   VoiceInput,
 *   voiceInputReducer,
 *   createInitialVoiceInputState,
 *   getAudioManager
 * } from '@composable-svelte/code';
 *
 * const voiceStore = createStore({
 *   initialState: createInitialVoiceInputState(),
 *   reducer: voiceInputReducer,
 *   dependencies: {
 *     transcribeAudio: async (blob) => {
 *       // Call your backend API
 *       const formData = new FormData();
 *       formData.append('audio', blob);
 *       const res = await fetch('/api/voice/transcribe', {
 *         method: 'POST',
 *         body: formData
 *       });
 *       const { transcript } = await res.json();
 *       return transcript;
 *     },
 *     getAudioManager
 *   }
 * });
 * ```
 */

// Main component
export { default as VoiceInput } from './VoiceInput.svelte';

// Reducer
export { voiceInputReducer } from './reducer.js';

// Types
export type {
	VoiceInputState,
	VoiceInputAction,
	VoiceInputDependencies
} from './types.js';
export { createInitialVoiceInputState } from './types.js';

// Audio management
export { AudioManager } from './audio/audio-manager.js';
export {
	createAudioManager,
	getAudioManager,
	deleteAudioManager
} from './audio/audio-manager-registry.js';
