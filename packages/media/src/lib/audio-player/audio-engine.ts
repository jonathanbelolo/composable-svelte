/**
 * The native playback engine one mounted player owns.
 *
 * Internal: shared by `MinimalAudioPlayer` and `FullAudioPlayer`, not exported.
 */
import { AudioManager, _nameAudioManager, _unnameAudioManager } from './audio-manager.js';
import type { AudioPlayerAction, AudioPlayerState } from './types.js';

export interface AudioEngine {
	/** Drive the element toward `state`. `seeking` suppresses position writes during a drag. */
	sync(state: AudioPlayerState, seeking: boolean): void;
	/** Pause, release the element and stop all callbacks. Idempotent. */
	dispose(): void;
}

export interface AudioEngineOptions {
	/** Where element events go. Captured: a new store gets a new engine. */
	dispatch: (action: AudioPlayerAction) => void;
	/** Optional registry name for external lookup. Never shared between players. */
	id?: string | undefined;
	/** Component name for the duplicate-id warning. */
	component: string;
}

/**
 * Create an engine with its own `HTMLAudioElement`.
 *
 * Every player gets a fresh manager, including two players given the same
 * explicit `id`: they would otherwise share one element, redirect each other's
 * callbacks and dispose each other on unmount. The name goes to the most
 * recently mounted player, and releasing a player removes the name only while
 * it is still that player's.
 */
export function createAudioEngine({ dispatch, id, component }: AudioEngineOptions): AudioEngine {
	const manager = new AudioManager({ onAction: dispatch });
	const outcome = id === undefined ? 'named' : _nameAudioManager(id, manager);
	if (outcome === 'moved') {
		console.warn(
			`[${component}] another mounted player already uses id "${id}". Each player keeps its own audio ` +
				'element; the registry name now refers to this one. Give each player a distinct id, or omit it.'
		);
	} else if (outcome === 'kept') {
		console.warn(
			`[${component}] id "${id}" is registered by getAudioPlayerManager(). This ` +
				'player keeps its own audio element and is not registered under that id; the registered manager ' +
				'is left as it is. Give the player a different id, or omit it.'
		);
	}
	let loadedTrackUrl: string | null = null;

	return {
		sync(state, seeking) {
			if (manager.disposed) return;
			const element = manager.getAudioElement();
			const track = state.currentTrack;

			// Load only when the URL changes, so a state update never restarts a track.
			if (track && track.url !== loadedTrackUrl) {
				manager.loadTrack(track);
				loadedTrackUrl = track.url;
			} else if (!track) {
				loadedTrackUrl = null;
			}

			if (state.isPlaying && element.paused) void manager.play();
			else if (!state.isPlaying && !element.paused) manager.pause();

			manager.setVolume(state.volume);
			manager.setPlaybackSpeed(state.playbackSpeed);

			if (!seeking && Math.abs(element.currentTime - state.currentTime) > 0.5) {
				manager.seek(state.currentTime);
			}
		},
		dispose() {
			if (id !== undefined) _unnameAudioManager(id, manager);
			manager.dispose();
		}
	};
}
