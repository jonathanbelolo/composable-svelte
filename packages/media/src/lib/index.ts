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
} from './audio-player/index';

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
} from './video-embed/index';

// VoiceInput - Standalone voice input component with push-to-talk and conversation modes
export {
	VoiceInput,
	voiceInputReducer,
	createInitialVoiceInputState,
	AudioManager,
	createAudioManager,
	getAudioManager,
	deleteAudioManager,
	type VoiceInputState,
	type VoiceInputAction,
	type VoiceInputDependencies
} from './voice-input/index';
