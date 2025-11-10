/**
 * Audio Player Component
 *
 * Embeddable audio player with support for playlists and advanced controls.
 * Follows the Composable Architecture pattern.
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import {
 *   MinimalAudioPlayer,
 *   FullAudioPlayer,
 *   audioPlayerReducer,
 *   createInitialAudioPlayerState
 * } from '@composable-svelte/code';
 *
 * const store = createStore({
 *   initialState: createInitialAudioPlayerState(),
 *   reducer: audioPlayerReducer,
 *   dependencies: {}
 * });
 * ```
 */

// Core exports
export { audioPlayerReducer } from './reducer.js';
export {
	createInitialAudioPlayerState,
	createShuffleOrder,
	getNextTrackIndex,
	getPreviousTrackIndex,
	clamp,
	type AudioTrack,
	type LoopMode,
	type AudioPlayerState,
	type AudioPlayerAction,
	type AudioPlayerDependencies
} from './types.js';

// Audio manager
export {
	AudioManager,
	createAudioManager,
	getAudioManager,
	deleteAudioManager,
	type AudioManagerConfig
} from './audio-manager.js';

// Components
export { default as MinimalAudioPlayer } from './MinimalAudioPlayer.svelte';
export { default as FullAudioPlayer } from './FullAudioPlayer.svelte';
export { default as PlaylistView } from './PlaylistView.svelte';
