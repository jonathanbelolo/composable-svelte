/**
 * An animated element must render in the right *position* on the server.
 *
 * Converting a CSS-class animation to Motion One means moving the element's
 * position out of the markup and into an `$effect` — and `$effect` does not run
 * during server rendering. Do that carelessly and every switch, chevron and
 * caret is emitted at its resting position regardless of state: a checked
 * `<Switch>` renders with `bg-primary` on the track (still class-driven) and its
 * thumb at zero, so it reads as simultaneously on and off until hydration. On an
 * SSG page, or with JS disabled or slow, it simply stays wrong.
 *
 * That is exactly what the first pass of this conversion shipped, and nothing in
 * the suite could see it: every animation test runs in browser mode, where
 * effects do run. This test compiles the components the way the server does.
 *
 * The fix these assert is the shape, not just the symptom: a **non-reactive**
 * initial value bound with `style:`. Because it never changes, Svelte writes it
 * once and never touches the property again — the markup places the element and
 * Motion One animates it, which is invariant 6 (one property, one author) rather
 * than a second author reintroduced for SSR's benefit.
 */

import { describe, it, expect } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const src = fileURLToPath(new URL('../../src/lib/components/ui/', import.meta.url));

/** The component as the server will run it. */
function serverCode(relPath: string): string {
	const file = join(src, relPath);
	return compile(readFileSync(file, 'utf8'), { generate: 'server', filename: file }).js.code;
}

/**
 * Only the part that becomes HTML.
 *
 * Scoping to the template is what makes these assertions mean anything. The
 * first version of this test searched the whole compiled module, so a `const
 * initialThumbTransform = …` sitting unused in the script satisfied it — the
 * test passed with the markup binding deleted, which is the very regression it
 * was written for. Verified by mutation, both before and after.
 */
function serverTemplate(relPath: string): string {
	const code = serverCode(relPath);
	const start = code.indexOf('$$renderer.push(');
	expect(start, `no render template found in ${relPath}`).toBeGreaterThan(-1);
	return code.slice(start);
}

/**
 * Just the `style` bindings the server will emit.
 *
 * Narrowed to these because looser needles matched things that are not
 * bindings at all, and the test passed with the markup deleted twice before
 * this. `/transform/` matched the `will-change-transform` utility class sitting
 * in the same element's class list; searching the template for the identifier
 * matched a *comment*, because the compiler hoists `$effect` comments into the
 * attribute region. Both were verified by mutation.
 */
function serverStyleBindings(relPath: string): string {
	return (serverTemplate(relPath).match(/attr_style\([\s\S]{0,160}?\)/g) ?? []).join(' | ');
}

const cases = [
	{
		name: 'Switch thumb',
		file: 'switch/Switch.svelte',
		binding: 'initialThumbTransform',
		state: /checked/
	},
	{
		name: 'Accordion chevron',
		file: 'accordion/AccordionTrigger.svelte',
		binding: 'initialChevronTransform',
		state: /isExpanded/
	},
	{
		name: 'Collapsible chevron',
		file: 'collapsible/CollapsibleTrigger.svelte',
		binding: 'initialChevronTransform',
		state: /isExpanded/
	},
	{
		name: 'Select caret',
		file: 'select/Select.svelte',
		binding: 'initialChevronTransform',
		state: /isOpen/
	}
] as const;

describe('server-rendered position of animated elements', () => {
	it.each(cases)('$name is positioned by the server markup', ({ file, binding }) => {
		const styles = serverStyleBindings(file);

		expect(
			styles,
			'the render template emits no style binding — the element will be sent at ' +
				'its resting position regardless of state, and pop on hydration'
		).not.toBe('');

		expect(
			styles,
			`the emitted style does not bind ${binding}, so the position is not ` +
				'derived from state'
		).toContain(binding);
	});

	it.each(cases)('$name derives that position from state', ({ file, state, binding }) => {
		// A hardcoded transform would satisfy the assertions above while being
		// wrong for half the states. The binding must be computed from the state
		// that decides the position.
		const code = serverCode(file);
		const declaration = code.slice(code.indexOf(`const ${binding}`));
		expect(declaration.slice(0, 200)).toMatch(state);
	});

	it('effects are genuinely absent from server output, so this is not vacuous', () => {
		// If Svelte emitted user effects server-side, the whole premise would be
		// wrong and every assertion above would pass for the wrong reason.
		expect(serverCode('switch/Switch.svelte')).not.toMatch(/user_effect/);
	});
});
