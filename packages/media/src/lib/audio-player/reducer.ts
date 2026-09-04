/**
 * Audio Player Reducer
 *
 * Pure reducer function that handles all audio player state transitions.
 * Follows the Composable Architecture pattern: (state, action, deps) => [newState, effect]
 */

import { Effect, type EffectType } from '@composable-svelte/core';
import type {
	AudioPlayerState,
	AudioPlayerAction,
	AudioPlayerDependencies,
	AudioTrack
} from './types.js';
import {
	clamp,
	createShuffleOrder,
	getNextTrackIndex,
	getPreviousTrackIndex
} from './types.js';
import { createMockPlaybackEffect, cancelMockPlaybackEffect } from './mock-playback.js';

/**
 * Report a track skip alongside whatever the delegated transition returned.
 *
 * `trackSkip` is about skipping to another *track* — the shipped consumer logs
 * "Track skipped: {title}" and its declared type takes an `AudioTrack` — not
 * about seeking within one, which is what I first wired it to. Both `next` and
 * `previous` delegate to `trackSelected`, so this wraps their result rather than
 * duplicating that case.
 */
function withSkipTracking(
	result: [AudioPlayerState, EffectType<AudioPlayerAction>],
	track: AudioTrack | undefined,
	deps: AudioPlayerDependencies
): [AudioPlayerState, EffectType<AudioPlayerAction>] {
	if (!deps.trackSkip || !track) return result;

	return [
		result[0],
		Effect.batch(
			result[1],
			Effect.fireAndForget<AudioPlayerAction>(async () => {
				deps.trackSkip!(track);
			})
		)
	];
}

/**
 * Audio player reducer.
 */
/** Playback-rate bounds. Shared so the restore path cannot drift from `speedChanged`. */
const MIN_SPEED = 0.25;
const MAX_SPEED = 2.0;

/**
 * Call a preference loader without letting it break the other one.
 *
 * Returns `undefined` both when the loader is absent and when it throws, which
 * are the same thing downstream: leave the default alone.
 */
function read(load: (() => number | undefined) | undefined): number | undefined {
	if (!load) return undefined;
	try {
		return load();
	} catch {
		return undefined;
	}
}

/** Clamp a restored preference, treating a missing or non-finite value as absent. */
function sanitise(value: number | undefined, fallback: number, min: number, max: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return clamp(value, min, max);
}

export function audioPlayerReducer(
	state: AudioPlayerState,
	action: AudioPlayerAction,
	deps: AudioPlayerDependencies
): [AudioPlayerState, EffectType<AudioPlayerAction>] {
	switch (action.type) {
		// ==================== Playback Controls ====================

		case 'play': {
			if (!state.currentTrack) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					isPlaying: true,

					
					error: null
				},
				createMockPlaybackEffect({ ...state, isPlaying: true, error: null }, deps)
			];
		}

		case 'pause': {
			if (!state.isPlaying) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					isPlaying: false,
				},
				cancelMockPlaybackEffect()
			];
		}

		case 'togglePlayPause': {
			if (state.isPlaying) {
				return audioPlayerReducer(state, { type: 'pause' }, deps);
			} else {
				return audioPlayerReducer(state, { type: 'play' }, deps);
			}
		}

		case 'stop': {
			return [
				{
					...state,
					isPlaying: false,

					
					currentTime: 0,
					seekPosition: null
				},
				cancelMockPlaybackEffect()
			];
		}

		case 'next': {
			const nextIndex = getNextTrackIndex(
				state.currentTrackIndex,
				state.playlist.length,
				state.loopMode,
				state.isShuffled,
				state.shuffleOrder
			);

			if (nextIndex === null) {
				return [state, Effect.none()];
			}

			return withSkipTracking(
				audioPlayerReducer(state, { type: 'trackSelected', index: nextIndex }, deps),
				state.playlist[nextIndex],
				deps
			);
		}

		case 'previous': {
			// If we're more than 3 seconds into the track, restart it
			if (state.currentTime > 3) {
				return [
					{
						...state,
						currentTime: 0,
						seekPosition: null
					},
					Effect.none()
				];
			}

			const prevIndex = getPreviousTrackIndex(
				state.currentTrackIndex,
				state.playlist.length,
				state.isShuffled,
				state.shuffleOrder
			);

			if (prevIndex === null) {
				return [state, Effect.none()];
			}

			return withSkipTracking(
				audioPlayerReducer(state, { type: 'trackSelected', index: prevIndex }, deps),
				state.playlist[prevIndex],
				deps
			);
		}

		case 'skipForward': {
			const newTime = clamp(state.currentTime + action.seconds, 0, state.duration);

			return [
				{
					...state,
					currentTime: newTime
				},
				Effect.none()
			];
		}

		case 'skipBackward': {
			const newTime = clamp(state.currentTime - action.seconds, 0, state.duration);

			return [
				{
					...state,
					currentTime: newTime
				},
				Effect.none()
			];
		}

		// ==================== Seeking ====================

		case 'seekStarted': {
			const position = clamp(action.position, 0, state.duration);

			return [
				{
					...state,
					seekPosition: position
				},
				Effect.none()
			];
		}

		case 'seekUpdated': {
			if (state.seekPosition === null) {
				return [state, Effect.none()];
			}

			const position = clamp(action.position, 0, state.duration);

			return [
				{
					...state,
					seekPosition: position
				},
				Effect.none()
			];
		}

		case 'seekEnded': {
			if (state.seekPosition === null) {
				return [state, Effect.none()];
			}

			const position = clamp(action.position, 0, state.duration);

			return [
				{
					...state,
					currentTime: position,
					seekPosition: null
				},
				Effect.none()
			];
		}

		case 'seekTo': {
			const time = clamp(action.time, 0, state.duration);

			return [
				{
					...state,
					currentTime: time,
					seekPosition: null
				},
				Effect.none()
			];
		}

		// ==================== Volume ====================

		case 'restorePreferences': {
			if (!deps.loadVolume && !deps.loadSpeed) {
				return [state, Effect.none()];
			}

			return [
				state,
				Effect.run<AudioPlayerAction>(async (dispatch) => {
					// Each loader is guarded on its own. `localStorage.getItem` throws
					// `SecurityError` in a sandboxed iframe and under Safari's stricter
					// privacy modes — the environment the styleguide demo runs in — and
					// with one shared `try` a throwing `loadVolume` meant `loadSpeed`
					// was never even called, so neither preference came back.
					const volume = read(deps.loadVolume);
					const speed = read(deps.loadSpeed);
					dispatch({
						type: 'preferencesRestored',
						...(volume === undefined ? {} : { volume }),
						...(speed === undefined ? {} : { speed })
					});
				})
			];
		}

		case 'preferencesRestored': {
			// Both are optional: a consumer may persist one and not the other, and a
			// missing value must leave the default alone rather than reset it.
			//
			// Everything here is clamped, because this comes back from storage the
			// user can edit. `speed` used to be exempt from that despite the comment
			// claiming otherwise: a stored `50` reached `setPlaybackSpeed`, and
			// `HTMLMediaElement.playbackRate` throws `NotSupportedError` out of
			// range. `NaN` needs its own guard — `Math.min(Math.max(NaN, …))` is
			// `NaN`, and `audio.volume = NaN` throws a `TypeError` inside the sync
			// effect that also drives loading, play/pause and seeking, so one corrupt
			// key bricked the player for the session. A shipped consumer reaches it
			// with a plain `parseFloat` on a missing key.
			const volume = sanitise(action.volume, state.volume, 0, 1);
			const speed = sanitise(action.speed, state.playbackSpeed, MIN_SPEED, MAX_SPEED);

			return [
				{
					...state,
					volume,
					// Matches `volumeChanged`: `previousVolume` is what un-muting
					// restores, so a restored 0 must not overwrite it with 0.
					previousVolume: volume > 0 ? volume : state.previousVolume,
					// A restored 0 means muted. Leaving `isMuted` false desynced the
					// speaker button — the first click "muted" an already-silent player.
					isMuted: volume === 0,
					playbackSpeed: speed
				},
				Effect.none()
			];
		}

		case 'volumeChanged': {
			const volume = clamp(action.volume, 0, 1);

			const effect = deps.saveVolume
				? Effect.fireAndForget<AudioPlayerAction>(async () => {
						deps.saveVolume!(volume);
					})
				: Effect.none<AudioPlayerAction>();

			return [
				{
					...state,
					volume,
					isMuted: volume === 0,
					previousVolume: volume > 0 ? volume : state.previousVolume
				},
				effect
			];
		}

		case 'toggleMute': {
			if (state.isMuted) {
				// Unmute - restore previous volume
				const volume = state.previousVolume > 0 ? state.previousVolume : 0.5;

				return audioPlayerReducer(state, { type: 'volumeChanged', volume }, deps);
			} else {
				// Mute - set volume to 0
				return [
					{
						...state,
						volume: 0,
						isMuted: true
					},
					Effect.none()
				];
			}
		}

		case 'volumeUp': {
			const amount = action.amount ?? 0.05;
			const newVolume = clamp(state.volume + amount, 0, 1);

			return audioPlayerReducer(state, { type: 'volumeChanged', volume: newVolume }, deps);
		}

		case 'volumeDown': {
			const amount = action.amount ?? 0.05;
			const newVolume = clamp(state.volume - amount, 0, 1);

			return audioPlayerReducer(state, { type: 'volumeChanged', volume: newVolume }, deps);
		}

		// ==================== Speed ====================

		case 'speedChanged': {
			const speed = clamp(action.speed, MIN_SPEED, MAX_SPEED);

			const effect = deps.saveSpeed
				? Effect.fireAndForget<AudioPlayerAction>(async () => {
						deps.saveSpeed!(speed);
					})
				: Effect.none<AudioPlayerAction>();

			return [
				{
					...state,
					playbackSpeed: speed
				},
				effect
			];
		}

		// ==================== Loop & Shuffle ====================

		case 'loopModeChanged': {
			return [
				{
					...state,
					loopMode: action.mode
				},
				Effect.none()
			];
		}

		case 'shuffleToggled': {
			const isShuffled = !state.isShuffled;

			const shuffleOrder = isShuffled
				? createShuffleOrder(state.playlist.length, state.currentTrackIndex)
				: [];

			return [
				{
					...state,
					isShuffled,
					shuffleOrder
				},
				Effect.none()
			];
		}

		// ==================== Playlist ====================

		case 'trackSelected': {
			const track = state.playlist[action.index];

			if (!track) {
				return [state, Effect.none()];
			}

			const wasPlaying = state.isPlaying;

			const trackEffect = deps.trackPlayback
				? Effect.fireAndForget<AudioPlayerAction>(async () => {
						deps.trackPlayback!(track);
					})
				: Effect.none<AudioPlayerAction>();

			return [
				{
					...state,
					currentTrack: track,
					currentTrackIndex: action.index,
					currentTime: 0,
					duration: track.duration ?? 0,
					buffered: 0,
					seekPosition: null,
					isPlaying: wasPlaying,

					isLoading: true,
					error: null
				},
				Effect.batch(
					trackEffect,
					wasPlaying
						? Effect.batch(
								cancelMockPlaybackEffect(),
								createMockPlaybackEffect(
									{
										...state,
										currentTrack: track,
										currentTrackIndex: action.index,
										currentTime: 0,
										duration: track.duration ?? 0,
										buffered: 0,
										seekPosition: null,
										isPlaying: wasPlaying,

										isLoading: true,
										error: null
									},
									deps
								)
							)
						: cancelMockPlaybackEffect()
				)
			];
		}

		case 'trackAdded': {
			const newPlaylist = [...state.playlist, action.track];

			// If this is the first track, select it
			if (state.playlist.length === 0) {
				const trackEffect = deps.trackPlayback
					? Effect.fireAndForget<AudioPlayerAction>(async () => {
							deps.trackPlayback!(action.track);
						})
					: Effect.none<AudioPlayerAction>();

				return [
					{
						...state,
						playlist: newPlaylist,
						currentTrack: action.track,
						currentTrackIndex: 0,
						duration: action.track.duration ?? 0
					},
					trackEffect
				];
			}

			return [
				{
					...state,
					playlist: newPlaylist
				},
				Effect.none()
			];
		}

		case 'trackRemoved': {
			const newPlaylist = state.playlist.filter((_, i) => i !== action.index);

			// If we removed the current track
			if (action.index === state.currentTrackIndex) {
				// Try to play the next track, or stop if no tracks left
				if (newPlaylist.length === 0) {
					return [
						{
							...state,
							playlist: newPlaylist,
							currentTrack: null,
							currentTrackIndex: -1,
							isPlaying: false,

							
							currentTime: 0,
							duration: 0,
							buffered: 0
						},
						Effect.none()
					];
				} else {
					const nextIndex = Math.min(action.index, newPlaylist.length - 1);
					const nextTrack = newPlaylist[nextIndex] ?? null;

					return [
						{
							...state,
							playlist: newPlaylist,
							currentTrack: nextTrack,
							currentTrackIndex: nextIndex,
							currentTime: 0,
							duration: nextTrack?.duration ?? 0,
							buffered: 0,
							seekPosition: null,
							isLoading: nextTrack ? true : false
						},
						Effect.none()
					];
				}
			}

			// If we removed a track before the current one, adjust the index
			const newCurrentIndex =
				action.index < state.currentTrackIndex
					? state.currentTrackIndex - 1
					: state.currentTrackIndex;

			return [
				{
					...state,
					playlist: newPlaylist,
					currentTrackIndex: newCurrentIndex
				},
				Effect.none()
			];
		}

		case 'playlistCleared': {
			return [
				{
					...state,
					playlist: [],
					currentTrack: null,
					currentTrackIndex: -1,
					isPlaying: false,

					
					currentTime: 0,
					duration: 0,
					buffered: 0,
					seekPosition: null,
					shuffleOrder: []
				},
				Effect.none()
			];
		}

		case 'playlistReordered': {
			const newPlaylist = [...state.playlist];
			const [movedTrack] = newPlaylist.splice(action.from, 1);
			if (!movedTrack) {
				return [state, Effect.none()];
			}
			newPlaylist.splice(action.to, 0, movedTrack);

			// Update current track index
			let newCurrentIndex = state.currentTrackIndex;

			if (state.currentTrackIndex === action.from) {
				newCurrentIndex = action.to;
			} else if (action.from < state.currentTrackIndex && action.to >= state.currentTrackIndex) {
				newCurrentIndex--;
			} else if (action.from > state.currentTrackIndex && action.to <= state.currentTrackIndex) {
				newCurrentIndex++;
			}

			return [
				{
					...state,
					playlist: newPlaylist,
					currentTrackIndex: newCurrentIndex
				},
				Effect.none()
			];
		}

		case 'loadPlaylist': {
			const startIndex = action.startIndex ?? 0;
			const track = action.tracks[startIndex] ?? null;

			const shuffleOrder = state.isShuffled
				? createShuffleOrder(action.tracks.length, startIndex)
				: [];

			return [
				{
					...state,
					playlist: action.tracks,
					currentTrack: track,
					currentTrackIndex: track ? startIndex : -1,
					duration: track?.duration ?? 0,
					currentTime: 0,
					buffered: 0,
					seekPosition: null,
					shuffleOrder,
					isLoading: track ? true : false,

					error: null
				},
				Effect.none()
			];
		}

		// ==================== UI ====================

		case 'toggleExpanded': {
			return [
				{
					...state,
					isExpanded: !state.isExpanded
				},
				Effect.none()
			];
		}

		case 'setExpanded': {
			return [
				{
					...state,
					isExpanded: action.expanded
				},
				Effect.none()
			];
		}

		// ==================== Internal Events ====================

		case 'audioLoaded': {
			return [
				{
					...state,
					duration: action.duration,
					isLoading: false,
					error: null
				},
				Effect.none()
			];
		}

		case 'timeUpdated': {
			return [
				{
					...state,
					currentTime: action.currentTime
				},
				Effect.none()
			];
		}

		case 'bufferUpdated': {
			return [
				{
					...state,
					buffered: action.buffered
				},
				Effect.none()
			];
		}

		case 'ended': {
			// Handle track end based on loop mode
			if (state.loopMode === 'one') {
				// Loop the current track
				const newState = {
					...state,
					currentTime: 0,
					isPlaying: true
				};
				return [
					newState,
					Effect.batch(
						cancelMockPlaybackEffect(),
						createMockPlaybackEffect(newState, deps)
					)
				];
			}

			// Try to advance to next track
			const nextIndex = getNextTrackIndex(
				state.currentTrackIndex,
				state.playlist.length,
				state.loopMode,
				state.isShuffled,
				state.shuffleOrder
			);

			if (nextIndex !== null) {
				return audioPlayerReducer(state, { type: 'trackSelected', index: nextIndex }, deps);
			}

			// No next track - stop playback
			return [
				{
					...state,
					isPlaying: false,

				},
				Effect.none()
			];
		}

		case 'loading': {
			return [
				{
					...state,
					isLoading: true,
					error: null
				},
				Effect.none()
			];
		}

		case 'buffering': {
			return [
				{
					...state,
					isBuffering: action.isBuffering
				},
				Effect.none()
			];
		}

		case 'error': {
			return [
				{
					...state,
					error: action.error,
					isLoading: false,
					isBuffering: false,
					isPlaying: false,

				},
				Effect.none()
			];
		}

		default:
			// Exhaustiveness check
			return [state, Effect.none()];
	}
}
