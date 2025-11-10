/**
 * Audio Player Types
 *
 * State, actions, and dependencies for the audio player component.
 * Supports single track playback, playlists, and advanced controls.
 */

/**
 * Audio track metadata.
 */
export interface AudioTrack {
	/** Unique track identifier */
	id: string;
	/** Audio file URL */
	url: string;
	/** Track title */
	title: string;
	/** Artist name */
	artist?: string;
	/** Album name */
	album?: string;
	/** Cover art URL */
	coverArt?: string;
	/** Duration in seconds (if known) */
	duration?: number;
	/** File format (mp3, wav, etc.) */
	format?: string;
}

/**
 * Loop mode for playback.
 */
export type LoopMode = 'none' | 'one' | 'all';

/**
 * Audio player state.
 */
export interface AudioPlayerState {
	// Current track
	/** Currently loaded/playing track */
	currentTrack: AudioTrack | null;

	// Playback state
	/** Audio is actively playing */
	isPlaying: boolean;
	/** Audio is paused */
	isPaused: boolean;
	/** Audio is stopped */
	isStopped: boolean;
	/** Track is loading */
	isLoading: boolean;
	/** Track is buffering */
	isBuffering: boolean;

	// Time
	/** Current playback position in seconds */
	currentTime: number;
	/** Total duration in seconds */
	duration: number;
	/** Buffered amount in seconds */
	buffered: number;

	// Volume
	/** Volume level (0-1) */
	volume: number;
	/** Audio is muted */
	isMuted: boolean;
	/** Previous volume level (for unmute) */
	previousVolume: number;

	// Speed
	/** Playback speed (0.25 - 2.0) */
	playbackSpeed: number;

	// Progress
	/** Temporary seek position while seeking (null when not seeking) */
	seekPosition: number | null;

	// Loop mode
	/** Loop mode (none, one, all) */
	loopMode: LoopMode;

	// Shuffle
	/** Shuffle is enabled */
	isShuffled: boolean;
	/** Shuffled track order (indices into playlist) */
	shuffleOrder: number[];

	// Playlist
	/** All tracks in the playlist */
	playlist: AudioTrack[];
	/** Index of current track in playlist */
	currentTrackIndex: number;

	// UI state
	/** Player is expanded to full view */
	isExpanded: boolean;

	// Error
	/** Error message (null if no error) */
	error: string | null;
}

/**
 * Audio player actions.
 */
export type AudioPlayerAction =
	// Playback controls
	| { type: 'play' }
	| { type: 'pause' }
	| { type: 'togglePlayPause' }
	| { type: 'stop' }
	| { type: 'next' }
	| { type: 'previous' }
	| { type: 'skipForward'; seconds: number }
	| { type: 'skipBackward'; seconds: number }

	// Seeking
	| { type: 'seekStarted'; position: number }
	| { type: 'seekUpdated'; position: number }
	| { type: 'seekEnded'; position: number }
	| { type: 'seekTo'; time: number }

	// Volume
	| { type: 'volumeChanged'; volume: number }
	| { type: 'toggleMute' }
	| { type: 'volumeUp'; amount?: number }
	| { type: 'volumeDown'; amount?: number }

	// Speed
	| { type: 'speedChanged'; speed: number }

	// Loop & Shuffle
	| { type: 'loopModeChanged'; mode: LoopMode }
	| { type: 'shuffleToggled' }

	// Playlist
	| { type: 'trackSelected'; index: number }
	| { type: 'trackAdded'; track: AudioTrack }
	| { type: 'trackRemoved'; index: number }
	| { type: 'playlistCleared' }
	| { type: 'playlistReordered'; from: number; to: number }
	| { type: 'loadPlaylist'; tracks: AudioTrack[]; startIndex?: number }

	// UI
	| { type: 'toggleExpanded' }
	| { type: 'setExpanded'; expanded: boolean }

	// Internal events (from HTML5 audio element)
	| { type: 'audioLoaded'; duration: number }
	| { type: 'timeUpdated'; currentTime: number }
	| { type: 'bufferUpdated'; buffered: number }
	| { type: 'ended' }
	| { type: 'loading' }
	| { type: 'buffering'; isBuffering: boolean }
	| { type: 'error'; error: string };

/**
 * Audio player dependencies.
 */
export interface AudioPlayerDependencies {
	/**
	 * Create an HTML audio element.
	 * Default: () => new Audio()
	 */
	createAudioElement?: () => HTMLAudioElement;

	/**
	 * Clock dependency for time operations.
	 * Used for mock playback simulation.
	 */
	clock?: {
		now(): number;
	};

	/**
	 * Enable mock playback mode (simulates audio playback without real audio).
	 * Useful for demos and testing.
	 * Default: false
	 */
	useMockPlayback?: boolean;

	/**
	 * Save volume to persistent storage.
	 */
	saveVolume?: (volume: number) => void;

	/**
	 * Load volume from persistent storage.
	 */
	loadVolume?: () => number;

	/**
	 * Save playback speed to persistent storage.
	 */
	saveSpeed?: (speed: number) => void;

	/**
	 * Load playback speed from persistent storage.
	 */
	loadSpeed?: () => number;

	/**
	 * Track playback analytics (optional).
	 */
	trackPlayback?: (track: AudioTrack) => void;

	/**
	 * Track skip analytics (optional).
	 */
	trackSkip?: (track: AudioTrack) => void;

	/**
	 * Generate unique ID.
	 * Default: crypto.randomUUID()
	 */
	generateId?: () => string;
}

/**
 * Create initial audio player state.
 */
export function createInitialAudioPlayerState(
	options: {
		volume?: number;
		playbackSpeed?: number;
		loopMode?: LoopMode;
		isShuffled?: boolean;
	} = {}
): AudioPlayerState {
	return {
		currentTrack: null,
		isPlaying: false,
		isPaused: false,
		isStopped: true,
		isLoading: false,
		isBuffering: false,
		currentTime: 0,
		duration: 0,
		buffered: 0,
		volume: options.volume ?? 1,
		isMuted: false,
		previousVolume: options.volume ?? 1,
		playbackSpeed: options.playbackSpeed ?? 1,
		seekPosition: null,
		loopMode: options.loopMode ?? 'none',
		isShuffled: options.isShuffled ?? false,
		shuffleOrder: [],
		playlist: [],
		currentTrackIndex: -1,
		isExpanded: false,
		error: null
	};
}

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a shuffled array of indices.
 */
export function createShuffleOrder(length: number, currentIndex: number): number[] {
	// Edge case: empty playlist or invalid index
	if (length === 0) return [];
	if (currentIndex < 0 || currentIndex >= length) {
		currentIndex = 0; // Default to first track
	}

	const indices = Array.from({ length }, (_, i) => i);

	// Remove current track from shuffle pool
	const [currentTrack] = indices.splice(currentIndex, 1);

	// Shuffle remaining tracks
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[indices[i], indices[j]] = [indices[j], indices[i]];
	}

	// Put current track at the beginning
	indices.unshift(currentTrack);

	return indices;
}

/**
 * Get the next track index based on current state.
 */
export function getNextTrackIndex(
	currentIndex: number,
	playlistLength: number,
	loopMode: LoopMode,
	isShuffled: boolean,
	shuffleOrder: number[]
): number | null {
	if (playlistLength === 0) return null;
	if (currentIndex < 0) return 0;

	if (isShuffled && shuffleOrder.length > 0) {
		const currentShuffleIndex = shuffleOrder.indexOf(currentIndex);
		if (currentShuffleIndex < 0) return null;

		const nextShuffleIndex = currentShuffleIndex + 1;

		if (nextShuffleIndex < shuffleOrder.length) {
			return shuffleOrder[nextShuffleIndex];
		} else if (loopMode === 'all') {
			return shuffleOrder[0];
		} else {
			return null;
		}
	} else {
		const nextIndex = currentIndex + 1;

		if (nextIndex < playlistLength) {
			return nextIndex;
		} else if (loopMode === 'all') {
			return 0;
		} else {
			return null;
		}
	}
}

/**
 * Get the previous track index.
 */
export function getPreviousTrackIndex(
	currentIndex: number,
	playlistLength: number,
	isShuffled: boolean,
	shuffleOrder: number[]
): number | null {
	if (playlistLength === 0) return null;
	if (currentIndex < 0) return playlistLength - 1;

	if (isShuffled && shuffleOrder.length > 0) {
		const currentShuffleIndex = shuffleOrder.indexOf(currentIndex);
		if (currentShuffleIndex < 0) return null;

		const prevShuffleIndex = currentShuffleIndex - 1;

		if (prevShuffleIndex >= 0) {
			return shuffleOrder[prevShuffleIndex];
		} else {
			return shuffleOrder[shuffleOrder.length - 1];
		}
	} else {
		const prevIndex = currentIndex - 1;

		if (prevIndex >= 0) {
			return prevIndex;
		} else {
			return playlistLength - 1;
		}
	}
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
