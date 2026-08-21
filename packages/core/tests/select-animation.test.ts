/**
 * `Select`'s dropdown had no animation at all — and a bound element proving it
 * was meant to.
 *
 * `dropdownElement` is bound at `Select.svelte:333` and **read by nothing**: a
 * dead binding, which is this campaign's own subject matter. It is exactly the
 * handle `animateDropdownIn` / `animateDropdownOut` need, and
 * `guides/ANIMATION-GUIDELINES.md` names Select explicitly under dropdown
 * lifecycle. Its sibling Combobox has animated for some time.
 *
 * Exiting needs more than a helper call: `{#if $store.isOpen}` unmounts the list
 * on the same tick the state changes, so there is nothing left to animate out.
 * The fix follows `DropdownMenu`, converted earlier in this campaign — `isOpen`
 * still flips immediately because it backs `aria-expanded`, and the markup keeps
 * the node mounted on `presentation.status` instead.
 *
 * All four close paths are covered here, because they are four separate reducer
 * cases and it would be easy to convert one: `closed`, `escape`,
 * `optionSelected` (single), and `toggled`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Select from '../src/lib/components/ui/select/Select.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const options = [
	{ value: 'apple', label: 'Apple' },
	{ value: 'banana', label: 'Banana' }
];

function mount(props: Record<string, unknown> = {}) {
	const screen = render(Select, { props: { options, ...props } });
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		trigger: () => root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!,
		list: () => root.querySelector<HTMLElement>('[role="listbox"]'),
		optionEls: () => [...root.querySelectorAll<HTMLElement>('[role="option"]')]
	};
}

describe('the select dropdown', () => {
	it('fades in rather than appearing instantly', async () => {
		const s = mount();
		s.trigger().click();
		await wait(20);

		const el = s.list();
		expect(el, 'the dropdown did not open').not.toBeNull();
		const opacity = Number.parseFloat(getComputedStyle(el!).opacity);
		expect(opacity, `opacity was ${opacity} — nothing animated it in`).toBeLessThan(1);
	});

	it('settles fully opaque', async () => {
		const s = mount();
		s.trigger().click();
		await wait(400);

		expect(Number.parseFloat(getComputedStyle(s.list()!).opacity)).toBe(1);
	});

	it('stays mounted while dismissing, then unmounts', async () => {
		const s = mount();
		s.trigger().click();
		await wait(400);

		s.trigger().click();
		await wait(20);
		expect(s.list(), 'the dropdown vanished instead of animating out').not.toBeNull();

		await wait(500);
		expect(s.list(), 'the dropdown never finished dismissing').toBeNull();
	});

	it('closes on Escape', async () => {
		const s = mount();
		s.trigger().click();
		await wait(400);

		s.trigger().dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		await wait(20);
		expect(s.list(), 'escape should animate out, not cut').not.toBeNull();

		await wait(500);
		expect(s.list()).toBeNull();
	});

	it('closes when an option is chosen', async () => {
		const s = mount();
		s.trigger().click();
		await wait(400);

		s.optionEls()[1]!.click();
		await wait(20);
		expect(s.list(), 'selecting should animate out, not cut').not.toBeNull();

		await wait(500);
		expect(s.list()).toBeNull();
		expect(s.trigger().textContent).toContain('Banana');
	});

	it('reopens after a full close', async () => {
		const s = mount();
		s.trigger().click();
		await wait(400);
		s.trigger().click();
		await wait(500);

		s.trigger().click();
		await wait(400);
		expect(s.list(), 'the dropdown could not be reopened').not.toBeNull();
	});
});
