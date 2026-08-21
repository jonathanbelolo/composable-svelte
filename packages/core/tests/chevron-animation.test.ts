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
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Rotation in degrees, read off the live transform matrix. */
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
	it('starts unrotated', () => {
		const cb = mount();
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
