/**
 * Every symbol a component sub-barrel exports must be reachable from a public
 * entry point.
 *
 * `components/ui/index.ts` used to name only the component identifiers, which
 * left every reducer, state factory and prop type behind it unreachable:
 * `Collapsible` could not be used at all (it hard-requires a store whose
 * reducer could not be imported), and `SelectOption`, `ComboboxOption`,
 * `TreeNode` and friends could not be used to type the props they belong to.
 *
 * Nothing caught it. The styleguide aliases the package to source, so deep
 * imports resolve there no matter what `exports` says, and no test crossed the
 * package boundary. This does.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const uiDir = fileURLToPath(new URL('../../src/lib/components/ui/', import.meta.url));
/**
 * Comment-stripped, for the same reason `barrel` above is: a raw substring match
 * passes on a commented-out export. This guard shipped with that flaw and a
 * hostile review caught it — `// export * from …` left the assertion green.
 */
const componentsExports = readFileSync(
	fileURLToPath(new URL('../../src/lib/components-exports.ts', import.meta.url)),
	'utf8'
)
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\/\/.*$/gm, '');
const barrelSource = readFileSync(join(uiDir, 'index.ts'), 'utf8');
/** Comments name some of these symbols to explain their absence — scan code only. */
const barrel = barrelSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Named exports declared by a sub-barrel's own `index.ts`. */
function subBarrelExports(dir: string): string[] {
	const file = join(uiDir, dir, 'index.ts');
	if (!existsSync(file)) return [];
	const source = readFileSync(file, 'utf8');
	const names: string[] = [];

	for (const [, clause] of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
		for (const entry of clause.split(',')) {
			const name = entry.trim().split(/\s+as\s+/).pop()?.trim();
			if (name && name !== 'default') names.push(name);
		}
	}
	// `export * from './x.types.js'` — pull the names out of the target file.
	for (const [, target] of source.matchAll(/export\s+\*\s+from\s+'\.\/([\w.-]+)\.js'/g)) {
		const tsFile = join(uiDir, dir, `${target}.ts`);
		if (!existsSync(tsFile)) continue;
		const decls = readFileSync(tsFile, 'utf8');
		for (const [, name] of decls.matchAll(/^export\s+(?:type|interface|const|function)\s+(\w+)/gm)) {
			names.push(name);
		}
	}
	return [...new Set(names)];
}

/**
 * Names a sub-barrel exports that `components/ui` deliberately does not.
 *
 * These are internal helpers with no reference outside their own directory.
 * They only ever became public because the barrel used `export *`; core 0.6.0
 * is unpublished, so dropping them costs nothing. Keeping the list here rather
 * than as a silent omission means re-adding one is a decision, not an accident.
 */
const INTENTIONALLY_PRIVATE = new Set([
	// calendar date maths
	'isDateInBounds',
	'isSameDay',
	'isDateInRange',
	'getFirstDayOfMonth',
	'getLastDayOfMonth',
	'getCalendarDays',
	// file-upload internals
	'generateFileId',
	'formatFileSize'
]);

const subBarrels = readdirSync(uiDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(uiDir, e.name, 'index.ts')))
	.map((e) => e.name);

describe('components/ui public surface', () => {
	it('finds the sub-barrels', () => {
		expect(subBarrels.length).toBeGreaterThan(20);
	});

	it.each(subBarrels)('re-exports everything from %s', (dir) => {
		const declared = subBarrelExports(dir);
		if (declared.length === 0) return;

		if (barrel.includes(`export * from './${dir}/index.js'`)) return;

		// Otherwise every symbol must be named explicitly in the barrel.
		const missing = declared
			.filter((name) => !INTENTIONALLY_PRIVATE.has(name))
			.filter((name) => !new RegExp(`\\b${name}\\b`).test(barrel));
		expect(missing, `${dir}: unreachable from components/ui`).toEqual([]);
	});

	it('keeps the intentionally-private helpers out of the public surface', () => {
		const leaked = [...INTENTIONALLY_PRIVATE].filter((name) =>
			new RegExp(`\\b${name}\\b`).test(barrel)
		);
		expect(leaked, 'internal helpers must stay off components/ui').toEqual([]);
	});

	it('keeps Collapsible usable', () => {
		// It is the one component that cannot work without its reducer.
		for (const name of ['collapsibleReducer', 'createInitialCollapsibleState']) {
			const reachable =
				barrel.includes(`export * from './collapsible/index.js'`) || barrel.includes(name);
			expect(reachable, `${name} must be reachable`).toBe(true);
		}
	});
});

/**
 * The same defect, one level up.
 *
 * `src/lib/index.ts`'s only component re-export is `export * from
 * './components-exports.js'`, and that file was a hand-written list of component
 * *values*. So the fix above — making every type, reducer and state factory
 * reachable from `components/ui` — stopped there and never reached the package
 * root. 75 names, across 11 root-exported components, and `Collapsible` was
 * unusable from `@composable-svelte/core` for exactly the reason the header
 * comment describes.
 *
 * This asserts on source rather than on the built `dist`, so it runs without a
 * build. The star is what carries the names; naming them individually here
 * would just be a second list to drift.
 */
describe('package root public surface', () => {
	it('re-exports the component sub-barrels', () => {
		expect(
			componentsExports.includes(`export * from './components/ui/index.js'`),
			'components-exports.ts must star-export components/ui, or every prop type, ' +
				'reducer and state factory becomes unreachable from the package root'
		).toBe(true);
	});
});
