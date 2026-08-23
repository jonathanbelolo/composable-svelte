/**
 * The two voice-input panels fade in, and end fully visible.
 *
 * Both carried a one-shot `@keyframes fadeIn` — a lifecycle animation the policy
 * prohibits — and both were exempt in the animation `BACKLOG` for a stated
 * reason rather than for time: converting them would have deleted the only
 * `@media (prefers-reduced-motion: reduce)` guard each had, because no helper in
 * `animate.ts` consulted the preference.
 *
 * `animateFadeIn` consults it, and *writes* `opacity: '1'` under it rather than
 * merely returning — so the conversion keeps the guard instead of trading it for
 * a policy tick. That write is what these assert: whichever path runs, the panel
 * is visible when it settles. A helper that only returned early would leave the
 * element wherever Motion One last put it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import PushToTalkPanel from '../src/lib/voice-input/components/PushToTalkPanel.svelte';
import ConversationModePanel from '../src/lib/voice-input/components/ConversationModePanel.svelte';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState } from '../src/lib/voice-input/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Mounts the way the rest of this suite does — Svelte's own `mount`. */
function mountPanel(Component: unknown, props: Record<string, unknown>): HTMLElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

const store = () =>
	createStore<VoiceInputState, VoiceInputAction>({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		dependencies: {}
	});

/** Poll until `animateFadeIn`'s completion write lands, or give up. */
async function settledInlineOpacity(element: HTMLElement): Promise<void> {
	for (let i = 0; i < 40; i += 1) {
		if (element.style.opacity !== '') return;
		await wait(25);
	}
}

describe('voice-input panel entrance', () => {
	it('PushToTalkPanel actually animates in, and settles fully visible', async () => {
		const target = mountPanel(PushToTalkPanel, { store: store() });
		const panel = target.querySelector('.push-to-talk-popover');

		expect(panel, 'the panel did not render').not.toBeNull();

		// `animateFadeIn` writes `element.style.opacity = '1'` once it settles — on
		// the animated path after `.finished`, and immediately under
		// `prefers-reduced-motion`. That inline write is the signal, and it is not
		// racy: an entrance that never ran leaves the property unset entirely,
		// because the CSS keyframe that used to drive this is gone.
		//
		// The computed value cannot stand in for it. With no CSS `opacity: 0` left,
		// a panel that never animated also computes to 1. Nor can a live
		// `getAnimations()` sample: the fade is 200ms, and under load it finishes
		// before the sample is taken.
		await settledInlineOpacity(panel as HTMLElement);
		expect(
			(panel as HTMLElement).style.opacity,
			'no inline opacity — the entrance never ran'
		).toBe('1');
	});

	it('ConversationModePanel actually animates in, and settles fully visible', async () => {
		const target = mountPanel(ConversationModePanel, { store: store() });
		const panel = target.querySelector('.conversation-panel');

		// See the note in the test above: the inline write is the signal.
		await settledInlineOpacity(panel as HTMLElement);
		expect(
			(panel as HTMLElement).style.opacity,
			'no inline opacity — the entrance never ran'
		).toBe('1');
	});

	it('neither panel animates in CSS any more', async () => {
		// The conversion's other half: if the keyframe came back, both the policy
		// scanner and this would have to be defeated to land it.
		const target = mountPanel(ConversationModePanel, { store: store() });
		const panel = target.querySelector('.conversation-panel')!;

		expect(getComputedStyle(panel).animationName).toBe('none');
	});

	it('keeps the reduced-motion guard on the status-dot spinners', () => {
		// The trap the old BACKLOG comment set. It recorded that each panel's
		// `fadeIn` was "the only thing its own `@media (prefers-reduced-motion:
		// reduce)` block disables" — true for `PushToTalkPanel`, whose block went
		// with the keyframe, and false for this one. Its block also stops
		// `.status-dot.active` / `.status-dot.processing`, which are legal
		// `infinite` animations and are still the user's only escape from them.
		// Following the comment would have deleted a live accessibility guard as a
		// side effect of a policy conversion.
		//
		// The animation policy scanner cannot see this: it looks for prohibited
		// animations, not for the absence of a guard on a permitted one.
		mountPanel(ConversationModePanel, { store: store() });

		const guards = Array.from(document.styleSheets)
			.flatMap((sheet) => {
				try {
					return Array.from(sheet.cssRules);
				} catch {
					return [];
				}
			})
			.filter((rule) => rule.cssText.includes('prefers-reduced-motion'))
			.filter((rule) => rule.cssText.includes('status-dot'));

		expect(
			guards.length,
			'the status-dot spinners lost their reduced-motion escape'
		).toBeGreaterThan(0);
	});
});
