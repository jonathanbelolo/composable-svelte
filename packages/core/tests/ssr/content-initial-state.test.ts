/**
 * Accordion and Collapsible content must have exactly one author for its
 * height, and the server must still be able to render it collapsed.
 *
 * Both components had three: a reactive `style={…}`, the Tailwind trio
 * `h-0 overflow-hidden opacity-0`, and the Motion One helpers writing
 * `element.style.height/overflow/opacity` every frame. Svelte compiles a
 * reactive `style={…}` to `set_style`, which assigns `dom.style.cssText` — a
 * total wipe of every inline style Motion One wrote — and it fires precisely on
 * an expand/collapse flip, i.e. when an animation is starting or being
 * interrupted. That is invariant 6, violated in the component the guideline
 * cites as its reference.
 *
 * Deleting the reactive style is not the fix, and this is the half that needs a
 * test rather than care: `AccordionContent` renders its children
 * unconditionally, so with the inline style gone the only thing holding the box
 * at zero height on the server is the Tailwind trio — and Tailwind is not
 * compiled here or in any consumer that has not wired it. A collapsed accordion
 * would be sent fully expanded.
 *
 * So the shape is the same one the chevrons and the Switch thumb use: a
 * non-reactive value bound with `style:`, written once and then left alone.
 */

import { describe, it, expect } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const src = fileURLToPath(new URL('../../src/lib/components/ui/', import.meta.url));

function serverCode(relPath: string): string {
	const file = join(src, relPath);
	return compile(readFileSync(file, 'utf8'), { generate: 'server', filename: file }).js.code;
}

function clientCode(relPath: string): string {
	const file = join(src, relPath);
	return compile(readFileSync(file, 'utf8'), { generate: 'client', filename: file }).js.code;
}

const cases = [
	{ name: 'AccordionContent', file: 'accordion/AccordionContent.svelte' },
	{ name: 'CollapsibleContent', file: 'collapsible/CollapsibleContent.svelte' }
] as const;

describe('content components have one author for height', () => {
	it.each(cases)('$name does not re-assert styles reactively', ({ file }) => {
		// `set_style` with a *reactive* argument is the clobber. A `style:`
		// directive compiles to `set_style` too, but Svelte diffs those and only
		// writes when the value changes — and ours is a constant, so it writes once.
		const code = clientCode(file);
		expect(
			code,
			'a reactive style attribute still rebuilds cssText on every expand/collapse, ' +
				'wiping whatever Motion One had written mid-animation'
		).not.toMatch(/set_style\([\s\S]{0,160}?isExpanded/);
	});

	it.each(cases)('$name still renders its resting height on the server', ({ file }) => {
		const code = serverCode(file);
		const template = code.slice(code.indexOf('$$renderer.push('));
		const styles = (template.match(/attr_style\([\s\S]{0,200}?\)/g) ?? []).join(' | ');

		expect(
			styles,
			'the server emits no style for the content box — a collapsed section ' +
				'would be sent at full height wherever Tailwind is not compiled'
		).not.toBe('');
		expect(styles).toMatch(/initialContentStyle/);
	});

	it.each(cases)('$name derives that resting height from state', ({ file }) => {
		const code = serverCode(file);
		const declaration = code.slice(code.indexOf('const initialContentStyle'));
		expect(declaration.slice(0, 240)).toMatch(/isExpanded/);
	});
});
