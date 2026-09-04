/**
 * Conversation mode never started on first use.
 *
 * `activateConversationMode` checks `permission !== 'granted'` first. On a fresh
 * page that is always true, so it sets `mode: 'conversation'`, dispatches
 * `requestMicrophonePermission`, and **returns before the recording/VAD batch**.
 * `microphonePermissionGranted` then only resumes
 * `if (state.mode === 'push-to-talk')` — the conversation branch of that handoff
 * was never written, and nothing else re-dispatches.
 *
 * The visible result: the panel renders, says "Listening…", and no recording, no
 * level monitoring and no VAD are running. The feature looks present and does
 * nothing, which is this campaign's subject exactly.
 *
 * These tests drive the reducer through the real permission sequence rather than
 * seeding `permission: 'granted'`, because seeding it skips the branch that is
 * broken.
 *
 * These drive the *whole* sequence — activate, request, grant, record — because
 * `createAudioManager` is now a dependency. It was previously imported straight
 * from the registry and called inside the effect, so acquiring the microphone
 * was hard-wired to a real device: headless chromium refused it, a
 * `microphonePermissionDenied` landed mid-test, and no assertion on `status`
 * could be trusted. That is what the Dependencies system is for, and the missing
 * seam was itself the defect.
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
	const calls = { startRecording: 0, polls: 0, levelMonitoring: 0, created: 0, stopInterval: 0 };
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
			calls.stopInterval += 1;
		},
		detectVoiceActivity: () => {
			calls.polls += 1;
			return false;
		},
		cleanup: () => {},
		requestMicrophone: async () => {}
	};
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), ...overrides },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => manager as never,
			createAudioManager: () => {
				calls.created += 1;
				return manager as never;
			}
		}
	});
	cleanup.push(() => store.destroy?.());
	return { store, calls };
}

describe('conversation mode, from a cold start', () => {
	it('actually starts recording once permission arrives', async () => {
		const { store, calls } = makeStore();

		store.dispatch({ type: 'activateConversationMode' });
		expect(store.state.mode, 'precondition: mode is set immediately').toBe('conversation');
		expect(calls.startRecording, 'precondition: nothing starts before permission').toBe(0);

		await wait(50);

		expect(
			calls.startRecording,
			'permission was granted and conversation mode never began recording'
		).toBe(1);
	});

	it('starts the VAD loop once permission arrives', async () => {
		const { store, calls } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(300);

		expect(calls.polls, 'no voice-activity detection is running').toBeGreaterThan(1);
	});

	it('reaches the recording status, not just the mode', async () => {
		// The full sequence, ending on `status` — the assertion that could not be
		// made before the seam existed. `mode` alone would prove nothing: the broken
		// version set it on the first dispatch and then did nothing at all.
		const { store } = makeStore();
		store.dispatch({ type: 'activateConversationMode' });
		await wait(50);

		expect(store.state.status).toBe('recording');
		expect(store.state.vadState, 'VAD state was never initialised').not.toBeNull();
	});

	it('drives the push-to-talk handoff too, and does not hijack it', async () => {
		// The previous version of this test dispatched only `activatePushToTalk`,
		// which is a two-line state set returning `Effect.none()` — it requests no
		// permission and starts nothing, so `polls === 0` was true under every
		// possible mutation of the conversation branch and the test could not go
		// red. It also claimed to prove "the existing handoff still works" while
		// never executing that handoff at all.
		//
		// This drives the real sequence: request, grant, record.
		const { store, calls } = makeStore();
		store.dispatch({ type: 'activatePushToTalk' });
		store.dispatch({ type: 'startPushToTalkRecording' });

		await wait(80);

		expect(calls.created, 'no audio manager was created').toBe(1);
		expect(calls.startRecording, 'the push-to-talk handoff never reached the device').toBe(1);
		expect(store.state.mode).toBe('push-to-talk');
		// The conversation branch must not have run: no VAD loop in push-to-talk.
		expect(calls.polls, 'a VAD loop started in push-to-talk').toBe(0);
	});
});
