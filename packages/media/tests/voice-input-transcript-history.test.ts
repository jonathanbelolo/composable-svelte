/**
 * Conversation-mode transcript history was wiped by every unrelated dispatch.
 *
 * `VoiceInput.svelte` cleared the history from an effect teardown:
 *
 *   $effect(() => {
 *     const mode = $store.mode;
 *     return () => { transcriptHistory = []; };
 *   });
 *
 * The intent — "reset the history when the mode changes" — is not what it did.
 * `$store` is a whole-store subscription that `$state.raw` replaces on every
 * dispatch, so reading `$store.mode` inside the effect tracks the *store*, not
 * the mode. Every action re-ran the effect, and every re-run fired the teardown
 * first. While recording, `audioLevelUpdated` arrives per animation frame, so
 * the history was cleared continuously and the panel was permanently empty.
 *
 * The fix keys the effect on `$derived($store.mode)`, a primitive, whose
 * equality check absorbs dispatches that leave the mode alone.
 *
 * These assertions are on the rendered panel rather than on `transcriptHistory`,
 * because the empty panel is the symptom a user reports and the field is not
 * reachable from outside the component.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import VoiceInput from '../src/lib/voice-input/VoiceInput.svelte';

const settle = () => new Promise((r) => setTimeout(r, 120));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountVoiceInput(defaultMode: 'push-to-talk' | 'conversation' = 'conversation') {
	const store = createStore({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		// Both required members must be real functions: `deactivateVoiceInput`
		// calls `deps.getAudioManager` unconditionally, so `{}` makes the reducer
		// throw rather than reset the mode — which is a broken harness, not a
		// finding about the effect under test.
		dependencies: {
			transcribeAudio: async () => '',
			getAudioManager: () => undefined
		}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(VoiceInput, {
		target,
		props: { store, onTranscript: vi.fn(), defaultMode }
	});
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return { store, target };
}

const historyText = (target: HTMLElement) =>
	[...target.querySelectorAll('.history-item .item-text')].map((n) => n.textContent);

describe('conversation-mode transcript history', () => {
	it('shows a completed transcript', async () => {
		// Positive control. If this fails, the trigger or the harness is wrong,
		// not the effect under test.
		const { store, target } = mountVoiceInput();
		await settle();

		store.dispatch({ type: 'transcriptionCompleted', transcript: 'hello there' });
		flushSync();
		await settle();

		expect(historyText(target)).toEqual(['hello there']);
	});

	it('survives an unrelated dispatch', async () => {
		// The defect. `audioLevelUpdated` is dispatched per animation frame while
		// recording, and does not touch `mode` — the history must not care.
		const { store, target } = mountVoiceInput();
		await settle();

		store.dispatch({ type: 'transcriptionCompleted', transcript: 'hello there' });
		flushSync();
		await settle();

		store.dispatch({ type: 'audioLevelUpdated', level: 0.4 });
		flushSync();
		await settle();

		expect(
			historyText(target),
			'an unrelated dispatch wiped the history — the effect is keyed on the whole store, not on mode'
		).toEqual(['hello there']);
	});

	it('accumulates across several transcripts and frames', async () => {
		const { store, target } = mountVoiceInput();
		await settle();

		for (const [i, phrase] of ['first', 'second', 'third'].entries()) {
			store.dispatch({ type: 'transcriptionCompleted', transcript: phrase });
			flushSync();
			await settle();
			// Interleave the per-frame action, as real recording does.
			store.dispatch({ type: 'audioLevelUpdated', level: i / 10 });
			flushSync();
			await settle();
		}

		expect(historyText(target)).toEqual(['first', 'second', 'third']);
	});

	it('still clears when the mode genuinely changes', async () => {
		// The behaviour the effect was written for, which must survive the fix —
		// otherwise this is a regression dressed up as a bug fix.
		//
		// Mounted push-to-talk on purpose. Mounting in conversation mode and
		// dispatching `deactivateVoiceInput` looks like a mode change but is not
		// one: see the test below.
		const { store, target } = mountVoiceInput('push-to-talk');
		store.dispatch({ type: 'activateConversationMode' });
		flushSync();
		await settle();

		store.dispatch({ type: 'transcriptionCompleted', transcript: 'hello there' });
		flushSync();
		await settle();
		expect(historyText(target)).toEqual(['hello there']);

		store.dispatch({ type: 'activatePushToTalk' });
		flushSync();
		await settle();
		store.dispatch({ type: 'activateConversationMode' });
		flushSync();
		await settle();

		expect(
			historyText(target),
			'a real mode change must start a fresh history'
		).toEqual([]);
	});

	it('keeps history when a deactivate is immediately undone', async () => {
		// Documents a subtlety found while writing the test above, because it
		// reads like a bug and is not one.
		//
		// With `defaultMode: 'conversation'`, `VoiceInput` has an effect that
		// re-activates whenever `mode` becomes null. So `deactivateVoiceInput`
		// produces `conversation -> null -> conversation` inside a single flush.
		// Measured, not assumed: a subscriber sees exactly that sequence and the
		// mode settles back on `conversation`. The `$derived` equality check
		// therefore reports no net change and the history correctly survives —
		// the mode the user is in never actually changed.
		//
		// The old whole-store effect cleared here, but only because it cleared on
		// literally every dispatch.
		const { store, target } = mountVoiceInput('conversation');
		await settle();

		store.dispatch({ type: 'transcriptionCompleted', transcript: 'hello there' });
		flushSync();
		await settle();

		store.dispatch({ type: 'deactivateVoiceInput' });
		flushSync();
		await settle();

		expect((store.state as { mode: unknown }).mode).toBe('conversation');
		expect(historyText(target)).toEqual(['hello there']);
	});
});
