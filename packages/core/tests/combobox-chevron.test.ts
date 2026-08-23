/**
 * The Combobox chevron was a dead click zone over the control.
 *
 * `Combobox.svelte`'s icon strip is `absolute inset-y-0 right-0` with no
 * `pointer-events: none`, so it intercepts clicks on the input's right edge —
 * exactly where a user clicks to open a combobox. The chevron inside it is a
 * bare `<svg>` with no handler, and it rotates with `$store.dropdown.status`,
 * so it *looks* like the control while doing nothing. Clicking it did not open
 * the dropdown, and it stopped the input underneath from being clicked either.
 *
 * The `toggled` action existed and nothing dispatched it. This is where it
 * belongs.
 *
 * Assertions are on the rendered dropdown, not on store state — the store was
 * never the problem.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const options = [
	{ value: '1', label: 'Apple' },
	{ value: '2', label: 'Banana' }
];

const listbox = () => document.querySelector('[role="listbox"]');
const chevron = () => document.querySelector<HTMLButtonElement>('[aria-label="Toggle options"]');

describe('the chevron', () => {
	it('opens the dropdown', async () => {
		render(Combobox, { options });
		await settle();
		expect(listbox(), 'precondition: closed').toBeNull();

		expect(chevron(), 'the chevron is not a control at all').not.toBeNull();
		chevron()!.click();
		await settle(400);

		expect(listbox(), 'clicking the chevron did nothing').not.toBeNull();
	});

	it('closes it again', async () => {
		// The round trip, not just the open — `toggled` has to do both, and a
		// fix that dispatched `opened` would pass the first test alone.
		render(Combobox, { options });
		await settle();
		chevron()!.click();
		await settle(400);
		expect(listbox()).not.toBeNull();

		chevron()!.click();
		// Past the closing animation, which `closingCompleted` ends.
		await settle(500);

		expect(listbox(), 'the chevron could open but not close').toBeNull();
	});

	it('leaves the clear button working', async () => {
		// The icon strip also holds "Clear selection". Making the strip
		// click-through must not take that with it.
		const onchange = vi.fn();
		render(Combobox, { options, value: '1', onchange });
		await settle(300);

		const clear = document.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]');
		expect(clear, 'no clear button for a selected value').not.toBeNull();
		clear!.click();
		await settle(300);

		expect(onchange, 'the clear button stopped working').toHaveBeenCalledWith(null);
	});

	it('does not block clicks on the input beneath it', async () => {
		// The strip covered the input's right edge. Even with the chevron wired,
		// leaving it opaque would keep swallowing clicks aimed at the field.
		render(Combobox, { options });
		await settle();

		const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
		const box = input.getBoundingClientRect();
		// A point inside the input, under the icon strip.
		const x = box.right - 6;
		const y = box.top + box.height / 2;
		const hit = document.elementFromPoint(x, y);

		expect(
			hit === input || input.contains(hit) || hit?.closest('[aria-label="Toggle options"]'),
			`the icon strip swallowed the click: hit <${hit?.tagName.toLowerCase()}>`
		).toBeTruthy();
	});
});
