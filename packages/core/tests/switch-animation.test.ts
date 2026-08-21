/**
 * The Switch thumb was driven by three mechanisms at once.
 *
 * A Motion One spring on `x`, a reactive inline `style="transform:
 * translateX(...)"`, and a Tailwind `transition-transform` — all authoring the
 * same property. Motion wins while it runs, the inline style then asserts the
 * end value, and the CSS transition fires again whenever that style is
 * re-committed. Three timelines, one property.
 *
 * The spring is the one that should live: a thumb travelling between two
 * positions is a real state transition. `guides/ANIMATION-GUIDELINES.md` records
 * why `Switch` is not on the Pattern A "no animation" list, despite the original
 * version of that document listing it.
 *
 * The `$effect` was also unguarded, so it re-animated on every effect run rather
 * than on every *change* — including once on mount.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Switch from '../src/lib/components/ui/switch/Switch.svelte';
import SwitchRerenderTest from './test-components/SwitchRerenderTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/**
 * Horizontal translation as a percentage, read from the inline transform.
 *
 * Not the computed matrix: Tailwind is not compiled here, so `h-5 w-5` gives the
 * thumb zero width and `translateX(100%)` computes to `matrix(…, 0, 0)` at every
 * point of the animation — measured. The inline string is where the motion is
 * actually visible.
 */
function translateX(el: HTMLElement): number {
	const m = (el.getAttribute('style') ?? '').match(/translateX\(([-\d.]+)%\)/);
	return m ? Number.parseFloat(m[1]!) : 0;
}

function mount(props: Record<string, unknown> = {}) {
	const screen = render(Switch, { props });
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		control: () => root.querySelector<HTMLButtonElement>('[role="switch"]')!,
		thumb: () => root.querySelector<HTMLElement>('[role="switch"] > div')!
	};
}

describe('the switch thumb', () => {
	it('starts at rest', () => {
		const s = mount();
		expect(translateX(s.thumb())).toBe(0);
	});

	it('travels rather than jumping', async () => {
		const s = mount();
		s.control().click();
		await wait(40);

		const mid = translateX(s.thumb());
		expect(mid, 'the thumb did not move').toBeGreaterThan(0);
		expect(mid, 'the thumb jumped straight to the end').toBeLessThan(95);
	});

	it('settles at the far end', async () => {
		const s = mount();
		s.control().click();
		await wait(500);

		expect(Math.round(translateX(s.thumb()))).toBe(100);
	});

	it('travels back', async () => {
		const s = mount();
		s.control().click();
		await wait(500);
		s.control().click();
		await wait(500);

		expect(Math.round(translateX(s.thumb()))).toBe(0);
	});

	it('is not re-asserted by an unrelated re-render', async () => {
		// A guard, not a reproduction — and worth being precise about which.
		//
		// The reactive inline `style="transform: translateX(...)"` and Motion One
		// author the same property, so an unrelated re-render *should* be able to
		// snap the thumb to its end position. I could not make that happen: Motion
		// overwrites the attribute on the next frame, fast enough that the snap is
		// never observable. So this passes both before and after the fix.
		//
		// It stays because removing the inline style is what makes the invariant
		// real rather than incidental, and this is what would catch someone
		// putting a second author back.
		//
		// The nudge changes an unrelated prop (`class`), so only a genuine Svelte
		// update can cause the snap. An earlier version of this test poked an
		// attribute directly, which does not re-render and made it pass vacuously.
		const screen = render(SwitchRerenderTest);
		cleanup.push(() => screen.unmount());
		const root = screen.container;
		const thumb = () => root.querySelector<HTMLElement>('[role="switch"] > div')!;

		root.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await wait(40);
		const before = translateX(thumb());
		expect(before, 'precondition: mid-flight').toBeGreaterThan(0);
		expect(before, 'precondition: mid-flight').toBeLessThan(95);

		root.querySelector<HTMLButtonElement>('[data-testid="nudge"]')!.click();
		await wait(16);

		const after = translateX(thumb());
		expect(after, `an unrelated re-render snapped the thumb from ${before}% to ${after}%`).toBeLessThan(99);
	});

	it('does not animate on mount when it starts checked', async () => {
		// An unguarded effect springs the thumb in from 0 on first render, which
		// looks like the user toggled something they did not.
		const s = mount({ checked: true });
		await wait(16);

		expect(
			Math.round(translateX(s.thumb())),
			'the thumb animated in from zero on mount'
		).toBe(100);
	});
});
