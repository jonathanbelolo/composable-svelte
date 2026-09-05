/**
 * Collapsible's collapse animated from 0 to 0.
 *
 * `CollapsibleContent` binds an element and animates it with
 * `animateAccordionCollapse`, which starts by reading `element.scrollHeight`.
 * But the `{#if $store.isExpanded}` sat *inside* that bound element, so on
 * collapse Svelte emptied it during the DOM update and the `$effect` — which
 * runs afterwards — measured a box with nothing in it. Start height ≈ 0, so the
 * animation ran 0 → 0 and the content simply vanished.
 *
 * Accordion is immune by accident: its content is always rendered, so
 * `scrollHeight` is real when the effect runs. Expanding was never broken for
 * either, because by then the content has already been mounted.
 *
 * This is invariant 5 in `guides/ANIMATION-GUIDELINES.md`: the element must
 * still contain its content while it animates.
 *
 * The assertion samples height mid-flight rather than checking that an animation
 * exists — 0 → 0 *is* an animation, and it is exactly the one that looked fine.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CollapsibleAnimationTest from './test-components/CollapsibleAnimationTest.svelte';
import { assertMotionAllowed, midFlight, settleValue, waitUntil } from '../src/lib/test/animation.js';

// `height` runs on Motion's ticker: the mid-flight sample polls for a height
// between open and closed rather than sampling five times at 30 ms
// (R1-REVIEW 2.1).
beforeAll(() => assertMotionAllowed());

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(CollapsibleAnimationTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		toggle: () => root.querySelector<HTMLButtonElement>('button')!,
		// By id, not by `[role="region"]`: the Collapsible *root* also carries that
		// role, so a bare selector matches the wrapper and every measurement below
		// becomes vacuous. Found by probing rather than by the tests failing.
		region: () => root.querySelector<HTMLElement>('[id^="collapsible-content-"]')!,
		height: () =>
			Number.parseFloat(
				getComputedStyle(root.querySelector('[id^="collapsible-content-"]')!).height
			)
	};
}

describe('collapsible expand/collapse', () => {
	const settledHeight = (c: ReturnType<typeof mount>) => settleValue(() => c.height(), { what: 'the height' });

	it('grows to a real height when expanding', async () => {
		const c = mount();
		c.toggle().click();

		expect(await settledHeight(c), 'the content never took up space').toBeGreaterThan(10);
	});

	it('collapses *through* intermediate heights, not straight to zero', async () => {
		const c = mount();
		c.toggle().click();
		const open = await settledHeight(c);
		expect(open, 'precondition: it was open').toBeGreaterThan(10);

		c.toggle().click();
		const mid = await midFlight(() => c.height(), { from: open, to: 0, what: 'the height' });
		expect(mid, 'height never travelled — it went straight to 0').toBeGreaterThan(1);
	});

	it('ends collapsed, with the content gone', async () => {
		const c = mount();
		c.toggle().click();
		await settledHeight(c);
		c.toggle().click();

		expect(await settledHeight(c)).toBeLessThan(2);
		await waitUntil(() => c.region().textContent!.trim(), (t) => t === '', { what: 'the content to unmount' });
	});

	it('can be reopened after collapsing', async () => {
		const c = mount();
		c.toggle().click();
		await settledHeight(c);
		c.toggle().click();
		await settledHeight(c);
		c.toggle().click();

		expect(await settledHeight(c)).toBeGreaterThan(10);
	});
});
