/**
 * A scroll that follows a target which keeps moving.
 *
 * `scroll-behavior: smooth` is prohibited by the guideline — the store cannot
 * see it, sequence on it or cancel it — and chat used it on three message lists
 * that auto-scroll as tokens stream in. Two things make this different from
 * every other animation in the repo, and they are why it is a follower rather
 * than another `animate.ts` helper:
 *
 * 1. **The target moves continuously.** The auto-scroll effect re-runs on every
 *    streamed chunk. A one-shot animation per chunk would be interrupted by the
 *    next one, and this repo has already measured that an interrupted Motion One
 *    `.finished` never settles — a long stream would leak one permanently
 *    pending promise per token. One rAF loop re-reading the target each frame
 *    retargets for free.
 * 2. **Its own frames are indistinguishable from the user's.** A chat list
 *    listens to `scroll` to decide whether the user has scrolled away, and the
 *    browser's smooth-scroll frames tripped that check — latching auto-scroll
 *    *off* mid-stream. The follower must let a listener tell "that was me" from
 *    "that was them", without going deaf to the user.
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { createScrollFollower } from '../../src/lib/animation/scroll';
import { assertMotionAllowed, midFlight, nextFrame, settleValue } from '../../src/lib/test/animation.js';

// A requestAnimationFrame loop: the mid-flight sample polls for a scrollTop
// between the endpoints, and "arrives" waits for the value to hold, rather
// than counting frames (R1-REVIEW 2.1).
beforeAll(() => assertMotionAllowed());

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
	vi.restoreAllMocks();
});

/** A real scrollable element — jsdom would report every metric as 0. */
function scrollable(contentHeight = 2000, viewport = 200) {
	const el = document.createElement('div');
	el.style.cssText = `height:${viewport}px;overflow-y:auto;position:absolute;top:0;left:0;width:100px;`;
	const inner = document.createElement('div');
	inner.style.cssText = `height:${contentHeight}px;`;
	el.appendChild(inner);
	document.body.appendChild(el);
	cleanup.push(() => el.remove());
	return { el, inner };
}

describe('createScrollFollower', () => {
	it('cancels the pending frame when reduced motion replaces active following', () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextId = 0;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
			frames.set(++nextId, callback);
			return nextId;
		});
		const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
			frames.delete(id);
		});
		let reduced = false;
		const { el, inner } = scrollable();
		const follower = createScrollFollower(el, { get reducedMotion() { return reduced; } });
		cleanup.push(() => follower.stop());
		follower.follow();
		expect(frames.size).toBe(1);
		reduced = true;
		follower.follow();
		expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
		expect(cancel).toHaveBeenCalledWith(1);
		expect(frames.size).toBe(0);
		// Content changes after the settled call must not revive the old loop.
		const settled = el.scrollTop;
		inner.style.height = '4000px';
		for (const callback of [...frames.values()]) callback(16);
		expect(el.scrollTop).toBe(settled);
		reduced = false;
		follower.follow();
		expect(frames.size).toBe(1);
		follower.stop();
		expect(frames.size).toBe(0);
	});
	it('eases toward the bottom rather than jumping', async () => {
		const { el } = scrollable();
		const follower = createScrollFollower(el);
		cleanup.push(() => follower.stop());

		const target = el.scrollHeight - el.clientHeight;
		follower.follow();

		// A paired discriminator: strictly between 0 and the target, so neither an
		// instant jump nor doing nothing at all passes.
		const mid = await midFlight(() => el.scrollTop, { from: 0, to: target, what: 'scrollTop' });
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(target);
	});

	it('arrives', async () => {
		const { el } = scrollable();
		const follower = createScrollFollower(el);
		cleanup.push(() => follower.stop());

		follower.follow();
		await settleValue(() => el.scrollTop, { frames: 5, timeout: 5000, what: 'scrollTop' });

		expect(el.scrollTop).toBeCloseTo(el.scrollHeight - el.clientHeight, 0);
	});

	it('retargets when the content grows mid-flight, without restarting', async () => {
		const { el, inner } = scrollable(1000);
		const follower = createScrollFollower(el);
		cleanup.push(() => follower.stop());

		follower.follow();
		await midFlight(() => el.scrollTop, { from: 0, to: el.scrollHeight - el.clientHeight, what: 'scrollTop' });
		inner.style.height = '4000px'; // a chunk arrives

		await settleValue(() => el.scrollTop, { frames: 5, timeout: 5000, what: 'scrollTop' });
		expect(el.scrollTop).toBeCloseTo(el.scrollHeight - el.clientHeight, 0);
	});

	it('stops when told to', async () => {
		const { el } = scrollable();
		const follower = createScrollFollower(el);

		follower.follow();
		await nextFrame(2);
		follower.stop();
		const atStop = el.scrollTop;
		await nextFrame(10);

		expect(el.scrollTop, 'the loop outlived stop()').toBe(atStop);
	});

	it('reports its own frames as its own', async () => {
		const { el } = scrollable();
		const follower = createScrollFollower(el);
		cleanup.push(() => follower.stop());

		follower.follow();
		await nextFrame(2);

		expect(follower.isSelfScroll(), 'the follower disowned its own scroll').toBe(true);
	});

	it('does not claim a scroll the user made', async () => {
		// The distinction that matters: it must not simply go deaf while running,
		// or a user scrolling away mid-stream could never escape the auto-scroll.
		const { el } = scrollable();
		const follower = createScrollFollower(el);
		cleanup.push(() => follower.stop());

		follower.follow();
		await nextFrame(2);
		el.scrollTop = 0; // the user drags back to the top

		expect(follower.isSelfScroll(), 'a user scroll was mistaken for the follower').toBe(false);
	});

	it('reads the preference itself when the caller does not pass it', () => {
		// The option used to default to `undefined`, which is falsy, so a follower
		// constructed without config animated regardless of the user's setting —
		// while the guideline claimed this was the one helper that honoured it.
		// chat happened to pass the flag, so nothing was visibly broken and the
		// documentation was simply false.
		const original = window.matchMedia;
		window.matchMedia = ((query: string) => ({
			matches: /prefers-reduced-motion/.test(query),
			media: query,
			onchange: null,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			dispatchEvent: () => false
		})) as never;

		try {
			const { el } = scrollable();
			const follower = createScrollFollower(el);
			cleanup.push(() => follower.stop());

			follower.follow();

			expect(el.scrollTop, 'it animated despite the preference').toBe(
				el.scrollHeight - el.clientHeight
			);
		} finally {
			window.matchMedia = original;
		}
	});

	it('jumps instantly under reduced motion, and still ends at the bottom', async () => {
		// Skipping the animation must never skip the outcome. That is the rule the
		// guideline states for every helper, and the one none of the others keeps.
		const { el } = scrollable();
		const follower = createScrollFollower(el, { reducedMotion: true });
		cleanup.push(() => follower.stop());

		follower.follow();

		expect(el.scrollTop, 'reduced motion animated anyway').toBe(
			el.scrollHeight - el.clientHeight
		);
	});
});
