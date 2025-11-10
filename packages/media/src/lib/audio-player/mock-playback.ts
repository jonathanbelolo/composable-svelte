/**
 * Mock playback effect helper.
 *
 * Creates a cancellable effect that simulates audio playback by dispatching
 * timeUpdated actions at regular intervals.
 */

import { Effect, type EffectType } from '@composable-svelte/core';
import type { AudioPlayerAction, AudioPlayerDependencies, AudioPlayerState } from './types.js';

/**
 * Create a mock playback effect that simulates time progression.
 *
 * This effect:
 * - Dispatches timeUpdated actions every 100ms
 * - Respects playback speed
 * - Dispatches 'ended' when duration is reached
 * - Can be cancelled with Effect.cancel('mock-playback')
 */
export function createMockPlaybackEffect(
	state: AudioPlayerState,
	deps: AudioPlayerDependencies
): EffectType<AudioPlayerAction> {
	if (!deps.useMockPlayback || !state.currentTrack) {
		return Effect.none<AudioPlayerAction>();
	}

	return Effect.subscription<AudioPlayerAction>('mock-playback', (dispatch) => {
		const startTime = state.currentTime;
		const startRealTime = (deps.clock?.now() ?? Date.now()) / 1000;
		const speed = state.playbackSpeed;
		const duration = state.duration;

		// Simulate audio loading - dispatch audioLoaded immediately
		if (state.isLoading) {
			dispatch({ type: 'audioLoaded', duration });
		}

		const interval = setInterval(() => {
			// Calculate current time based on elapsed real time and playback speed
			const elapsedRealTime = ((deps.clock?.now() ?? Date.now()) / 1000) - startRealTime;
			const currentTime = Math.min(startTime + elapsedRealTime * speed, duration);

			if (currentTime >= duration) {
				clearInterval(interval);
				dispatch({ type: 'ended' });
			} else {
				dispatch({ type: 'timeUpdated', currentTime });
			}
		}, 100); // Update every 100ms

		// Cleanup function (called when subscription is cancelled)
		return () => clearInterval(interval);
	});
}

/**
 * Create an effect to cancel mock playback.
 */
export function cancelMockPlaybackEffect(): EffectType<AudioPlayerAction> {
	return Effect.cancel<AudioPlayerAction>('mock-playback');
}
