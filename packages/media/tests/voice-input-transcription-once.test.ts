/**
 * An utterance must be transcribed exactly once.
 *
 * The conversation path transcribed it twice, on the same `Blob`.
 * `autoSendTriggered` called `deps.transcribeAudio`, then dispatched
 * `audioProcessingComplete` carrying the result — and *that* case called
 * `transcribeAudio` again on the same blob, used the second result, and threw
 * the first away. Two network round-trips and two API bills per utterance, with
 * the first result computed and discarded.
 *
 * `AudioProcessingComplete.transcript` was the tell: written at two sites and
 * read at none.
 *
 * The fix puts transcription in one place — `audioProcessingComplete`, which
 * push-to-talk already relied on — so both modes go through a single call and
 * the dead payload field disappears.
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

function makeStore(overrides: Partial<VoiceInputState> = {}) {
	const calls = { transcribe: 0, blobs: [] as Blob[] };
	const manager = {
		startRecording: () => {},
		stopRecording: async () => new Blob(['audio']),
		startAudioLevelMonitoring: () => 0,
		detectVoiceActivity: () => false,
		cleanup: () => {},
		requestMicrophone: async () => {}
	};
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), permission: 'granted', ...overrides },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async (blob: Blob) => {
				calls.transcribe += 1;
				calls.blobs.push(blob);
				return 'hello';
			},
			getAudioManager: () => manager as never,
			createAudioManager: () => manager as never
		}
	});
	cleanup.push(() => store.destroy?.());
	return { store, calls };
}

describe('transcription', () => {
	it('happens once per utterance in conversation mode', async () => {
		const { store, calls } = makeStore({ mode: 'conversation', status: 'recording' });

		store.dispatch({ type: 'autoSendTriggered' });
		await wait(80);

		expect(calls.transcribe, `the same audio was sent ${calls.transcribe} times`).toBe(1);
	});

	it('happens once per utterance on a manual send', async () => {
		const { store, calls } = makeStore({ mode: 'conversation', status: 'recording' });

		store.dispatch({ type: 'manualSendRequested' });
		await wait(80);

		expect(calls.transcribe).toBe(1);
	});

	it('still produces a transcript', async () => {
		// The count could be made 1 by deleting the wrong call. This is the control
		// that the surviving one is the one that reaches the user.
		const seen: string[] = [];
		const { store } = makeStore({ mode: 'conversation', status: 'recording' });
		store.subscribeToActions?.((action) => {
			if (action.type === 'transcriptionCompleted') seen.push(action.transcript);
		});

		store.dispatch({ type: 'autoSendTriggered' });
		await wait(80);

		expect(seen, 'no transcript reached the store').toEqual(['hello']);
	});

	it('happens once for push-to-talk', async () => {
		const { store, calls } = makeStore({ mode: 'push-to-talk', status: 'recording' });

		store.dispatch({ type: 'stopPushToTalkRecording' });
		await wait(80);

		expect(calls.transcribe).toBe(1);
	});
});
