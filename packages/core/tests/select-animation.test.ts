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

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Select from '../src/lib/components/ui/select/Select.svelte';
import { assertMotionAllowed, midFlight, nextFrame, scrubAnimations, settleAnimations, settleValue, waitForAnimations, waitForStyle, waitUntil } from '../src/lib/test/animation.js';

// Mid-flight samples below are scrubbed, not timed: the R1 review reproduced
// this file failing on a loaded runner when a fixed 20 ms landed after the
// fade had finished (R1-REVIEW 2.1).
beforeAll(() => assertMotionAllowed());

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

type Mounted = ReturnType<typeof mount>;

/** Open the dropdown and let its entrance settle. */
async function open(s: Mounted): Promise<HTMLElement> {
	s.trigger().click();
	const el = await waitUntil(() => s.list(), (l) => l !== null, { what: 'the listbox to mount' });
	await waitForAnimations(el!);
	await settleAnimations(el!);
	await waitForStyle(el!, 'opacity', (v) => v === '1');
	return el!;
}

/** After a close path: still mounted while the exit runs, then gone. */
async function expectAnimatedOut(s: Mounted, what: string): Promise<void> {
	const el = s.list();
	expect(el, `${what}: the dropdown vanished instead of animating out`).not.toBeNull();
	await waitForAnimations(el!, { what: `${what}: the exit animation` });
	expect(s.list(), `${what}: the dropdown vanished instead of animating out`).not.toBeNull();
	await settleAnimations(el!);
	await waitUntil(() => s.list(), (l) => l === null, { what: `${what}: the dropdown to unmount` });
}

describe('the select dropdown', () => {
	it('fades in rather than appearing instantly', async () => {
		const s = mount();
		s.trigger().click();

		const el = await waitUntil(() => s.list(), (l) => l !== null, { what: 'the listbox to mount' });
		await waitForAnimations(el!);
		const restore = scrubAnimations(el!, 0.5);
		const opacity = Number.parseFloat(getComputedStyle(el!).opacity);
		restore();

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
		const el = await open(s);

		expect(Number.parseFloat(getComputedStyle(el).opacity)).toBe(1);
	});

	it('stays mounted while dismissing, then unmounts', async () => {
		const s = mount();
		await open(s);

		s.trigger().click();
		await expectAnimatedOut(s, 'toggle');
	});

	it('closes on Escape', async () => {
		const s = mount();
		await open(s);

		s.trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expectAnimatedOut(s, 'escape');
	});

	it('closes when an option is chosen', async () => {
		const s = mount();
		await open(s);

		s.optionEls()[1]!.click();
		await expectAnimatedOut(s, 'selecting');
		expect(s.trigger().textContent).toContain('Banana');
	});

	it('closes on an outside click', async () => {
		// The click-outside path (`closed`). `select.test.ts` sends this action to a
		// TestStore and asserts `isOpen` only, so the lifecycle half was untested.
		const s = mount();
		await open(s);

		document.body.click();
		await expectAnimatedOut(s, 'an outside click');
	});

	it('closes on Enter over a highlighted option', async () => {
		// The `enter` path — a separate reducer case from `optionSelected`, and the
		// one the commit's enumeration missed entirely.
		const s = mount();
		await open(s);

		const key = (k: string) =>
			s.trigger().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		key('ArrowDown');
		key('Enter');
		await expectAnimatedOut(s, 'Enter');
	});

	it('reopens after a full close', async () => {
		const s = mount();
		await open(s);
		s.trigger().click();
		await expectAnimatedOut(s, 'toggle');

		await open(s);
		expect(s.list(), 'the dropdown could not be reopened').not.toBeNull();
	});
});
