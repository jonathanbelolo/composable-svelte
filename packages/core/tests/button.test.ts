/**
 * `Button` — the most-used component in this library, and one no test had ever
 * rendered.
 *
 * Thirty-nine of core's components were in that state; this is the one where it
 * had already cost something. `product-gallery` passed `size="default"` — a real
 * shadcn size name, absent from this component's union — and
 * `sizeClasses['default']` was `undefined`, which `cn()` drops. Every share
 * button on the page lost its height and padding. That is recorded as S4.6, and
 * the fix went into the example while the component kept the behaviour that
 * allowed it.
 *
 * TypeScript catches a literal. It does not catch a value from a store, a JSON
 * payload, or an untyped call site, which is where this happened.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Snippet } from 'svelte';
import { Button } from '../src/lib/components/ui/button/index.js';

/**
 * `children` is a **required** Snippet on Button, rendered unconditionally with
 * `{@render children()}` — so omitting it throws `invalid_snippet` rather than
 * rendering an empty button. That is correct for a button, and it is why every
 * render below supplies one.
 *
 * A no-op function is exactly the snippet that renders nothing;
 * `createRawSnippet` cannot express that, since it must return markup. Same
 * device the breadcrumb suite uses, and the cast supplies only the brand.
 */
const emptyChildren = (() => {}) as unknown as Snippet;

/**
 * Render, settle, and hand back the `<button>`.
 *
 * The wait is not decoration: this suite runs in a real browser and Svelte 5
 * flushes asynchronously, so reading `container` synchronously finds nothing —
 * which is how the first version of this file failed all 23 arms at once. Same
 * 50ms settle the breadcrumb suite uses.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

async function renderButton(props: Record<string, unknown> = {}): Promise<HTMLButtonElement> {
	const { container } = render(Button as never, { children: emptyChildren, ...props } as never);
	await settle();
	const button = container.querySelector('button');
	expect(button, 'Button rendered no <button> element').not.toBeNull();
	return button as HTMLButtonElement;
}

/** The classes a given set of props produces. */
const classesFor = async (props: Record<string, unknown>) => (await renderButton(props)).className;

const VARIANTS = [
	'default',
	'primary',
	'secondary',
	'destructive',
	'outline',
	'ghost',
	'link'
] as const;
const SIZES = ['sm', 'md', 'lg', 'icon'] as const;

describe('it renders', () => {
	it('produces a button element', async () => {
		expect((await renderButton()).tagName).toBe('BUTTON');
	});

	it('is type=button, so it does not submit a form by accident', async () => {
		expect((await renderButton()).getAttribute('type')).toBe('button');
	});
});

describe('every declared variant and size produces styling', () => {
	// The floor: a union member that resolves to no class is the defect, and it
	// is silent — the button renders, it just has nothing on it.
	it.each(VARIANTS)('variant %s', async (variant) => {
		const classes = await classesFor({ variant });
		expect(classes.length).toBeGreaterThan(0);
		// The base classes are always present, so length alone proves nothing.
		// A variant contributes a colour of some kind.
		expect(classes).toMatch(/bg-|text-|border|hover:/);
	});

	it.each(SIZES)('size %s', async (size) => {
		// Every size sets a height. `h-` is the thing that vanished in S4.6.
		expect(await classesFor({ size })).toMatch(/\bh-\d+\b/);
	});
});

describe('an unrecognised variant or size falls back', () => {
	it('sizes a button given the shadcn name this union does not have', async () => {
		// The S4.6 case by name. `default` is a legitimate shadcn size and is not
		// in this union; it used to produce a button with no height at all.
		const classes = await classesFor({ size: 'default' });
		expect(classes).toMatch(/\bh-\d+\b/);
		expect(classes).toBe(await classesFor({ size: 'md' }));
	});

	it('gives an unknown variant the default appearance', async () => {
		expect(await classesFor({ variant: 'nonsense' })).toBe(
			await classesFor({ variant: 'default' })
		);
	});

	it('gives an unknown size the default sizing', async () => {
		expect(await classesFor({ size: 'enormous' })).toBe(await classesFor({ size: 'md' }));
	});

	it('still tells the sizes apart, so the fallback is a fallback', async () => {
		// Non-vacuity for the three arms above: if every size resolved to `md`,
		// they would all pass and the component would be broken in a new way.
		expect(await classesFor({ size: 'sm' })).not.toBe(await classesFor({ size: 'lg' }));
	});

	it('still tells the variants apart', async () => {
		expect(await classesFor({ variant: 'ghost' })).not.toBe(
			await classesFor({ variant: 'destructive' })
		);
	});
});

describe('the caller can add classes', () => {
	it('keeps its own and appends the caller’s', async () => {
		const classes = await classesFor({ class: 'my-custom-class' });
		expect(classes).toContain('my-custom-class');
		expect(classes).toMatch(/inline-flex/);
	});
});

describe('disabled and loading', () => {
	it('marks the element disabled', async () => {
		expect((await renderButton({ disabled: true })).disabled).toBe(true);
	});

	it('does not dispatch its action while disabled', async () => {
		const dispatched: unknown[] = [];
		const button = await renderButton({
			disabled: true,
			action: { type: 'tapped' },
			dispatch: (a: unknown) => dispatched.push(a)
		});

		button.click();
		expect(dispatched).toEqual([]);
	});

	it('does not dispatch its action while loading', async () => {
		// Separate from `disabled`: a loading button is not `disabled` in the DOM,
		// so the guard is the component's own and could regress independently.
		const dispatched: unknown[] = [];
		const button = await renderButton({
			loading: true,
			action: { type: 'tapped' },
			dispatch: (a: unknown) => dispatched.push(a)
		});

		button.click();
		expect(dispatched).toEqual([]);
	});

	it('dispatches when it is neither', async () => {
		// The control. Without it, a component that never dispatches at all would
		// satisfy both arms above.
		const dispatched: unknown[] = [];
		const button = await renderButton({
			action: { type: 'tapped' },
			dispatch: (a: unknown) => dispatched.push(a)
		});

		button.click();
		expect(dispatched).toEqual([{ type: 'tapped' }]);
	});
});

describe('optional props accept undefined', () => {
	it('renders with every optional prop explicitly undefined', async () => {
		// The wrapper-forwarding property: a caller spreading its own optional
		// props passes `undefined`, not nothing. This is T8/T12 as a runtime
		// check rather than a type one.
		const button = await renderButton({
			variant: undefined,
			size: undefined,
			disabled: undefined,
			loading: undefined,
			class: undefined,
			action: undefined,
			dispatch: undefined
		});

		expect(button.className).toMatch(/\bh-\d+\b/);
	});
});
