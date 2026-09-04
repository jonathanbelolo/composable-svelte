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
function fakeAudioManager(options: { failRecording?: boolean } = {}) {
	// `polls` alone was not enough. The VAD interval is deduped by the store —
	// `Effect.subscription` cancels the previous cleanup for the same id — so the
	// poll rate is capped no matter what the reducer does. The resources that
	// genuinely stacked are the recorder and the level meter, and nothing counted
	// them.
	const state = { polls: 0, startRecording: 0, levelMonitoring: 0, stopInterval: 0 };
	return {
		state,
		manager: {
			startRecording: () => {
				state.startRecording += 1;
				if (options.failRecording) throw new Error('no stream');
			},
			stopRecording: async () => new Blob(),
			startAudioLevelMonitoring: () => {
				state.levelMonitoring += 1;
				return state.levelMonitoring;
			},
			stopInterval: () => {
				state.stopInterval += 1;
			},
			detectVoiceActivity: () => {
				state.polls += 1;
				return false;
			},
			cleanup: () => {}
		}
	};
}

function makeStore(options: { failRecording?: boolean } = {}) {
	const { state, manager } = fakeAudioManager(options);
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), permission: 'granted' },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => manager as never
		}
	});
	cleanup.push(() => store.destroy?.());

	return { store, state, countSilence: () => state.polls };
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
		expect(atDestroy, 'the loop never ran, so "stopped" proves nothing').toBeGreaterThan(0);
	});

	it('does not stack a recorder or a level meter when activated repeatedly', async () => {
		// This is what the already-active guard is actually for, and the first
		// version of this test could not see it.
		//
		// It compared poll counts between one activation and three — but
		// `Effect.subscription` is deduped by id inside the store, which cancels
		// the previous cleanup before installing the new one. The poll rate is
		// therefore capped by *core*, not by the reducer, and deleting the guard
		// entirely left that assertion green. Meanwhile three dispatches meant
		// three `startRecording()` calls constructing three `MediaRecorder`s on one
		// stream, and three 20fps level intervals that nothing tracked.
		const { store, state } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		store.dispatch({ type: 'activateConversationMode' });
		store.dispatch({ type: 'activateConversationMode' });
		await wait(250);

		expect(state.startRecording, 'a second recorder was constructed').toBe(1);
		expect(state.levelMonitoring, 'a second level-meter interval was started').toBe(1);
	});

	it('installs nothing when the recorder refuses to start', async () => {
		// The ordering trap. `Effect.batch` runs members in order, synchronously,
		// and an `Effect.run` body executes to its first `await` inside that loop —
		// so a throwing `startRecording()` dispatched `audioProcessingFailed`
		// re-entrantly, its `Effect.cancel` found an empty subscription table and
		// did nothing, and the batch then installed the very intervals it had just
		// tried to cancel. Permanently unreachable, which is the exact leak the
		// subscription rewrite exists to prevent.
		const { store, state, countSilence } = makeStore({ failRecording: true });
		store.dispatch({ type: 'activateConversationMode' });
		await wait(300);

		expect(state.startRecording, 'the recorder was never attempted').toBe(1);
		expect(store.state.status, 'the failure was not reported').toBe('error');
		expect(countSilence(), 'a VAD loop survived a failed start').toBe(0);
	});

	it('stops after a processing failure, rather than looping on it', async () => {
		// `audioProcessingFailed` left `vadState` intact, so silence kept
		// accumulating to the auto-send threshold and re-triggered the failure.
		const { store, countSilence } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(250);

		store.dispatch({ type: 'audioProcessingFailed', error: 'nope' });
		const atFailure = countSilence();
		expect(atFailure, 'the loop never ran, so "stopped" proves nothing').toBeGreaterThan(0);
		await wait(400);

		expect(countSilence(), 'the loop survived the failure').toBe(atFailure);
		expect(store.state.vadState, 'vadState should be cleared by a failure').toBeNull();
	});
});
