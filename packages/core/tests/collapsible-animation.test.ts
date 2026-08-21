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

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CollapsibleAnimationTest from './test-components/CollapsibleAnimationTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
	it('grows to a real height when expanding', async () => {
		const c = mount();
		c.toggle().click();
		await wait(400);

		expect(c.height(), 'the content never took up space').toBeGreaterThan(10);
	});

	it('collapses *through* intermediate heights, not straight to zero', async () => {
		const c = mount();
		c.toggle().click();
		await wait(400);
		const open = c.height();
		expect(open, 'precondition: it was open').toBeGreaterThan(10);

		c.toggle().click();
		const samples: number[] = [];
		for (let i = 0; i < 5; i += 1) {
			await wait(30);
			samples.push(c.height());
		}

		expect(
			samples.some((h) => h > 1 && h < open),
			`height never travelled — it went straight to 0. samples: ${samples.join(', ')}`
		).toBe(true);
	});

	it('ends collapsed, with the content gone', async () => {
		const c = mount();
		c.toggle().click();
		await wait(400);
		c.toggle().click();
		await wait(500);

		expect(c.height()).toBeLessThan(2);
		expect(c.region().textContent!.trim(), 'content should not linger').toBe('');
	});

	it('can be reopened after collapsing', async () => {
		const c = mount();
		c.toggle().click();
		await wait(400);
		c.toggle().click();
		await wait(500);
		c.toggle().click();
		await wait(400);

		expect(c.height()).toBeGreaterThan(10);
	});
});
