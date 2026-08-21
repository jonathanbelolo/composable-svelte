/**
 * The carousel track had two clocks for one gesture.
 *
 * `carousel.reducer.ts` owns `isTransitioning` and needs a `transitionCompleted`
 * to clear it. The component satisfied that with a bare `setTimeout` run against
 * `transitionDuration` — while feeding the *same* number to CSS as
 * `style:transition-duration`. Two independent timers for one movement, with no
 * cancellation and nothing tying the dispatch to the animation actually
 * finishing. `guides/ANIMATION-GUIDELINES.md` names this component as the
 * cautionary example for its first question: does anything in the store react to
 * this animation finishing?
 *
 * It does, so the lifecycle belongs in the store, and the completion must come
 * from the animation rather than from a parallel clock.
 *
 * No timeout fallback here, and that is checked rather than assumed: the reducer
 * refuses navigation and autoplay while `isTransitioning`
 * (`carousel.reducer.ts:26,:45,:64,:125`), so the animation cannot be
 * interrupted, so the promise always settles. An interrupted Motion One promise
 * never settles — see `tests/animation-interruption.test.ts`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CarouselAnimationTest from './test-components/CarouselAnimationTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Horizontal offset as a percentage, from the inline transform Motion writes. */
function offsetPercent(el: HTMLElement): number {
	const m = (el.getAttribute('style') ?? '').match(/translateX\(([-\d.]+)%\)/);
	if (m) return Number.parseFloat(m[1]!);
	// Motion may commit a matrix once settled; fall back to px over width.
	const { transform } = getComputedStyle(el);
	const mm = transform.match(/matrix\(([^)]+)\)/);
	if (!mm) return 0;
	const px = Number.parseFloat(mm[1]!.split(',')[4]!);
	return el.offsetWidth ? (px / el.offsetWidth) * 100 : px;
}

function mount() {
	const screen = render(CarouselAnimationTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		track: () => root.querySelector<HTMLElement>('.carousel-slides')!,
		next: () => root.querySelector<HTMLButtonElement>('.carousel-next')!,
		dots: () => [...root.querySelectorAll<HTMLButtonElement>('.carousel-dot')]
	};
}

describe('the carousel track', () => {
	it('starts at the first slide', () => {
		const c = mount();
		expect(offsetPercent(c.track())).toBe(0);
	});

	it('travels rather than jumping', async () => {
		const c = mount();
		c.next().click();
		await wait(60);

		const mid = offsetPercent(c.track());
		expect(mid, 'the track did not move').toBeLessThan(0);
		expect(mid, 'the track jumped straight to the next slide').toBeGreaterThan(-99);
	});

	it('settles exactly on the next slide', async () => {
		const c = mount();
		c.next().click();
		await wait(700);

		expect(Math.round(offsetPercent(c.track()))).toBe(-100);
	});

	it('clears isTransitioning when the animation finishes, not on a parallel timer', async () => {
		// The handshake `carousel.test.ts` pins at the reducer level, now driven
		// end-to-end. If the dispatch were lost the carousel would refuse every
		// later navigation, because the reducer guards on `isTransitioning`.
		const c = mount();
		c.next().click();
		await wait(700);

		c.next().click();
		await wait(700);
		expect(
			Math.round(offsetPercent(c.track())),
			'a second navigation was refused — transitionCompleted never arrived'
		).toBe(-200);
	});

	it('a dot jumps to its slide', async () => {
		const c = mount();
		c.dots()[2]!.click();
		await wait(700);

		expect(Math.round(offsetPercent(c.track()))).toBe(-200);
	});
});
