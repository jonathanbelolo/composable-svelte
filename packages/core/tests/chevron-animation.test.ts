/**
 * A disclosure chevron must animate on the same timeline as what it discloses.
 *
 * Combobox and Select rotated their chevron with a Tailwind
 * `transition-transform` + `rotate-180`, while the dropdown beside it animated
 * through Motion One (`animateDropdownIn` / `animateDropdownOut`). Two
 * uncoordinated timelines for one gesture — precisely what
 * `guides/ANIMATION-GUIDELINES.md` says state-driven animation exists to
 * prevent ("Cannot be coordinated with other animations"), and its decision
 * tree routes anything that appears/disappears/expands to Motion One.
 *
 * It also made the rotation untestable: a CSS transition driven by a class
 * cannot be observed mid-flight without sampling computed styles and hoping.
 *
 * These assertions sample the real transform matrix, so they fail both if the
 * chevron never turns and if it snaps instantly.
 *
 * A note on what "did not move" means here, because it is sharper than it looks:
 * Tailwind is not compiled in this environment, so a class-driven `rotate-180`
 * has no CSS behind it and `getComputedStyle(...).transform` reads `none` —
 * measured. A chevron rotated by a utility class is therefore not merely
 * uncoordinated, it is **unobservable to any test in this repo**, which is a
 * large part of why the CSS version survived. Motion One writes inline styles,
 * so it is visible without a build step.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';
import ChevronTest from './test-components/ChevronTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Rotation in degrees, read off the live transform matrix. */
/**
 * Is the element positioned deliberately, or merely untransformed?
 *
 * `rotationOf` returns 0 for a real `rotate(0deg)` *and* for `transform: none`,
 * so "starts unrotated" could not tell a correctly-placed chevron from a
 * reverted, utility-class-driven one — Tailwind is not compiled here, so the
 * reverted state has no transform at all. This is the other half of the pair.
 */
function isPlaced(el: HTMLElement): boolean {
	const { transform } = getComputedStyle(el);
	return Boolean(transform) && transform !== 'none';
}

function rotationOf(el: HTMLElement): number {
	const { transform } = getComputedStyle(el);
	if (!transform || transform === 'none') return 0;
	const m = transform.match(/matrix\(([^)]+)\)/);
	if (!m) return 0;
	const [a, b] = m[1]!.split(',').map((n) => Number.parseFloat(n));
	return Math.round((Math.atan2(b!, a!) * 180) / Math.PI);
}

function mount() {
	const screen = render(Combobox, {
		props: {
			options: [
				{ value: 'a', label: 'Alpha' },
				{ value: 'b', label: 'Beta' }
			]
		}
	});
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		toggle: () => root.querySelector<HTMLButtonElement>('[aria-label="Toggle options"]')!,
		chevron: () => root.querySelector<HTMLElement>('[data-combobox-chevron]')!
	};
}

describe('the combobox chevron', () => {
	it('starts placed, and unrotated', () => {
		const cb = mount();
		expect(isPlaced(cb.chevron()), 'the chevron has no transform at all').toBe(true);
		expect(rotationOf(cb.chevron())).toBe(0);
	});

	it('animates rather than snapping', async () => {
		const cb = mount();
		cb.toggle().click();
		await wait(40);

		const mid = Math.abs(rotationOf(cb.chevron()));
		expect(mid, 'the chevron did not move').toBeGreaterThan(0);
		expect(mid, 'the chevron snapped straight to its end state').toBeLessThan(175);
	});

	it('settles pointing up', async () => {
		const cb = mount();
		cb.toggle().click();
		await wait(500);

		expect(Math.abs(rotationOf(cb.chevron()))).toBe(180);
	});

	it('returns when the dropdown closes', async () => {
		const cb = mount();
		cb.toggle().click();
		await wait(500);
		cb.toggle().click();
		await wait(600);

		expect(rotationOf(cb.chevron())).toBe(0);
	});
});

/**
 * The other three. `animateChevron` was written for exactly this family and
 * only Combobox was converted — this file's own header named Select and then
 * never rendered it.
 */
describe('the rest of the disclosure family', () => {
	function mountAll() {
		const screen = render(ChevronTest);
		cleanup.push(() => screen.unmount());
		const root = screen.container;
		const within = (host: string) =>
			root.querySelector(`[data-testid="${host}"]`) as HTMLElement;
		return {
			root,
			chevron: (host: string) => within(host).querySelector('svg') as SVGElement,
			trigger: (host: string) => within(host).querySelector('button') as HTMLButtonElement
		};
	}

	const cases = [
		{ name: 'accordion', host: 'accordion-host', settled: 180 },
		{ name: 'collapsible', host: 'collapsible-host', settled: 180 },
		{ name: 'select', host: 'select-host', settled: 180 }
	] as const;

	it.each(cases)('$name starts placed, and unrotated', ({ host }) => {
		const all = mountAll();
		const el = all.chevron(host) as unknown as HTMLElement;
		expect(isPlaced(el), 'the chevron has no transform at all').toBe(true);
		expect(rotationOf(el)).toBe(0);
	});

	it.each(cases)('$name animates rather than snapping', async ({ host }) => {
		const all = mountAll();
		all.trigger(host).click();
		await wait(40);

		const mid = Math.abs(rotationOf(all.chevron(host) as unknown as HTMLElement));
		expect(mid, 'the chevron did not move').toBeGreaterThan(0);
		expect(mid, 'the chevron snapped straight to its end state').toBeLessThan(175);
	});

	it.each(cases)('$name settles at its open angle', async ({ host, settled }) => {
		const all = mountAll();
		all.trigger(host).click();
		await wait(500);

		expect(Math.abs(rotationOf(all.chevron(host) as unknown as HTMLElement))).toBe(settled);
	});
});
