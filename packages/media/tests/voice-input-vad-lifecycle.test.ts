/**
 * The VAD polling loop must stop when voice input does.
 *
 * `activateConversationMode` started a bare `setInterval` inside an
 * `Effect.run`, assigned it to a local that was never read, and no path in the
 * file ever cleared it — not `deactivateVoiceInput`, not `cleanupAudioResources`,
 * not component unmount, not `audioProcessingFailed`. `AudioManager.cleanup()`
 * cannot help either: it only clears intervals registered through
 * `startAudioLevelMonitoring`, and this one never touched that registry.
 *
 * The consequences were not subtle. The orphaned loop keeps dispatching
 * `silenceDetected` ten times a second for the life of the page, and its closure
 * pins the `AudioManager`, its `MediaStream` and its `AudioContext` against
 * garbage collection. Because `audioProcessingFailed` did not reset `vadState`,
 * a failed transcription left silence accumulating until `autoSendTriggered`
 * fired again — a self-sustaining error loop. And with no already-active guard,
 * every `activateConversationMode` started another one.
 *
 * `Effect.run` is structurally the wrong home for a timer: the store keeps no
 * handle to it, so `destroy()` cannot reach it. `Effect.subscription(id, …)`
 * returns a cleanup the store stores and runs, and `Effect.cancel(id)` ends it
 * early — the shape `audio-player/mock-playback.ts` already uses in this same
 * package.
 *
 * These tests assert the loop *stops*, not that a cleanup function was called.
 * A test of the latter passes against an interval that is still running.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState } from '../src/lib/voice-input/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/**
 * A manager that always reports silence, and counts how often it is polled.
 *
 * The count lives here rather than on store subscriptions deliberately.
 * `destroy()` drops action subscribers, so a subscription-based counter stops
 * growing whether or not the interval is still running — which made the
 * destroy assertion below pass vacuously in its first form. Counting the poll
 * itself is independent of anything the store does afterwards.
 */
function fakeAudioManager() {
	const state = { polls: 0 };
	return {
		state,
		manager: {
			startRecording: () => {},
			stopRecording: async () => new Blob(),
			startAudioLevelMonitoring: () => 0,
			detectVoiceActivity: () => {
				state.polls += 1;
				return false;
			},
			cleanup: () => {}
		}
	};
}

function makeStore() {
	const { state, manager } = fakeAudioManager();
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), permission: 'granted' },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => manager as never
		}
	});
	cleanup.push(() => store.destroy?.());

	return { store, countSilence: () => state.polls };
}

describe('the VAD polling loop', () => {
	it('runs while conversation mode is active', async () => {
		// The control. Without this, every "it stopped" assertion below passes
		// against a loop that never started.
		const { store, countSilence } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(350);

		expect(countSilence(), 'the loop never started — the rest proves nothing').toBeGreaterThan(1);
	});

	it('stops when voice input is deactivated', async () => {
		const { store, countSilence } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(250);
		expect(countSilence(), 'precondition: running').toBeGreaterThan(0);

		store.dispatch({ type: 'deactivateVoiceInput' });
		const atTeardown = countSilence();
		await wait(400);

		expect(
			countSilence(),
			`the loop kept polling after teardown: ${countSilence() - atTeardown} further dispatches`
		).toBe(atTeardown);
	});

	it('stops when the store is destroyed', async () => {
		const { store, countSilence } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(250);
		const atDestroy = countSilence();

		store.destroy?.();
		await wait(400);

		expect(countSilence(), 'the loop outlived the store').toBe(atDestroy);
	});

	it('does not start a second loop when activated twice', async () => {
		// No already-active guard meant every dispatch stacked another interval,
		// so the dispatch rate doubled each time.
		const single = makeStore();
		single.store.dispatch({ type: 'activateConversationMode' });
		await wait(400);
		const oneLoop = single.countSilence();

		const double = makeStore();
		double.store.dispatch({ type: 'activateConversationMode' });
		double.store.dispatch({ type: 'activateConversationMode' });
		double.store.dispatch({ type: 'activateConversationMode' });
		await wait(400);

		expect(
			double.countSilence(),
			`three activations produced ${double.countSilence()} dispatches against ${oneLoop} for one`
		).toBeLessThan(oneLoop * 2);
	});

	it('stops after a processing failure, rather than looping on it', async () => {
		// `audioProcessingFailed` left `vadState` intact, so silence kept
		// accumulating to the auto-send threshold and re-triggered the failure.
		const { store, countSilence } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(250);

		store.dispatch({ type: 'audioProcessingFailed', error: 'nope' });
		const atFailure = countSilence();
		await wait(400);

		expect(countSilence(), 'the loop survived the failure').toBe(atFailure);
		expect(store.state.vadState, 'vadState should be cleared by a failure').toBeNull();
	});
});
