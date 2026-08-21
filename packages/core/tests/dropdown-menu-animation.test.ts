/**
 * `DropdownMenu`'s entire presentation subsystem was unreachable.
 *
 * `createInitialDropdownMenuState` sets `presentation: { status: 'idle' }`, and
 * `opened` / `closed` / `toggled` / `escape` / `itemSelected` touch only
 * `isOpen` — **no action ever wrote `presenting` or `dismissing`**. The only
 * dispatcher of `{ type: 'presentation' }` is the component's own `$effect`,
 * which can fire only in those two statuses. A closed loop with no entry point.
 *
 * Everything downstream was therefore dead: `animateDropdownIn` /
 * `animateDropdownOut` were never called from this component (the menu popped in
 * with no animation at all, against CLAUDE.md's "Motion One REQUIRED" for
 * dropdown lifecycle), the `style:opacity` gate on `presenting`, the
 * `|| status === 'dismissing'` arm keeping the menu mounted, the `presentation`
 * case in the reducer, and `DropdownMenuState.presentation` itself.
 *
 * `dependency-freshness.test.ts` even waited 450ms with the comment "The menu is
 * `opacity: 0` while presenting; wait past animateDropdownIn" — describing an
 * animation that never ran.
 *
 * These assertions are on the rendered menu and on real animations, never on
 * `presentation.status` alone: asserting the status would pass against a
 * reducer that sets it and a view that ignores it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DropdownMenuAnimationTest from './test-components/DropdownMenuAnimationTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(DropdownMenuAnimationTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		trigger: () => root.querySelector<HTMLElement>('[role="button"]')!,
		menu: () => root.querySelector<HTMLElement>('[role="menu"]'),
		items: () => [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[],
		picked: () => root.querySelector('[data-testid="picked"]')!.textContent!.trim()
	};
}

describe('the dropdown menu animates', () => {
	it('fades in rather than appearing instantly', async () => {
		const menu = mount();
		menu.trigger().click();
		await wait(20);

		const el = menu.menu();
		expect(el, 'the menu did not open').not.toBeNull();
		// Mid-flight the menu is partially transparent. With no animation it is
		// painted at full opacity on the very first frame.
		const opacity = Number.parseFloat(getComputedStyle(el!).opacity);
		expect(opacity, `menu opacity was ${opacity} — nothing animated it in`).toBeLessThan(1);
	});

	it('settles at full opacity', async () => {
		const menu = mount();
		menu.trigger().click();
		await wait(400);

		expect(Number.parseFloat(getComputedStyle(menu.menu()!).opacity)).toBe(1);
	});

	it('stays mounted while dismissing, then unmounts', async () => {
		const menu = mount();
		menu.trigger().click();
		await wait(400);

		menu.trigger().click();
		await wait(20);
		expect(menu.menu(), 'the menu vanished instead of animating out').not.toBeNull();

		await wait(500);
		expect(menu.menu(), 'the menu never finished dismissing').toBeNull();
	});

	it('selecting an item still runs its callback and closes', async () => {
		const menu = mount();
		menu.trigger().click();
		await wait(400);

		menu.items()[1]!.click();
		// `onSelect` is delivered through `Effect.run`, so it lands a microtask later.
		await wait(20);
		expect(menu.picked()).toBe('Beta');

		await wait(500);
		expect(menu.menu()).toBeNull();
	});

	it('reopens after a full close', async () => {
		// The lifecycle has to return to `idle`, or the second open is refused.
		const menu = mount();
		menu.trigger().click();
		await wait(400);
		menu.trigger().click();
		await wait(500);

		menu.trigger().click();
		await wait(400);
		expect(menu.menu(), 'the menu could not be reopened').not.toBeNull();
	});
});
