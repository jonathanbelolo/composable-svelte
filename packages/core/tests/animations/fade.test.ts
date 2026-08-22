/**
 * The two generic fades, and the three things about them that are not obvious.
 *
 * They replace `transition: opacity 0.2s` on elements that **stay mounted** —
 * chat's image preview (`img.loaded`) and its video controls (`.visible`). That
 * differs from every other pair in `animate.ts`, which animate things that
 * unmount, and it drives all three:
 *
 * 1. **The resting state is visible.** `opacity: [0, 1]` supplies its own start,
 *    so no CSS parks the element at `opacity: 0` awaiting an effect. Both sites
 *    used to do exactly that, which meant server HTML — and any client with
 *    JavaScript off — rendered an invisible image.
 * 2. **The end state is written explicitly.** Nothing unmounts to make the final
 *    frame stick, so the fade-out assigns `opacity: 0` itself.
 * 3. **An instant show must go through Motion, not through `style.opacity`.** A
 *    running Web Animation outranks an inline style, so assigning the style
 *    would leave a fade-out in flight to finish and hide the element anyway.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { animateFadeIn, animateFadeOut } from '../../src/lib/animation/animate';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function box() {
	const el = document.createElement('div');
	el.style.cssText = 'position:absolute;top:0;left:0;width:50px;height:50px;background:red;';
	document.body.appendChild(el);
	cleanup.push(() => el.remove());
	return el;
}

const opacity = (el: HTMLElement) => parseFloat(getComputedStyle(el).opacity);

const frames = (n: number) =>
	new Promise((resolve) => {
		let left = n;
		const tick = () => (left-- <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
		requestAnimationFrame(tick);
	});

/** Answer the media query as if the user had asked for reduced motion. */
async function underReducedMotion(fn: () => Promise<void>) {
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
		await fn();
	} finally {
		window.matchMedia = original;
	}
}

describe('animateFadeIn', () => {
	it('eases rather than jumping', async () => {
		const el = box();
		const done = animateFadeIn(el);
		await frames(2);

		const mid = opacity(el);
		// Paired, so neither an instant jump nor doing nothing passes.
		expect(mid, `mid-flight opacity was ${mid}`).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);

		await done;
	});

	it('ends visible the instant it resolves, with no flash back to hidden', async () => {
		// Motion removes its animation on finish and writes the committed style a
		// frame or two *later*, so between the two the element snaps back to
		// whatever the cascade says — here the `opacity: 0` the previous fade-out
		// left inline. Measured: `.finished` resolves with inline `""` and
		// computed `1`. The helpers write their own end state to close that gap,
		// which is why this asserts with no intervening frames.
		const el = box();
		await animateFadeOut(el);
		await animateFadeIn(el);

		expect(opacity(el)).toBe(1);
	});

	it('cancels a fade-out already in flight', async () => {
		// The video controls case: the mouse moves while the 3s idle fade is
		// running. Assigning `style.opacity` here would lose to the animation.
		const el = box();
		void animateFadeOut(el);
		await frames(2);
		expect(opacity(el), 'the fade-out never started').toBeLessThan(1);

		await animateFadeIn(el, { duration: 0 });
		await frames(4);

		expect(opacity(el), 'the cancelled fade-out kept running').toBe(1);
	});
});

describe('animateFadeOut', () => {
	it('ends hidden the instant it resolves, with no flash back to visible', async () => {
		// Nothing unmounts these elements, so the end state has to be written —
		// and written now, not two frames from now. See the note above.
		const el = box();
		await animateFadeOut(el);

		expect(opacity(el)).toBe(0);
	});
});

describe('under prefers-reduced-motion', () => {
	// These read the opacity *before* awaiting, which is what distinguishes
	// honouring the preference from coinciding with it: an animation that runs
	// and lands in the right place ends up at the same value. Only skipping it
	// gets there synchronously. Asserting `getAnimations()` afterwards would not
	// work — Chromium removes a finished, filled animation, so the list is empty
	// either way.

	it('a fade-in shows an element a previous fade-out had hidden', async () => {
		// The trap: returning early leaves it at 0. Skipping the animation must
		// not skip the outcome.
		const el = box();
		el.style.opacity = '0';

		await underReducedMotion(async () => {
			const settled = animateFadeIn(el);
			expect(opacity(el), 'it animated instead of skipping').toBe(1);
			await settled;
		});

		expect(opacity(el)).toBe(1);
	});

	it('a fade-out still hides', async () => {
		const el = box();

		await underReducedMotion(async () => {
			const settled = animateFadeOut(el);
			expect(opacity(el), 'it animated instead of skipping').toBe(0);
			await settled;
		});

		expect(opacity(el)).toBe(0);
	});
});
