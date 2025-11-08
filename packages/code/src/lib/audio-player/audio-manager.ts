/**
 * Audio Manager
 *
 * Manages HTML5 audio element lifecycle and dispatches events to the store.
 * Similar to the WebSocketManager pattern - owns the audio resource and cleanup.
 */

import type { AudioPlayerAction, AudioTrack } from './types.js';

/**
 * Audio manager configuration.
 */
export interface AudioManagerConfig {
	/**
	 * Callback when audio events occur.
	 */
	onAction: (action: AudioPlayerAction) => void;

	/**
	 * Custom audio element factory (optional).
	 * Default: () => new Audio()
	 */
	createAudioElement?: () => HTMLAudioElement;
}

/**
 * Audio manager for controlling HTML5 audio playback.
 */
export class AudioManager {
	private audio: HTMLAudioElement;
	private config: AudioManagerConfig;
	private isDisposed = false;
	private eventListeners: Map<string, EventListener> = new Map();

	constructor(config: AudioManagerConfig) {
		this.config = config;
		this.audio = config.createAudioElement?.() ?? new Audio();
		this.setupEventListeners();
	}

	/**
	 * Set up event listeners on the audio element.
	 */
	private setupEventListeners(): void {
		// Metadata loaded - we now know duration
		const onLoadedMetadata = () => {
			if (this.isDisposed) return;
			this.config.onAction({
				type: 'audioLoaded',
				duration: this.audio.duration
			});
		};
		this.audio.addEventListener('loadedmetadata', onLoadedMetadata);
		this.eventListeners.set('loadedmetadata', onLoadedMetadata);

		// Time update - playback position changed
		const onTimeUpdate = () => {
			if (this.isDisposed) return;
			this.config.onAction({
				type: 'timeUpdated',
				currentTime: this.audio.currentTime
			});
		};
		this.audio.addEventListener('timeupdate', onTimeUpdate);
		this.eventListeners.set('timeupdate', onTimeUpdate);

		// Progress - buffering progress
		const onProgress = () => {
			if (this.isDisposed) return;

			const buffered = this.audio.buffered;
			if (buffered.length > 0) {
				const bufferedEnd = buffered.end(buffered.length - 1);
				this.config.onAction({
					type: 'bufferUpdated',
					buffered: bufferedEnd
				});
			}
		};
		this.audio.addEventListener('progress', onProgress);
		this.eventListeners.set('progress', onProgress);

		// Track ended
		const onEnded = () => {
			if (this.isDisposed) return;
			this.config.onAction({ type: 'ended' });
		};
		this.audio.addEventListener('ended', onEnded);
		this.eventListeners.set('ended', onEnded);

		// Loading started
		const onLoadStart = () => {
			if (this.isDisposed) return;
			this.config.onAction({ type: 'loading' });
		};
		this.audio.addEventListener('loadstart', onLoadStart);
		this.eventListeners.set('loadstart', onLoadStart);

		// Buffering state
		const onWaiting = () => {
			if (this.isDisposed) return;
			this.config.onAction({ type: 'buffering', isBuffering: true });
		};
		this.audio.addEventListener('waiting', onWaiting);
		this.eventListeners.set('waiting', onWaiting);

		const onCanPlay = () => {
			if (this.isDisposed) return;
			this.config.onAction({ type: 'buffering', isBuffering: false });
		};
		this.audio.addEventListener('canplay', onCanPlay);
		this.eventListeners.set('canplay', onCanPlay);

		// Error handling
		const onError = () => {
			if (this.isDisposed) return;

			const error = this.audio.error;
			let message = 'Unknown audio error';

			if (error) {
				switch (error.code) {
					case MediaError.MEDIA_ERR_ABORTED:
						message = 'Playback aborted';
						break;
					case MediaError.MEDIA_ERR_NETWORK:
						message = 'Network error occurred';
						break;
					case MediaError.MEDIA_ERR_DECODE:
						message = 'Audio decoding failed';
						break;
					case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
						message = 'Audio format not supported';
						break;
				}
			}

			this.config.onAction({ type: 'error', error: message });
		};
		this.audio.addEventListener('error', onError);
		this.eventListeners.set('error', onError);
	}

	/**
	 * Load a track.
	 */
	loadTrack(track: AudioTrack): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot load track - manager is disposed');
			return;
		}

		this.audio.src = track.url;
		this.audio.load();
	}

	/**
	 * Play audio.
	 */
	async play(): Promise<void> {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot play - manager is disposed');
			return;
		}

		try {
			await this.audio.play();
		} catch (error) {
			console.error('[AudioManager] Play failed:', error);
			this.config.onAction({
				type: 'error',
				error: error instanceof Error ? error.message : 'Playback failed'
			});
		}
	}

	/**
	 * Pause audio.
	 */
	pause(): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot pause - manager is disposed');
			return;
		}

		this.audio.pause();
	}

	/**
	 * Stop audio (pause and reset to beginning).
	 */
	stop(): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot stop - manager is disposed');
			return;
		}

		this.audio.pause();
		this.audio.currentTime = 0;
	}

	/**
	 * Seek to a specific time.
	 */
	seek(time: number): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot seek - manager is disposed');
			return;
		}

		this.audio.currentTime = time;
	}

	/**
	 * Set volume (0-1).
	 */
	setVolume(volume: number): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot set volume - manager is disposed');
			return;
		}

		this.audio.volume = Math.max(0, Math.min(1, volume));
	}

	/**
	 * Set playback speed (0.25-2.0).
	 */
	setPlaybackSpeed(speed: number): void {
		if (this.isDisposed) {
			console.warn('[AudioManager] Cannot set speed - manager is disposed');
			return;
		}

		this.audio.playbackRate = Math.max(0.25, Math.min(2.0, speed));
	}

	/**
	 * Get current audio element (for advanced use cases).
	 */
	getAudioElement(): HTMLAudioElement {
		return this.audio;
	}

	/**
	 * Update the configuration (useful for updating callbacks).
	 */
	updateConfig(config: AudioManagerConfig): void {
		this.config = config;
	}

	/**
	 * Dispose of the audio manager and clean up resources.
	 */
	dispose(): void {
		if (this.isDisposed) return;

		this.isDisposed = true;

		// Remove all event listeners
		for (const [eventName, listener] of Array.from(this.eventListeners.entries())) {
			this.audio.removeEventListener(eventName, listener);
		}
		this.eventListeners.clear();

		// Pause and clear source
		this.audio.pause();
		this.audio.src = '';
		this.audio.load(); // Reset the audio element
	}
}

/**
 * Create an audio manager instance.
 */
export function createAudioManager(config: AudioManagerConfig): AudioManager {
	return new AudioManager(config);
}

// Global registry for audio managers (similar to voice-input pattern)
const audioManagers = new Map<string, AudioManager>();

/**
 * Get or create an audio manager with the given ID.
 * If the manager exists, updates its config.
 */
export function getAudioManager(
	id: string,
	config: AudioManagerConfig
): AudioManager {
	let manager = audioManagers.get(id);

	if (!manager) {
		manager = new AudioManager(config);
		audioManagers.set(id, manager);
	} else {
		// Update config to ensure callbacks are fresh
		manager.updateConfig(config);
	}

	return manager;
}

/**
 * Delete an audio manager by ID.
 */
export function deleteAudioManager(id: string): void {
	const manager = audioManagers.get(id);

	if (manager) {
		manager.dispose();
		audioManagers.delete(id);
	}
}
