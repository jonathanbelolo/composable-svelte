/**
 * `Select` rendered a `<button>` (clear) inside a `<button>` (trigger).
 *
 * That is invalid HTML. Svelte builds the client DOM with createElement, so the
 * nesting survives in a client-only render — but the HTML parser does not allow
 * it. A `<button>` start tag while a button is in scope implicitly closes the
 * open one, so in a server-rendered page the browser reparents the clear button
 * (and the chevron next to it) out of the trigger. Hydration then walks a tree
 * that does not match what the server sent.
 *
 * `Select` had 33 reducer tests and no rendering test, so nothing pinned its
 * markup. These do. The clear button also had no accessible name — its only
 * content is a decorative SVG.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import Select from '../src/lib/components/ui/select/Select.svelte';
import type { SelectOption } from '../src/lib/components/ui/select/select.types.js';

const options: SelectOption[] = [
	{ value: 'apple', label: 'Apple' },
	{ value: 'banana', label: 'Banana' },
	{ value: 'cherry', label: 'Cherry' }
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** The trigger is the only element carrying aria-haspopup="listbox". */
const triggerOf = (container: HTMLElement) =>
	container.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]');

describe('Select markup', () => {
	it('does not nest the clear button inside the trigger', async () => {
		// A value is required: the clear button only renders when something is
		// selected, so without one this would pass vacuously.
		const { container } = render(Select, { props: { options, value: 'apple' } });
		await settle();

		const trigger = triggerOf(container);
		expect(trigger, 'trigger should render').not.toBeNull();
		expect(
			trigger!.querySelector('button'),
			'the trigger must not contain another button — invalid HTML, and the parser ' +
				'reparents it, which breaks hydration'
		).toBeNull();
	});

	it('renders the clear button as a sibling of the trigger', async () => {
		const { container } = render(Select, { props: { options, value: 'apple' } });
		await settle();

		const buttons = [...container.querySelectorAll('button')];
		expect(buttons.length, 'expected a trigger and a clear button').toBe(2);

		const [trigger, clear] = buttons;
		expect(trigger!.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger!.contains(clear!), 'clear must not be inside the trigger').toBe(false);
		expect(
			clear!.closest('[aria-haspopup="listbox"]'),
			'clear must have no trigger ancestor at any depth'
		).toBeNull();
	});

	it('gives the clear button an accessible name', async () => {
		const { container } = render(Select, { props: { options, value: 'apple' } });
		await settle();

		const clear = [...container.querySelectorAll('button')].find(
			(b) => b.getAttribute('aria-haspopup') !== 'listbox'
		);
		expect(clear, 'clear button should render when a value is selected').toBeDefined();

		const name = clear!.getAttribute('aria-label') ?? clear!.textContent?.trim();
		expect(name, 'an icon-only button announces as an unlabelled "button"').toBeTruthy();
	});

	it('renders no clear button when disabled', async () => {
		const { container } = render(Select, {
			props: { options, value: 'apple', disabled: true }
		});
		await settle();

		expect(container.querySelectorAll('button').length).toBe(1);
	});

	it('clearing empties the selection without opening the dropdown', async () => {
		const { container } = render(Select, {
			props: { options, value: 'apple', placeholder: 'Pick one' }
		});
		await settle();

		const clear = [...container.querySelectorAll('button')].find(
			(b) => b.getAttribute('aria-haspopup') !== 'listbox'
		);
		await userEvent.click(clear!);
		await settle();

		expect(triggerOf(container)!.textContent).toContain('Pick one');
		expect(
			container.querySelector('[role="listbox"]'),
			'clearing should not open the dropdown'
		).toBeNull();
	});

	it('opens the dropdown when the trigger itself is clicked', async () => {
		const { container } = render(Select, { props: { options, value: 'apple' } });
		await settle();

		await userEvent.click(triggerOf(container)!);
		await settle();

		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
	});
});
