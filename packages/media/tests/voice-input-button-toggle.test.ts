/**
 * The conversation toggle on `VoiceInputButton` must be reachable.
 *
 * `mode` defaulted to `'push-to-talk'`, which is truthy, so
 * `mode || ($store.mode === 'conversation' ? … )` short-circuited on the default
 * and the store-derived fallback never once evaluated. `interactionMode` was
 * therefore pinned to push-to-talk and `handleClick` returned at its guard every
 * time — the toggle was dead surface, and `VoiceInput` never passed `mode`
 * either, so nothing could revive it.
 *
 * Worse than inert: with `interactionMode` stuck, clicking the button *during* a
 * live conversation fell through to `handlePointerDown` and started a
 * push-to-talk recording, corrupting the session instead of ending it. The
 * styleguide worked around all of this with a second button of its own.
 *
 * No test in this package mounted the button or clicked it. These do.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import VoiceInput from '../src/lib/voice-input/VoiceInput.svelte';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState } from '../src/lib/voice-input/types.js';

const manager = {
	startRecording: () => {},
	stopRecording: async () => new Blob(),
	startAudioLevelMonitoring: () => 1,
	stopInterval: () => {},
	detectVoiceActivity: () => false,
	cleanup: () => {},
	requestMicrophone: async () => {}
} as never;

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountVoiceInput(initial: Partial<VoiceInputState> = {}) {
	const store = createStore<VoiceInputState, VoiceInputAction>({
		initialState: { ...createInitialVoiceInputState(), permission: 'granted', ...initial },
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => manager,
			createAudioManager: () => manager
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

function clickButton(target: HTMLElement) {
	const button = target.querySelector('button');
	expect(button, 'no button rendered').not.toBeNull();
	button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	flushSync();
}

describe('the button while a conversation is running', () => {
	it('ends it, rather than starting a push-to-talk recording over it', () => {
		const { store, target } = mountVoiceInput({ mode: 'conversation' });
		expect(store.state.mode, 'the control failed').toBe('conversation');

		clickButton(target);

		expect(store.state.mode, 'the click did not end the conversation').not.toBe('conversation');
		expect(store.state.mode, 'the click hijacked the session into push-to-talk').not.toBe(
			'push-to-talk'
		);
	});
});

describe('the button with no conversation running', () => {
	it('leaves push-to-talk alone — a click is not a hold', () => {
		// `interactionMode` falls back to push-to-talk, whose handler is
		// pointerdown/up. A bare click must not toggle a conversation on.
		const { store, target } = mountVoiceInput();
		clickButton(target);
		expect(store.state.mode).not.toBe('conversation');
	});
});
