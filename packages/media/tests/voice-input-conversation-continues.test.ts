/**
 * Conversation mode must survive its own utterances.
 *
 * `audioProcessingComplete` was written for push-to-talk, where finishing an
 * utterance ends the session: it set `status: 'idle', mode: null`. A later
 * change routed conversation mode's `autoSendTriggered` through the same case —
 * and that effect has *already restarted the recorder* before dispatching it.
 *
 * So one sentence into a conversation, the state said idle and unmoded while the
 * microphone was live. `VoiceInput` gates its panel on
 * `status === 'recording' || mode === 'conversation'`, so the whole UI — the VAD
 * indicator and the only reachable Stop button — unmounted. `vadState` survived,
 * the VAD subscription was never cancelled, and silence kept accumulating to the
 * 1.5s threshold, so auto-send re-fired forever: one `transcribeAudio`
 * round-trip and one API bill every 1.5 seconds, invisible and unstoppable.
 *
 * Nothing caught it because every test in the batch that introduced it finished
 * inside 650ms — the auto-send threshold is 1500ms, so no test ever completed a
 * single conversational cycle. These do.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState } from '../src/lib/voice-input/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One silent VAD cycle plus the auto-send round-trip, with margin. */
const ONE_UTTERANCE_MS = 2000;

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function makeStore() {
	const calls = { transcribe: 0, startRecording: 0, levelMonitoring: 0, polls: 0, stopped: 0 };
	const manager = {
		startRecording: () => {
			calls.startRecording += 1;
		},
		stopRecording: async () => new Blob(),
		startAudioLevelMonitoring: () => {
			calls.levelMonitoring += 1;
			return calls.levelMonitoring;
		},
		stopInterval: () => {
			calls.stopped += 1;
		},
		detectVoiceActivity: () => {
			calls.polls += 1;
			return false; // always silent, so auto-send is reached
		},
		cleanup: () => {},
		requestMicrophone: async () => {}
	};
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), permission: 'granted' },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => {
				calls.transcribe += 1;
				return 'hello';
			},
			getAudioManager: () => manager as never,
			createAudioManager: () => manager as never
		}
	});
	cleanup.push(() => store.destroy?.());
	return { store, calls };
}

describe('a conversation that reaches auto-send', () => {
	it('stays in conversation mode and keeps recording', async () => {
		const { store } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });

		await wait(ONE_UTTERANCE_MS);

		// The whole defect in one pair of assertions: `mode` went null and
		// `status` went idle while the recorder was live.
		expect(store.state.mode, 'conversation mode ended itself').toBe('conversation');
		expect(store.state.status, 'went idle while the microphone was recording').toBe('recording');
	});

	// A control, not a regression guard, and labelled as one deliberately.
	//
	// Continuous auto-send on each silent interval is what conversation mode is
	// *for*, so the transcription count is the same before and after the fix —
	// this assertion cannot distinguish them and must not be read as if it does.
	// Its job is to prove the window is long enough to complete a cycle, which is
	// what makes the two assertions above meaningful rather than vacuous.
	it('CONTROL: the window is long enough to reach auto-send at all', async () => {
		const { store, calls } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });

		await wait(ONE_UTTERANCE_MS);

		expect(calls.transcribe, 'no auto-send fired — the window is too short').toBeGreaterThan(0);
	});

	it('resets the silence counter after sending, so the threshold is a real interval', async () => {
		const { store } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });

		await wait(ONE_UTTERANCE_MS);

		// If the counter were left at or above the threshold, every subsequent
		// tick would re-trigger auto-send rather than one per silent interval.
		const vad = store.state.vadState;
		expect(vad, 'vadState was dropped, so the loop can no longer detect silence').not.toBeNull();
		expect(vad!.silenceDuration).toBeLessThan(vad!.autoSendThreshold);
	});

	it('stops everything when the user finally ends it', async () => {
		const { store, calls } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(ONE_UTTERANCE_MS);

		expect(calls.polls, 'the loop never ran, so "stops" proves nothing').toBeGreaterThan(0);

		store.dispatch({ type: 'deactivateVoiceInput' });
		const atTeardown = { polls: calls.polls, transcribe: calls.transcribe };

		await wait(600);

		expect(calls.polls, 'the VAD loop outlived the session').toBe(atTeardown.polls);
		expect(calls.transcribe, 'auto-send outlived the session').toBe(atTeardown.transcribe);
	});
});
