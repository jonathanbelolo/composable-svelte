/**
 * An overlay that mounted already `presented` must still be dismissable.
 *
 * Every animation primitive guards its `$effect` against animating the same
 * thing twice. Five of them spelled that guard as `lastAnimatedContent !== null`
 * — "have I animated anything yet?" — which is a different question from "is
 * this a transition I have already run".
 *
 * The two only diverge when the component is mounted at `presented` without
 * having animated in. Then the collapse branch is refused, the `.then()` that
 * dispatches `dismissalCompleted` never runs, and the overlay is stuck in
 * `dismissing` **permanently**: the reducer's own guard
 * (`status !== 'presented' → no-op`) then rejects every further dismiss. No
 * error, no warning, an application-level deadlock.
 *
 * That state is not hypothetical. It is what SSR hydration produces for a page
 * rendered with an overlay open, and what a persistent desktop `Sidebar` looks
 * like at every mount — `SidebarDemo` in the styleguide starts `presented`, so
 * its very first close would have hung.
 *
 * Found while porting Sidebar to Motion One: I wrote the same guard, and the
 * mount-at-presented test caught it. These five are the siblings it was copied
 * from.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Component } from 'svelte';
import ModalTest from './test-components/ModalTest.svelte';
import SheetTest from './test-components/SheetTest.svelte';
import DrawerTest from './test-components/DrawerTest.svelte';
import AlertTest from './test-components/AlertTest.svelte';

function waitForState<State>(
	store: { subscribe: (listener: (state: State) => void) => () => void },
	condition: (state: State) => boolean,
	description: string,
	timeout = 3000
): Promise<State> {
	return new Promise((resolve, reject) => {
		let unsubscribe: (() => void) | null = null;
		const timeoutId = setTimeout(() => {
			unsubscribe?.();
			reject(new Error(`Timeout waiting for ${description} after ${timeout}ms`));
		}, timeout);
		unsubscribe = store.subscribe((state) => {
			if (condition(state)) {
				clearTimeout(timeoutId);
				unsubscribe?.();
				resolve(state);
			}
		});
	});
}

/**
 * All four harnesses take the same prop. Naming that common shape is what lets
 * `render` be called with real types: a union of four component types
 * intersects their props to `never`, which is why this used to say
 * `render(Component as never, …)` — and a `never` options bag accepts nothing,
 * so `startOpen: true` was unchecked.
 */
type OverlayHarness = Component<{ startOpen?: boolean }>;

const cases: ReadonlyArray<{
	name: string;
	Component: OverlayHarness;
	global: string;
	dismiss: string;
}> = [
	{ name: 'Modal', Component: ModalTest, global: '__modalTestStore', dismiss: 'dismissModal' },
	{ name: 'Sheet', Component: SheetTest, global: '__sheetTestStore', dismiss: 'dismissSheet' },
	{ name: 'Drawer', Component: DrawerTest, global: '__drawerTestStore', dismiss: 'dismissDrawer' },
	{ name: 'Alert', Component: AlertTest, global: '__alertTestStore', dismiss: 'dismissAlert' }
];

describe('an overlay hydrated in the open state', () => {
	it.each(cases)('$name dismisses', async ({ Component, global, dismiss }) => {
		render(Component, { startOpen: true });
		const store = (window as never as Record<string, any>)[global];

		expect(store.state.presentation.status, 'precondition: mounted presented').toBe('presented');

		store.dispatch({ type: dismiss });

		await waitForState(
			store,
			(s: any) => s.presentation.status === 'idle',
			`${global} to reach idle — it is stuck in dismissing, and the reducer's own ` +
				`guard now rejects every further dismiss, so this is permanent`
		);
	});
});
