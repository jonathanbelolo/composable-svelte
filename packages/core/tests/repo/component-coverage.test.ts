/**
 * Every component must be executed by at least one test.
 *
 * Not "asserted about" — executed. A component nothing imports cannot crash a
 * suite, cannot fail a typecheck of its own markup, and cannot report that it
 * renders nothing at all. Thirty-nine of `core`'s did nothing of the kind:
 * `Button`, `Input`, `Checkbox`, `Radio`, `Slider`, `Textarea`, `Label`,
 * `Progress`, all of `Card`, `Banner` and `DataTable`, and `DestinationRouter`.
 * The component library's headline surface, untouched.
 *
 * **Reachability, not text matching.** An earlier attempt at this measurement
 * searched test files for `<Name`, `mount(Name` or `Name.svelte` and reported
 * fifty-one — because 38 of this package's test files use `render()` from
 * `vitest-browser-svelte`, and named imports arrive from barrel `index.ts`
 * files. `Breadcrumb`, which has its own dedicated test file, was on that list.
 * Following imports is the only version that survives how the tests are
 * actually written.
 *
 * What this cannot tell you is whether anything is *asserted*. A component
 * reached only because a tested parent renders it counts here, and that is the
 * honest limit: this guard stops a component being added with no test at all,
 * which is the thing that kept happening.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

const PACKAGES = ['core', 'chat', 'media', 'maps', 'charts', 'code', 'graphics', 'auth'];

function walk(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', 'dist', '.svelte-kit', '__screenshots__'].includes(entry.name)) continue;
			walk(full, out);
			continue;
		}
		out.push(full);
	}
	return out;
}

/**
 * Every import in a file, with the names it brought in.
 *
 * The names matter because of barrels. `import { Breadcrumb } from
 * './breadcrumb/index.js'` must credit `Breadcrumb` and *not* its six siblings
 * that the same index re-exports — otherwise one import marks a whole directory
 * tested, and a component added to that directory later arrives pre-credited
 * with no test at all. That hole was real: a probe component dropped into the
 * breadcrumb barrel passed this guard cleanly.
 *
 * `names` is empty for a namespace or side-effect import, which is treated as
 * "everything", because there is no name to narrow by.
 */
interface Import {
	spec: string;
	names: string[];
}

function importsOf(file: string): Import[] {
	const source = readFileSync(file, 'utf8');
	const out: Import[] = [];

	// `import X, { A, B as C } from '...'` / `import { A } from '...'`
	for (const m of source.matchAll(
		/import\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g
	)) {
		const clause = m[1] ?? '';
		const braces = /\{([^}]*)\}/.exec(clause);
		const named = braces
			? braces[1]!
					.split(',')
					.map((part) => part.trim().split(/\s+as\s+/)[0]!.trim())
					.filter(Boolean)
			: [];
		const defaultImport = clause.replace(/\{[^}]*\}/, '').replace(/^type\s+/, '').trim().replace(/,$/, '');
		if (defaultImport && !defaultImport.startsWith('*')) named.push(defaultImport);
		out.push({ spec: m[2]!, names: /\*/.test(clause) ? [] : named });
	}

	// Re-exports. A barrel forwards with `export … from`, and this is how a
	// barrel entered *without* names — a namespace or side-effect import — is
	// traversed. The first version of this function matched only `import … from`
	// and silently stopped following re-exports entirely; the narrowed path
	// happened to cover it up for barrels entered by name, and the fallback path
	// credited nothing at all. Caught by mutating name extraction and finding
	// that the *permissive* mutation lost eight components, which is the
	// opposite of what a permissive change should do.
	for (const m of source.matchAll(/export\s+[^'"]*?\s*from\s*['"]([^'"]+)['"]/g)) {
		out.push({ spec: m[1]!, names: [] });
	}

	// Bare and dynamic imports carry no names.
	for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)) {
		out.push({ spec: m[1]!, names: [] });
	}
	for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
		out.push({ spec: m[1]!, names: [] });
	}

	return out;
}

/** `export { default as Name } from './Name.svelte'` — a barrel's own map. */
function barrelExports(file: string): Map<string, string> {
	const source = readFileSync(file, 'utf8');
	const map = new Map<string, string>();
	for (const m of source.matchAll(
		/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
	)) {
		for (const part of m[1]!.split(',')) {
			const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
			if (alias) map.set(alias, m[2]!);
		}
	}
	return map;
}

/** Resolve a relative specifier the way the bundler will: `.js` means `.ts` on disk. */
function resolveLocal(from: string, spec: string): string | null {
	if (!spec.startsWith('.')) return null;
	const base = resolve(dirname(from), spec.replace(/\.js$/, ''));
	for (const candidate of [base, `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

interface Scan {
	components: string[];
	testFiles: string[];
	reached: Set<string>;
}

function scan(pkg: string): Scan {
	const srcDir = join(packagesDir, pkg, 'src');
	const testDir = join(packagesDir, pkg, 'tests');

	const components = walk(srcDir).filter((f) => f.endsWith('.svelte'));
	// `.svelte` files under `tests/` are harnesses a spec mounts, and they import
	// the components under test, so they are entry points too.
	const testFiles = walk(testDir).filter((f) => /\.(ts|svelte)$/.test(f));

	const reached = new Set<string>();

	const visit = (file: string, viaNames: string[] | null = null) => {
		if (reached.has(file)) return;
		reached.add(file);

		const isBarrel = file.endsWith('index.ts');
		// A barrel entered by name forwards only those names. Entered with no
		// names — a namespace or side-effect import — it forwards everything.
		const forward = isBarrel && viaNames && viaNames.length > 0 ? barrelExports(file) : null;

		if (forward) {
			for (const name of viaNames!) {
				const spec = forward.get(name);
				if (!spec) continue;
				const next = resolveLocal(file, spec);
				if (next) visit(next);
			}
			return;
		}

		for (const { spec, names } of importsOf(file)) {
			const next = resolveLocal(file, spec);
			if (next) visit(next, names);
		}
	};

	testFiles.forEach((f) => visit(f));

	return { components, testFiles, reached };
}

const scans = new Map(PACKAGES.map((pkg) => [pkg, scan(pkg)]));

const nameOf = (file: string) => file.slice(file.lastIndexOf('/') + 1, -'.svelte'.length);

describe('the barrel narrowing actually narrows', () => {
	// The failure mode of the narrowing is silent and permissive: if `importsOf`
	// stops extracting names, `names` is empty, an empty list is treated as
	// "everything", and the guard quietly returns to crediting a whole directory
	// for one import. Nothing would fail — coverage would simply become
	// meaningless again. So the extraction is asserted directly.
	const sample = join(packagesDir, 'core/tests/breadcrumb.browser.test.ts');

	it('extracts the names from a real barrel import', () => {
		const barrelImport = importsOf(sample).find((i) => i.spec.includes('breadcrumb/index'));
		expect(barrelImport, 'the sample no longer imports the breadcrumb barrel').toBeDefined();
		expect(barrelImport!.names).toContain('Breadcrumb');
		expect(barrelImport!.names).toContain('BreadcrumbList');
	});

	it('reads a barrel’s own export map', () => {
		const barrel = join(packagesDir, 'core/src/lib/components/ui/breadcrumb/index.ts');
		const exports = barrelExports(barrel);
		expect(exports.size, 'the breadcrumb barrel parsed to nothing').toBeGreaterThan(3);
		expect(exports.get('Breadcrumb')).toMatch(/Breadcrumb\.svelte$/);
	});
});

describe('the scan sees a real repository', () => {
	// Every arm below is an absence claim, and an absence claim from a walker
	// that resolved nothing is worthless. These are the floors that make the
	// rest mean something.
	it('finds components in every package', () => {
		for (const pkg of PACKAGES) {
			expect(scans.get(pkg)!.components.length, `${pkg} has no components`).toBeGreaterThan(0);
		}
	});

	it('finds test files in every package', () => {
		for (const pkg of PACKAGES) {
			expect(scans.get(pkg)!.testFiles.length, `${pkg} has no test files`).toBeGreaterThan(0);
		}
	});

	it('resolves imports rather than stopping at the entry points', () => {
		// If `resolveLocal` were broken, `reached` would hold only the test files
		// themselves and every component would look untested.
		const core = scans.get('core')!;
		expect(core.reached.size).toBeGreaterThan(core.testFiles.length * 2);
	});

	it('reaches most components, so a total failure would be obvious', () => {
		const all = PACKAGES.flatMap((pkg) => scans.get(pkg)!.components);
		const reached = PACKAGES.flatMap((pkg) => {
			const s = scans.get(pkg)!;
			return s.components.filter((c) => s.reached.has(c));
		});
		expect(reached.length / all.length).toBeGreaterThan(0.5);
	});
});

describe('every component is executed by some test', () => {
	it.each(PACKAGES)('%s', (pkg) => {
		// Unconditional. This began with 43 components registered as
		// UNTESTED_PENDING so the debt was visible while it was worked through;
		// the list reached empty and went, along with the arm that consulted it —
		// the shape `NOT_YET_GATED` took once every workspace was gated. A new
		// component with no test now fails here on the day it is added.
		const { components, reached } = scans.get(pkg)!;

		const offenders = components.filter((c) => !reached.has(c)).map(nameOf);

		expect(
			offenders.sort(),
			`no test imports these ${pkg} components, directly or through anything it renders`
		).toEqual([]);
	});
});

