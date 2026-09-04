/**
 * The form controls, none of which any test had ever rendered.
 *
 * `Input`, `Textarea`, `Checkbox`, `Radio`, `RadioGroup`, `Slider`, `Label`,
 * `Progress`, `IconButton`, `ButtonGroup` — the interactive half of the
 * component library, and the half where a defect is silent rather than visible.
 * A `Card` that renders wrong is obvious on the page. A `Checkbox` whose
 * `indeterminate` never reaches the DOM, or a `Label` whose `for` does not match
 * its input, looks correct and simply does not work for anyone using a screen
 * reader or clicking the label.
 *
 * These are behaviour tests rather than the smoke suite in
 * `presentational-atoms.test.ts`: what reaches the DOM, what state the element
 * ends up in, and whether the accessibility wiring is real.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Snippet } from 'svelte';
import { createRawSnippet } from 'svelte';

import Input from '../src/lib/components/ui/input/Input.svelte';
import Textarea from '../src/lib/components/ui/textarea/Textarea.svelte';
import Checkbox from '../src/lib/components/ui/checkbox/Checkbox.svelte';
import Label from '../src/lib/components/ui/label/Label.svelte';
import Progress from '../src/lib/components/ui/progress/Progress.svelte';
import IconButton from '../src/lib/components/ui/icon-button/IconButton.svelte';
import ButtonGroup from '../src/lib/components/ui/button-group/ButtonGroup.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const emptyChildren = (() => {}) as unknown as Snippet;
const textChildren = createRawSnippet(() => ({ render: () => '<span>label text</span>' }));

async function mountIn(component: unknown, props: Record<string, unknown>) {
	const { container } = render(component as never, props as never);
	await settle();
	return container;
}

describe('Input', () => {
	it('renders an input carrying its value', async () => {
		const container = await mountIn(Input, { value: 'hello' });
		const input = container.querySelector('input');
		expect(input, 'Input rendered no <input>').not.toBeNull();
		expect(input!.value).toBe('hello');
	});

	it('applies the requested type', async () => {
		const container = await mountIn(Input, { type: 'password' });
		expect(container.querySelector('input')!.getAttribute('type')).toBe('password');
	});

	it('defaults to text rather than leaving the type unset', async () => {
		// An input with no type is a text input, but a *missing* attribute and an
		// explicit one differ for anything reading the DOM, including tests.
		const container = await mountIn(Input, {});
		expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
	});

	it('disables the element, not just its styling', async () => {
		const container = await mountIn(Input, { disabled: true });
		expect(container.querySelector('input')!.disabled).toBe(true);
	});

	it('announces an error state', async () => {
		// `error` must reach assistive technology, not only the border colour.
		const container = await mountIn(Input, { error: true });
		const input = container.querySelector('input')!;
		expect(input.getAttribute('aria-invalid')).toBe('true');
	});

	it('is not aria-invalid by default', async () => {
		// Non-vacuity for the arm above.
		const container = await mountIn(Input, {});
		expect(container.querySelector('input')!.getAttribute('aria-invalid')).not.toBe('true');
	});

	it('points at the message describing it', async () => {
		const container = await mountIn(Input, { error: true, errorId: 'email-error' });
		expect(container.querySelector('input')!.getAttribute('aria-describedby')).toContain(
			'email-error'
		);
	});

	it('dispatches its action on input', async () => {
		const dispatched: unknown[] = [];
		const container = await mountIn(Input, {
			action: (v: string) => ({ type: 'changed', value: v }),
			dispatch: (a: unknown) => dispatched.push(a)
		});

		const input = container.querySelector('input')!;
		input.value = 'typed';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();

		expect(dispatched.length).toBeGreaterThan(0);
	});
});

describe('Textarea', () => {
	it('renders a textarea carrying its value', async () => {
		const container = await mountIn(Textarea, { value: 'some text' });
		const textarea = container.querySelector('textarea');
		expect(textarea, 'Textarea rendered no <textarea>').not.toBeNull();
		expect(textarea!.value).toBe('some text');
	});

	it('applies rows and placeholder', async () => {
		const container = await mountIn(Textarea, { rows: 7, placeholder: 'Say something' });
		const textarea = container.querySelector('textarea')!;
		expect(textarea.getAttribute('rows')).toBe('7');
		expect(textarea.getAttribute('placeholder')).toBe('Say something');
	});

	it('honours the resize setting', async () => {
		const container = await mountIn(Textarea, { resize: 'none' });
		expect(container.querySelector('textarea')!.className).toMatch(/resize-none/);
	});

	it('resizes vertically by default, so the setting is doing something', async () => {
		const container = await mountIn(Textarea, {});
		expect(container.querySelector('textarea')!.className).not.toMatch(/resize-none/);
	});
});

describe('Checkbox', () => {
	it('reflects checked into the DOM', async () => {
		const container = await mountIn(Checkbox, { checked: true });
		const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
		expect(box, 'Checkbox rendered no checkbox input').not.toBeNull();
		expect(box!.checked).toBe(true);
	});

	it('is unchecked by default', async () => {
		const container = await mountIn(Checkbox, {});
		expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
			false
		);
	});

	it('sets indeterminate, which is a property and not an attribute', async () => {
		// The one that cannot be done in markup: `indeterminate` has no HTML
		// attribute, so a component that forgets the DOM assignment renders a
		// checkbox that simply is not indeterminate, with nothing to see.
		const container = await mountIn(Checkbox, { indeterminate: true });
		expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).indeterminate).toBe(
			true
		);
	});

	it('disables the element', async () => {
		const container = await mountIn(Checkbox, { disabled: true });
		expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(
			true
		);
	});
});

describe('Label', () => {
	it('associates itself with a control', async () => {
		// `for` is the whole job: without it, clicking the label does nothing and
		// screen readers announce the input unnamed.
		const container = await mountIn(Label, { for: 'email-field', children: textChildren });
		const label = container.querySelector('label');
		expect(label, 'Label rendered no <label>').not.toBeNull();
		expect(label!.getAttribute('for')).toBe('email-field');
	});

	it('renders its text', async () => {
		const container = await mountIn(Label, { children: textChildren });
		expect(container.textContent).toContain('label text');
	});

	it('marks a required field', async () => {
		const container = await mountIn(Label, { required: true, children: textChildren });
		// However it is presented, something must distinguish it.
		const plain = await mountIn(Label, { children: textChildren });
		expect(container.innerHTML).not.toBe(plain.innerHTML);
	});
});

describe('Progress', () => {
	it('exposes its value to assistive technology', async () => {
		// A progress bar that only styles a div is invisible to a screen reader.
		const container = await mountIn(Progress, { value: 40 });
		const bar = container.querySelector('[role="progressbar"]');
		expect(bar, 'Progress exposed no progressbar role').not.toBeNull();
		expect(bar!.getAttribute('aria-valuenow')).toBe('40');
	});

	it('reports the maximum it is measured against', async () => {
		const container = await mountIn(Progress, { value: 5, max: 10 });
		expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuemax')).toBe(
			'10'
		);
	});

	it('moves the indicator with the value', async () => {
		const low = await mountIn(Progress, { value: 10 });
		const high = await mountIn(Progress, { value: 90 });
		expect(low.innerHTML).not.toBe(high.innerHTML);
	});
});

describe('IconButton', () => {
	it('renders a button', async () => {
		const container = await mountIn(IconButton, { children: emptyChildren });
		expect(container.querySelector('button')).not.toBeNull();
	});

	it('carries an accessible name, having no text of its own', async () => {
		// An icon-only button with no label is unusable without sight, and this is
		// the component whose entire purpose is to have no text.
		const container = await mountIn(IconButton, {
			children: emptyChildren,
			'aria-label': 'Close'
		});
		expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Close');
	});

	it('does not dispatch while disabled', async () => {
		const dispatched: unknown[] = [];
		const container = await mountIn(IconButton, {
			children: emptyChildren,
			disabled: true,
			action: { type: 'tapped' },
			dispatch: (a: unknown) => dispatched.push(a)
		});

		container.querySelector('button')!.click();
		expect(dispatched).toEqual([]);
	});

	it('dispatches when it is not', async () => {
		const dispatched: unknown[] = [];
		const container = await mountIn(IconButton, {
			children: emptyChildren,
			action: { type: 'tapped' },
			dispatch: (a: unknown) => dispatched.push(a)
		});

		container.querySelector('button')!.click();
		expect(dispatched).toEqual([{ type: 'tapped' }]);
	});
});

describe('ButtonGroup', () => {
	it('renders its children', async () => {
		const container = await mountIn(ButtonGroup, { children: textChildren });
		expect(container.textContent).toContain('label text');
	});

	it('lays out horizontally and vertically differently', async () => {
		const horizontal = await mountIn(ButtonGroup, {
			orientation: 'horizontal',
			children: emptyChildren
		});
		const vertical = await mountIn(ButtonGroup, {
			orientation: 'vertical',
			children: emptyChildren
		});

		expect(horizontal.querySelector('*')!.className).not.toBe(
			vertical.querySelector('*')!.className
		);
	});
});
