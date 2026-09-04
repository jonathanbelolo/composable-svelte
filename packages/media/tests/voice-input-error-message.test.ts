/**
 * An error the user cannot see is not an error the component reported.
 *
 * `VoiceInputState.errorMessage` was written on five paths — permission denied,
 * recording failure, transcription failure, audio-processing failure — and
 * rendered by nothing. `VoiceInputButton` reads `status === 'error'` to tint the
 * icon, so the user learns *that* something failed and never *what*, and the
 * reason the reducer carefully captured was thrown away at the boundary.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import VoiceInput from '../src/lib/voice-input/VoiceInput.svelte';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState } from '../src/lib/voice-input/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** A manager that does nothing but exist, for the paths that need one present. */
const workingManager = {
	startRecording: () => {},
	stopRecording: async () => new Blob(),
	startAudioLevelMonitoring: () => 1,
	stopInterval: () => {},
	detectVoiceActivity: () => false,
	cleanup: () => {},
	requestMicrophone: async () => {}
} as never;

function mountVoiceInput(options: { withManager?: boolean } = {}) {
	const manager = options.withManager ? workingManager : undefined;
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => manager,
			createAudioManager: () => workingManager
		}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(VoiceInput as never, {
		target,
		props: { store, onTranscript: () => {} }
	});
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
		store.destroy?.();
	});
	return { store, target };
}

describe('the error message clears', () => {
	// The alert had exactly one clearing site — `deactivateVoiceInput` — and the
	// only things that dispatch it are the conversation panel's Stop button and
	// the button toggle. Neither is reachable from push-to-talk, so a single
	// failed transcription left the red alert under the button for the rest of
	// the session, through every subsequent successful recording.
	it('when a new push-to-talk recording starts', () => {
		const { store, target } = mountVoiceInput({ withManager: true });
		store.dispatch({ type: 'audioProcessingFailed', error: 'Transcription failed' });
		flushSync();
		expect(target.textContent, 'the control failed — no error was shown').toContain(
			'Transcription failed'
		);

		store.dispatch({ type: 'microphonePermissionGranted', managerId: 'm1' });
		store.dispatch({ type: 'startPushToTalkRecording' });
		flushSync();

		expect(store.state.errorMessage, 'a stale error survived a new attempt').toBeNull();
		expect(target.textContent).not.toContain('Transcription failed');
	});

	it('when an utterance finally succeeds', () => {
		const { store, target } = mountVoiceInput();
		store.dispatch({ type: 'audioProcessingFailed', error: 'Transcription failed' });
		flushSync();
		expect(target.textContent).toContain('Transcription failed');

		store.dispatch({ type: 'audioProcessingComplete', audioBlob: new Blob() });
		flushSync();

		expect(store.state.errorMessage, 'a stale error survived a success').toBeNull();
	});
});

describe('the error message', () => {
	it('is shown to the user', () => {
		const { store, target } = mountVoiceInput();

		store.dispatch({ type: 'microphonePermissionDenied', error: 'Microphone blocked' });
		flushSync();

		expect(
			target.textContent,
			'the reducer captured a reason and the component never showed it'
		).toContain('Microphone blocked');
	});

	it('is announced, not just painted', () => {
		// Colour alone does not reach a screen reader, and this is the one message
		// the user needs in order to act.
		const { store, target } = mountVoiceInput();
		store.dispatch({ type: 'microphonePermissionDenied', error: 'Microphone blocked' });
		flushSync();

		const alert = target.querySelector('[role="alert"]');
		expect(alert, 'no live region carries the error').not.toBeNull();
		expect(alert!.textContent).toContain('Microphone blocked');
	});

	it('is absent when nothing has failed', () => {
		const { target } = mountVoiceInput();
		expect(target.querySelector('[role="alert"]')).toBeNull();
	});

	it('clears when voice input is deactivated', () => {
		const { store, target } = mountVoiceInput();
		store.dispatch({ type: 'microphonePermissionDenied', error: 'Microphone blocked' });
		flushSync();
		expect(target.querySelector('[role="alert"]')).not.toBeNull();

		store.dispatch({ type: 'deactivateVoiceInput' });
		flushSync();

		expect(target.querySelector('[role="alert"]'), 'a stale error outlived its cause').toBeNull();
	});
});
