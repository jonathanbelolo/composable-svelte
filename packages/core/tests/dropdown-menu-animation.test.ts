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

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DropdownMenuAnimationTest from './test-components/DropdownMenuAnimationTest.svelte';
import { assertMotionAllowed, midFlight, nextFrame, scrubAnimations, settleAnimations, settleValue, waitForAnimations, waitForStyle, waitUntil } from '../src/lib/test/animation.js';

beforeAll(() => assertMotionAllowed());

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

type Mounted = ReturnType<typeof mount>;

async function open(m: Mounted): Promise<HTMLElement> {
	m.trigger().click();
	const el = await waitUntil(() => m.menu(), (e) => e !== null, { what: 'the menu to mount' });
	await waitForAnimations(el!);
	await settleAnimations(el!);
	await waitForStyle(el!, 'opacity', (v) => v === '1');
	return el!;
}

async function expectAnimatedOut(m: Mounted, what: string): Promise<void> {
	const el = m.menu();
	expect(el, `${what}: the menu vanished instead of animating out`).not.toBeNull();
	await waitForAnimations(el!, { what: `${what}: the exit animation` });
	expect(m.menu(), `${what}: the menu vanished instead of animating out`).not.toBeNull();
	await settleAnimations(el!);
	await waitUntil(() => m.menu(), (e) => e === null, { what: `${what}: the menu to unmount` });
}

describe('the dropdown menu animates', () => {
	it('fades in rather than appearing instantly', async () => {
		const menu = mount();
		menu.trigger().click();

		const el = await waitUntil(() => menu.menu(), (e) => e !== null, { what: 'the menu to mount' });
		// Mid-flight the menu is partially transparent. With no animation there is
		// nothing to scrub and waitForAnimations says so.
		await waitForAnimations(el!);
		const restore = scrubAnimations(el!, 0.5);
		const opacity = Number.parseFloat(getComputedStyle(el!).opacity);
		restore();
		expect(opacity, `menu opacity was ${opacity} — nothing animated it in`).toBeGreaterThan(0);
		expect(opacity, `menu opacity was ${opacity} — nothing animated it in`).toBeLessThan(1);
	});

	it('settles at full opacity', async () => {
		const menu = mount();
		const el = await open(menu);

		expect(Number.parseFloat(getComputedStyle(el).opacity)).toBe(1);
	});

	it('stays mounted while dismissing, then unmounts', async () => {
		const menu = mount();
		await open(menu);

		menu.trigger().click();
		await expectAnimatedOut(menu, 'toggle');
	});

	it('selecting an item still runs its callback and closes', async () => {
		const menu = mount();
		await open(menu);

		menu.items()[1]!.click();
		// `onSelect` is delivered through `Effect.run`, so it lands a microtask later.
		await waitUntil(() => menu.picked(), (p) => p === 'Beta', { what: 'the callback' });
		await expectAnimatedOut(menu, 'selecting');
	});

	it('reopens after a full close', async () => {
		// The lifecycle has to return to `idle`, or the second open is refused.
		const menu = mount();
		await open(menu);
		menu.trigger().click();
		await expectAnimatedOut(menu, 'toggle');

		await open(menu);
		expect(menu.menu(), 'the menu could not be reopened').not.toBeNull();
	});
});
