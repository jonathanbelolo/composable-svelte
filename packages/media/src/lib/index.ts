/**
 * @composable-svelte/media
 *
 * Media components for Composable Svelte
 *
 * Built with Web Audio API and MediaRecorder following Composable Architecture patterns
 *
 * @packageDocumentation
 */

// AudioPlayer - Embeddable audio player with playlist support
export {
	MinimalAudioPlayer,
	FullAudioPlayer,
	PlaylistView,
	audioPlayerReducer,
	createInitialAudioPlayerState,
	createShuffleOrder,
	getNextTrackIndex,
	getPreviousTrackIndex,
	nextLoopMode,
	AudioManager as AudioPlayerManager,
	createAudioManager as createAudioPlayerManager,
	getAudioManager as getAudioPlayerManager,
	deleteAudioManager as deleteAudioPlayerManager,
	type AudioTrack,
	type LoopMode,
	type AudioPlayerState,
	type AudioPlayerAction,
	type AudioPlayerDependencies,
	type AudioManagerConfig as AudioPlayerManagerConfig
} from './audio-player/index.js';

// VideoEmbed - Video embedding for external platforms (YouTube, Vimeo, Twitch, etc.)
export {
	VideoEmbed,
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms,
	type VideoEmbedType,
	type VideoPlatform,
	type AspectRatio,
	type PlatformConfig,
	type EmbedOptions
} from './video-embed/index.js';

// VoiceInput - Standalone voice input component with push-to-talk and conversation modes
export {
	VoiceInput,
	voiceInputReducer,
	createInitialVoiceInputState,
	// Prefixed, so neither of this package's two `AudioManager`s owns the bare
	// name. They are different classes: audio-player's wraps an `AudioContext`
	// for playback, voice-input's wraps a `MediaRecorder` for capture.
	//
	// The un-suffixed names used to resolve here, to the *less* prominent of the
	// two — and the README documented `createAudioManager(id)` under the
	// **AudioPlayer** heading as "shared audio context manager for coordinating
	// playback". That call typechecks, because voice-input's factory also takes
	// a string id, so it compiled and returned an object of the wrong class.
	// A name that does not resolve is a better failure than one that does.
	AudioManager as VoiceInputAudioManager,
	createAudioManager as createVoiceInputAudioManager,
	getAudioManager as getVoiceInputAudioManager,
	deleteAudioManager as deleteVoiceInputAudioManager,
	type VoiceInputState,
	type VoiceInputAction,
	type VoiceInputDependencies
} from './voice-input/index.js';
