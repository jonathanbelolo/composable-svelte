import { afterEach, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ControlDismissalLayers from './fixtures/ControlDismissalLayers.svelte';

const releases: Array<() => Promise<void>> = [];
// Coordinator pointer callbacks are queued before this barrier.
const pointerSettled = () => new Promise<void>(resolve => setTimeout(resolve, 0));
afterEach(async () => {
	for (const release of releases.splice(0).reverse()) await release();
});

function key() {
	const target = (document.activeElement as HTMLElement) || document;
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		})
	);
	flushSync();
}

function getTriggerOrNull(control: 'dropdown' | 'select' | 'combobox'): HTMLElement | null {
	if (control === 'dropdown') {
		return document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
	}
	if (control === 'select') {
		return document.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
	}
	return document.querySelector<HTMLInputElement>('input[role="combobox"]');
}

function getTrigger(control: 'dropdown' | 'select' | 'combobox'): HTMLElement {
	const el = getTriggerOrNull(control);
	if (!el) throw new Error(`Trigger for ${control} not found`);
	return el;
}

function getPopup(control: 'dropdown' | 'select' | 'combobox'): HTMLElement | null {
	if (control === 'dropdown') {
		return document.querySelector<HTMLElement>('[role="menu"]');
	}
	return document.querySelector<HTMLElement>('[role="listbox"]');
}

function getItem(control: 'dropdown' | 'select' | 'combobox'): HTMLElement | null {
	if (control === 'dropdown') {
		return document.querySelector<HTMLElement>('[role="menuitem"]');
	}
	return document.querySelector<HTMLElement>('[role="option"]');
}

function openControl(control: 'dropdown' | 'select' | 'combobox') {
	const trigger = getTrigger(control);
	trigger.focus();
	trigger.click();
	flushSync();
}

function setup(control: 'dropdown' | 'select' | 'combobox') {
	const target = document.createElement('div');
	document.body.append(target);
	const requests = vi.fn();
	const app = mount(ControlDismissalLayers, {
		target,
		props: { control, requests }
	});
	flushSync();
	let unmounted = false;
	const cleanup = async () => {
		if (!unmounted) {
			unmounted = true;
			await unmount(app);
		}
		target.remove();
	};
	releases.push(cleanup);
	return { app, requests, target, unmountApp: cleanup };
}

it.each(['dropdown', 'select', 'combobox'] as const)(
	'%s: Escape closes only child and shields parent while child retained exit visible',
	async (control) => {
		const { requests } = setup(control);
		openControl(control);

		expect(getPopup(control)).not.toBeNull();
		expect(getTrigger(control).getAttribute('aria-expanded')).toBe('true');

		// First Escape closes the child control
		key();
		expect(requests).not.toHaveBeenCalled();
		expect(getPopup(control)).not.toBeNull();

		// Second Escape while child retained exit is still visible continues shielding parent
		key();
		expect(requests).not.toHaveBeenCalled();

		// Wait for child dismissal animation and unmount
		await vi.waitFor(() => {
			expect(getPopup(control)).toBeNull();
		});

		// Once child is fully unmounted, parent Escape authority is restored
		key();
		expect(requests.mock.calls).toEqual([['parent']]);
	}
);

it.each(['dropdown', 'select', 'combobox'] as const)(
	'%s: outside pointer requests child and never parent',
	async (control) => {
		const { requests } = setup(control);
		openControl(control);

		expect(getPopup(control)).not.toBeNull();

		// Real pointerdown outside requests child dismissal, never parent
		document.body.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);

		await vi.waitFor(() => {
			expect(getPopup(control)).toBeNull();
		});
		expect(requests).not.toHaveBeenCalled();

		// Positive control for parent outside pointerdown once child is closed
		document.body.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);

		await vi.waitFor(() => {
			expect(requests.mock.calls).toEqual([['parent']]);
		});
	}
);

it.each(['dropdown', 'select', 'combobox'] as const)(
	'%s: inside input/trigger/menu does not dismiss parent',
	async (control) => {
		const { requests } = setup(control);
		const trigger = getTrigger(control);

		// Pointerdown on trigger/input does not dismiss parent
		trigger.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);
		flushSync();
		await pointerSettled();
		expect(requests).not.toHaveBeenCalled();

		openControl(control);
		expect(getPopup(control)).not.toBeNull();

		// Pointerdown inside popup container does not dismiss parent
		const popup = getPopup(control)!;
		popup.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);
		flushSync();
		await pointerSettled();
		expect(requests).not.toHaveBeenCalled();
		expect(getPopup(control)).not.toBeNull();

		// Pointerdown inside menu/listbox item does not dismiss parent
		const item = getItem(control)!;
		item.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);
		flushSync();
		await pointerSettled();
		expect(requests).not.toHaveBeenCalled();
		expect(getPopup(control)).not.toBeNull();

		// Pointerdown on modal content outside child control does not dismiss parent
		const insideModal = document.querySelector<HTMLElement>('[data-modal-inside]')!;
		insideModal.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);
		flushSync();
		await vi.waitFor(() => expect(getPopup(control)).toBeNull());
		expect(requests).not.toHaveBeenCalled();
	}
);

it.each(['dropdown', 'select', 'combobox'] as const)(
	'%s: unmount child restores parent Escape authority',
	async (control) => {
		const { app, requests } = setup(control);
		expect(getTriggerOrNull(control)).not.toBeNull();
		openControl(control);
		expect(getPopup(control)).not.toBeNull();
		document.body.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true}));

		app.unmountChild();
		flushSync();
		await pointerSettled();
		expect(requests).not.toHaveBeenCalled();
		expect(getTriggerOrNull(control)).toBeNull();

		key();
		expect(requests.mock.calls).toEqual([['parent']]);
	}
);

it.each(['dropdown', 'select', 'combobox'] as const)(
	'%s: no global listeners survive full unmount',
	async (control) => {
		const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

		const { requests, unmountApp } = setup(control);
		openControl(control);
		expect(getPopup(control)).not.toBeNull();

		await unmountApp();
		flushSync();

		const pointerdownAdds = addEventListenerSpy.mock.calls.filter(([event]) => event === 'pointerdown');
		const keydownAdds = addEventListenerSpy.mock.calls.filter(([event]) => event === 'keydown');
		const pointerdownRemoves = removeEventListenerSpy.mock.calls.filter(([event]) => event === 'pointerdown');
		const keydownRemoves = removeEventListenerSpy.mock.calls.filter(([event]) => event === 'keydown');

		expect(pointerdownAdds.length).toBeGreaterThan(0);
		expect(keydownAdds.length).toBeGreaterThan(0);
		expect(pointerdownRemoves.length).toBe(pointerdownAdds.length);
		expect(keydownRemoves.length).toBe(keydownAdds.length);
		for (const [name, listener, options] of [...pointerdownAdds, ...keydownAdds]) {
			const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
			expect(removeEventListenerSpy.mock.calls.filter(([removedName, removedListener, removedOptions]) =>
				removedName === name && removedListener === listener &&
				(typeof removedOptions === 'boolean' ? removedOptions : removedOptions?.capture ?? false) === capture
			)).toHaveLength(1);
		}

		key();
		document.body.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				bubbles: true,
				cancelable: true
			})
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(requests).not.toHaveBeenCalled();

		addEventListenerSpy.mockRestore();
		removeEventListenerSpy.mockRestore();
	}
);
