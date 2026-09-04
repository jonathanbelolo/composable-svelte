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
 * There are **five** close paths, not four — `closed`, `toggled`,
 * `optionSelected`, `enter` and `escape` are five separate reducer cases, and
 * the commit that converted them miscounted and then claimed all were covered
 * when three were. All five are converted and all five are exercised here,
 * because "I converted them all" is precisely the claim a test should carry
 * rather than a commit message.
 *
 * `closed` matters most of the five: it is the click-outside path, the most
 * common way anyone dismisses a select, and no test in the repo drove it through
 * the component before this one.
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
	const screen = render(Select, { options, ...props });
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

		// Paired, and it has to be. `style:opacity` hard-sets 0 for the whole
		// `presenting` phase, so `< 1` alone is satisfied by the *gate* rather than
		// by any animation: with the presenting branch emptied entirely — no
		// animation, no completion — the status sticks at `presenting`, opacity
		// stays 0, and a lone `< 1` passes while printing "nothing animated it in".
		// Verified by mutation. `> 0` is what proves something is actually moving.
		expect(opacity, `opacity stuck at ${opacity} — the animation never ran`).toBeGreaterThan(0);
		expect(opacity, `opacity was ${opacity} — it appeared instantly`).toBeLessThan(1);
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

	it('closes on an outside click', async () => {
		// The click-outside path (`closed`). `select.test.ts` sends this action to a
		// TestStore and asserts `isOpen` only, so the lifecycle half was untested.
		const s = mount();
		s.trigger().click();
		await wait(400);

		document.body.click();
		await wait(20);
		expect(s.list(), 'an outside click should animate out, not cut').not.toBeNull();

		await wait(500);
		expect(s.list()).toBeNull();
	});

	it('closes on Enter over a highlighted option', async () => {
		// The `enter` path — a separate reducer case from `optionSelected`, and the
		// one the commit's enumeration missed entirely.
		const s = mount();
		s.trigger().click();
		await wait(400);

		const key = (k: string) =>
			s.trigger().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		key('ArrowDown');
		await wait(20);
		key('Enter');
		await wait(20);

		expect(s.list(), 'Enter should animate out, not cut').not.toBeNull();
		await wait(500);
		expect(s.list()).toBeNull();
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
