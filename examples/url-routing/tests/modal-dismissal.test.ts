/**
 * Both modals must close on Escape.
 *
 * Neither did. `ItemDetail.svelte` and `AddItemModal.svelte` each rendered a
 * bare `<div class="backdrop" onclick={onClose}>` and nothing else — no Escape
 * handler, no keydown, anywhere in either file. A keyboard user who opened
 * either one was stuck: the only ways out were a mouse click on the backdrop or
 * on the ✕ button.
 *
 * svelte-check reported this the whole time, as two a11y warnings per file. They
 * read like lint noise about a backdrop; they were pointing at a modal with no
 * keyboard exit.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ItemDetail from '../src/components/ItemDetail.svelte';
import AddItemModal from '../src/components/AddItemModal.svelte';
import type { InventoryItem } from '../src/types';

const item: InventoryItem = {
	id: 'widget-1',
	name: 'Widget',
	category: 'Tools',
	quantity: 3,
	price: 9.99
};

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountModal(Component: any, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component, { target, props });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

function pressEscape() {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	flushSync();
}

describe('modal dismissal', () => {
	it('ItemDetail closes on Escape', () => {
		let closed = 0;
		mountModal(ItemDetail, { item, onClose: () => (closed += 1), onDelete: () => {} });

		pressEscape();

		expect(closed, 'Escape did not close ItemDetail').toBe(1);
	});

	it('AddItemModal closes on Escape', () => {
		let closed = 0;
		mountModal(AddItemModal, { onClose: () => (closed += 1), onAdd: () => {} });

		pressEscape();

		expect(closed, 'Escape did not close AddItemModal').toBe(1);
	});

	it('ignores other keys', () => {
		let closed = 0;
		mountModal(ItemDetail, { item, onClose: () => (closed += 1), onDelete: () => {} });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		flushSync();

		expect(closed).toBe(0);
	});

	it('the backdrop still closes on click, and is hidden from assistive tech', () => {
		let closed = 0;
		const target = mountModal(ItemDetail, {
			item,
			onClose: () => (closed += 1),
			onDelete: () => {}
		});

		const backdrop = target.querySelector<HTMLElement>('.backdrop');
		expect(backdrop).not.toBeNull();
		// Escape and the ✕ button are the real affordances, so the backdrop being
		// a mouse-only shortcut is fine — but only once it is hidden from AT.
		expect(backdrop!.getAttribute('aria-hidden')).toBe('true');

		backdrop!.click();
		flushSync();
		expect(closed).toBe(1);
	});
});
