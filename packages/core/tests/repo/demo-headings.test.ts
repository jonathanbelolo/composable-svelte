/**
 * Every styleguide demo starts at `<h2>` and never skips a level.
 *
 * The styleguide is the most-looked-at surface in this repository and, until
 * this file, the only one with no automated check of any kind — its `test`
 * script is `vitest run --passWithNoTests` over 62 demos. So nothing was
 * counting, and a browser audit of all 60 demo routes found **zero clean**:
 * 55 skipped a heading level and every page carried two `<h1>`s.
 *
 * That was not 60 defects. It was two causes:
 *
 *   1. `layout/Header.svelte` marked the site name `<h1>` — inside a `<button>`
 *      — so it competed with `ComponentShowcase`'s `<h1>{component.name}</h1>`
 *      on every page.
 *   2. The contract between the chrome and a demo was never written down.
 *      `ComponentShowcase` renders `<h1>` and then the demo directly; the
 *      `<h2>Live Demo</h2>` that would have bridged them is in the *fallback*
 *      branch, shown only for components that have no demo. So the 51 demos
 *      opening at `<h3>` were each one level too deep, and had no way to know.
 *
 * This is the written-down version. It is a static scan of the *markup*, which
 * has two blind spots worth naming, because the browser audit found both and
 * this cannot:
 *
 *   - A heading rendered by a child component is invisible here. `BannerDemo`
 *     opens at `<h2>` and still produces a `2 -> 5` skip at runtime, because
 *     `core`'s `BannerTitle` hardcodes `<h5>`. That is a library defect, not a
 *     demo one, and it is tracked as such.
 *   - Conditionally rendered headings appear in source order, not render order.
 *
 * What it does catch is the cause of 59 of the 60 findings: the level a demo
 * opens at, and the levels it skips in its own markup.
 *
 * Sizing is carried by Tailwind classes, not by the tag, so correcting a level
 * changes the outline and nothing visible.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const demosDir = join(repoRoot, 'examples/styleguide/src/lib/components/demos');

/**
 * Empty, and meant to stay that way.
 *
 * It would have held 59 when this landed. They were fixed in the same change
 * rather than registered, because the correction is mechanical and invisible —
 * registering it would have been a way of not doing it.
 */
const REGISTER: string[] = [];

const HEADING = /<h([1-6])\b/g;

/**
 * The markup, with the `<script>` and `<style>` blocks removed.
 *
 * `CodeEditorDemo` holds a sample HTML document in a template literal — the
 * text the demoed editor displays — and it contains an `<h1>`. Scanning the
 * whole file counted that as a heading of the page, which is how a first
 * version of this guard talked a sweep into rewriting sample content that was
 * never markup at all.
 */
export function markupOf(source: string): string {
	return source
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<style[\s\S]*?<\/style>/g, '');
}

interface Demo {
	name: string;
	levels: number[];
}

const walked = walkFiles(demosDir, { keep: (n) => n.endsWith('.svelte') });

function demos(): Demo[] {
	return walked.files
		.map((file) => ({
			name: file.slice(demosDir.length + 1),
			levels: [...markupOf(readFileSync(file, 'utf8')).matchAll(HEADING)].map((m) => Number(m[1]))
		}))
		.filter((demo) => demo.levels.length > 0);
}

/** What is wrong with one demo's outline, in the words the failure will use. */
export function outlineProblems({ levels }: Demo): string[] {
	const problems: string[] = [];

	if (levels.includes(1)) {
		// The page already has exactly one, and it names the component.
		problems.push('contains an <h1>');
	}
	if (levels[0] !== 2) {
		// `ComponentShowcase` renders <h1> and then the demo, with nothing in
		// between — so a demo opening at <h3> skips a level before it starts.
		problems.push(`opens at <h${levels[0]}>, not <h2>`);
	}
	for (let i = 1; i < levels.length; i++) {
		if (levels[i]! > levels[i - 1]! + 1) {
			problems.push(`skips h${levels[i - 1]} -> h${levels[i]}`);
		}
	}
	return problems;
}

const all = demos();
const offenders = all
	.map((demo) => ({ demo, problems: outlineProblems(demo) }))
	.filter(({ problems }) => problems.length > 0);

describe('the check itself', () => {
	it('read every file it was pointed at', () => {
		// A directory it could not descend into is a silent hole in the scan, not
		// a pass — the same reason `walkFiles` reports these separately at all.
		expect(walked.unreadable, 'these could not be read').toEqual([]);
	});

	it('found the demos', () => {
		// The vacuity arm. Every assertion below is satisfied by a scan that
		// matched nothing — a renamed directory, a `keep` that excludes
		// everything — and that looks exactly like a clean repository.
		expect(all.length, 'no demos were scanned at all').toBeGreaterThan(50);
	});

	it('reads the markup and not the script', () => {
		// The blind spot that mattered: a heading inside a template literal is
		// sample content, not structure.
		expect(markupOf('<script>const a = `<h1>x</h1>`;</script><h2>real</h2>')).not.toContain('<h1>');
		expect(markupOf('<script>const a = `<h1>x</h1>`;</script><h2>real</h2>')).toContain('<h2>');
	});

	it('reports a broken outline when one is put in front of it', () => {
		// The positive control. Without this, an `outlineProblems` that always
		// returned `[]` would satisfy the suite.
		expect(outlineProblems({ name: 'x', levels: [3] })).toEqual(['opens at <h3>, not <h2>']);
		expect(outlineProblems({ name: 'x', levels: [2, 4] })).toEqual(['skips h2 -> h4']);
		expect(outlineProblems({ name: 'x', levels: [1, 2] })).toContain('contains an <h1>');
		expect(outlineProblems({ name: 'x', levels: [2, 3, 2, 3] })).toEqual([]);
	});
});

describe('every demo', () => {
	it('opens at <h2>, skips no level, and leaves the <h1> to the page', () => {
		const unregistered = offenders.filter(({ demo }) => !REGISTER.includes(demo.name));

		expect(
			unregistered.map(({ demo, problems }) => `${demo.name}: ${problems.join('; ')}`),
			'a demo heading outline regressed — sizing comes from the Tailwind class, ' +
				'so correcting the tag changes the outline and nothing visible'
		).toEqual([]);
	});

	it('has no registration that outlived its cause', () => {
		// An exemption that survives its defect quietly re-permits the thing it
		// was written around.
		const fixed = REGISTER.filter((name) => !offenders.some(({ demo }) => demo.name === name));

		expect(fixed, 'these are registered but now pass — delete them from REGISTER').toEqual([]);
	});
});
