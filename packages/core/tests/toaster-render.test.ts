/**
 * `Toaster` could not display anything a consumer controlled.
 *
 * It rendered `externalToasts ?? $store.toasts`; the only dispatch any rendered
 * element could produce was `toastDismissed`; and that case returns early for
 * any toast not in the internal store. Prop-supplied toasts never entered it,
 * and nothing could put one in — no `store` prop, no context, no export. So
 * `dependencies` was unreachable rather than mis-wired, and the dismiss button
 * on a prop-supplied toast did nothing.
 *
 * These tests drive the component the way a consumer now can: build a store
 * with `createToastStore`, hand it over, and assert on the rendered DOM.
 * Nothing here asserts store state alone — the store was always correct; the
 * component was what could not be reached.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Toaster from '../src/lib/components/toast/Toaster.svelte';
import { createToastStore } from '../src/lib/components/toast/index.js';

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const toasts = () => [...document.querySelectorAll('[role="alert"]')];

describe('a consumer-owned store', () => {
	it('renders a toast dispatched into it', async () => {
		const store = createToastStore();
		render(Toaster, { store });
		await settle();
		expect(toasts()).toHaveLength(0);

		store.dispatch({ type: 'toastAdded', toast: { variant: 'success', description: 'Saved!' } });
		await settle();

		expect(toasts(), 'the toast never rendered').toHaveLength(1);
		expect(toasts()[0]!.textContent).toContain('Saved!');
	});

	it('dismisses it when the close button is clicked', async () => {
		// The half that was provably dead: `toastDismissed` returned early for
		// any toast not in the store, and prop-supplied toasts never were.
		const store = createToastStore();
		render(Toaster, { store });
		store.dispatch({ type: 'toastAdded', toast: { variant: 'info', description: 'Hello' } });
		await settle();
		expect(toasts()).toHaveLength(1);

		const dismiss = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]');
		expect(dismiss, 'no dismiss button').not.toBeNull();
		dismiss!.click();
		await settle(700);

		expect(toasts(), 'the toast survived its own dismiss button').toHaveLength(0);
	});

	it('fires the dependencies', async () => {
		// All three were unreachable: nothing could put a toast into the store
		// they were attached to.
		const onToastAdded = vi.fn();
		const onToastDismissed = vi.fn();
		const store = createToastStore({ dependencies: { onToastAdded, onToastDismissed } });
		render(Toaster, { store });

		store.dispatch({ type: 'toastAdded', toast: { variant: 'info', description: 'x' } });
		await settle();
		expect(onToastAdded, 'onToastAdded never fired').toHaveBeenCalledTimes(1);

		document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click();
		await settle(700);
		expect(onToastDismissed, 'onToastDismissed never fired').toHaveBeenCalledTimes(1);
	});
});

describe('position', () => {
	it('follows the store, not a frozen prop', async () => {
		// `ToastState.position` was written by `positionChanged` and read by
		// nothing — the container was classed from the component's own prop.
		const store = createToastStore({ position: 'top-left' });
		const { container } = render(Toaster, { store });
		store.dispatch({ type: 'toastAdded', toast: { variant: 'info', description: 'x' } });
		await settle();

		const box = () => container.querySelector('div[class*="fixed"]');
		expect(box()?.className).toContain('top-0');

		store.dispatch({ type: 'positionChanged', position: 'bottom-right' });
		await settle();

		expect(
			box()?.className,
			'positionChanged updated state nothing rendered from'
		).toContain('bottom-0');
	});
});

describe('the action button', () => {
	it('goes through the reducer rather than round it', async () => {
		// `Toast.svelte` called `toast.action.onClick()` locally and then
		// dismissed. Observationally identical today, but it made "acted on it"
		// and "discarded it" indistinguishable in the action history and to
		// `onToastDismissed`. The reducer owns what an action means.
		const onClick = vi.fn();
		const store = createToastStore();
		const seen: string[] = [];
		store.subscribeToActions?.((action) => seen.push(action.type));

		render(Toaster, { store });
		store.dispatch({
			type: 'toastAdded',
			toast: { variant: 'info', description: 'Undo?', action: { label: 'Undo', onClick } }
		});
		await settle();

		const actionButton = [...document.querySelectorAll('button')].find(
			(b) => b.textContent?.trim() === 'Undo'
		);
		expect(actionButton, 'no action button').toBeDefined();
		actionButton!.click();
		await settle(700);

		expect(onClick, 'the callback did not run').toHaveBeenCalledTimes(1);
		expect(
			seen,
			'the click bypassed the reducer — history cannot tell it from a plain dismiss'
		).toContain('toastActionClicked');
	});
});

describe('the exit animation', () => {
	it('runs before the toast is removed', async () => {
		// `animateToastOut` exists, is exported, and had no caller — toasts
		// popped out of existence. CLAUDE.md lists toast animations under the
		// Motion One REQUIRED set.
		const store = createToastStore();
		render(Toaster, { store });
		store.dispatch({ type: 'toastAdded', toast: { variant: 'info', description: 'x' } });
		await settle(400);

		const el = toasts()[0]! as HTMLElement;
		expect(Number(getComputedStyle(el).opacity), 'precondition: fully visible').toBeCloseTo(1, 1);

		document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click();
		await settle(80);

		// Asserted on the rendered OPACITY, which is what `animateToastOut`
		// actually drives (`opacity: [1, 0]`, `scale: [1, 0.95]`).
		// `getAnimations()` was useless here and I checked rather than assumed:
		// with and without the call it reported an identical
		// `before=1 after=["Animation:-"]`, because the animate-in animation is
		// still attached. Counting animations proves nothing; the pixels do.
		expect(
			Number(getComputedStyle(el).opacity),
			'the toast vanished with no exit animation'
		).toBeLessThan(0.95);
		expect(toasts(), 'it was removed before animating').toHaveLength(1);

		await settle(800);
		expect(toasts()).toHaveLength(0);
	});
});
