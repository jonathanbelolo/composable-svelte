/**
 * Some packages promise a flat root barrel. This checks the ones that do.
 *
 * `@composable-svelte/auth` says, in its skill and its README, that every
 * subpath export is also reachable from `@composable-svelte/auth` — a subpath
 * is a convenience, never the only way in. That is a real promise a consumer
 * makes decisions on, and nothing was holding it: `createHttpAuthDeps` sat on
 * `./http` alone while `createHttpSessionDeps` was on both, and the skill
 * claimed otherwise until someone checked.
 *
 * The sharper reason is the failure this catches next. The login flow shipped
 * in `e17f7e0` exported from neither the barrel nor the `exports` map — its
 * tests only reached it through a relative path, so nothing went red. Four more
 * flows are coming. This is the check that would have caught the first one.
 *
 * **This is not a repo-wide rule and must not become one.** `core` has 246
 * subpath-only exports and should: a design system's root barrel carrying every
 * chart primitive and every SSR helper is worse for consumers, not better. The
 * register below is an opt-in for small packages with a flat API, not a
 * backlog.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Packages whose root barrel must re-export every subpath. Opt-in. */
const FLAT_BARREL = ['auth'];

interface Manifest {
	exports?: Record<string, unknown>;
}

/**
 * The names a declaration file exports.
 *
 * Parsed with the TypeScript API rather than a regex over `export {…}`. A
 * regex misses `export * from`, re-export renaming and declaration merging —
 * and a guard that under-reports is one that passes for the wrong reason,
 * which is the failure mode this whole directory exists to avoid.
 */
export function exportedNames(declarationFile: string): Set<string> {
	const program = ts.createProgram([declarationFile], {
		noResolve: false,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowJs: false,
		skipLibCheck: true
	});
	const source = program.getSourceFile(declarationFile);
	if (!source) return new Set();

	const checker = program.getTypeChecker();
	const symbol = checker.getSymbolAtLocation(source);
	if (!symbol) return new Set();

	return new Set(checker.getExportsOfModule(symbol).map((s) => s.getName()));
}

interface Subpath {
	key: string;
	declaration: string;
}

function subpathsOf(pkg: string): Subpath[] {
	const manifest = JSON.parse(
		readFileSync(join(packagesDir, pkg, 'package.json'), 'utf8')
	) as Manifest;

	return Object.entries(manifest.exports ?? {})
		.filter(([key]) => key !== '.' && key !== './package.json')
		.flatMap(([key, value]) => {
			if (typeof value !== 'object' || value === null) return [];
			const types = (value as { types?: string }).types;
			if (!types) return [];
			const declaration = join(packagesDir, pkg, types);
			return existsSync(declaration) ? [{ key, declaration }] : [];
		});
}

interface Gap {
	pkg: string;
	key: string;
	missing: string[];
}

/** A subpath and the names its declaration exports, read once. */
interface Measured {
	key: string;
	declaration: string;
	names: Set<string>;
}

/**
 * The names each subpath exports that the root barrel does not. Pure, so the
 * positive control can drive it with a synthetic root.
 */
export function gapsOf(pkg: string, root: Set<string>, subpaths: ReadonlyArray<Pick<Measured, 'key' | 'names'>>): Gap[] {
	return subpaths
		.map(({ key, names }) => ({
			pkg,
			key,
			missing: [...names].filter((name) => !root.has(name)).sort()
		}))
		.filter((gap) => gap.missing.length > 0);
}

const built = FLAT_BARREL.filter((pkg) =>
	existsSync(join(packagesDir, pkg, 'dist/index.d.ts'))
);

const measured = built.map((pkg) => {
	const root = exportedNames(join(packagesDir, pkg, 'dist/index.d.ts'));
	// Each declaration is parsed once and its names kept. `exportedNames` builds
	// a whole TypeScript program per call, and the vacuity arm below used to
	// call it a second time per subpath just to read `.size` — seven redundant
	// programs for `auth`, inside a test with a five-second budget, which is
	// what made "read real export sets" fail under load and pass alone.
	const subpaths: Measured[] = subpathsOf(pkg).map(({ key, declaration }) => ({
		key,
		declaration,
		names: exportedNames(declaration)
	}));
	const gaps = gapsOf(pkg, root, subpaths);
	return { pkg, root, subpaths, gaps };
});

describe('the check itself', () => {
	it('ran against a built library', () => {
		// Without `dist` every set is empty and every assertion below passes,
		// which looks identical to a clean repository.
		const unbuilt = FLAT_BARREL.filter((pkg) => !built.includes(pkg));

		expect(unbuilt, 'these have no dist — run `pnpm -r build` before this guard').toEqual([]);
	});

	it('read real export sets', () => {
		// The vacuity arm. A `exportedNames` that returned nothing would satisfy
		// the offender arm perfectly.
		for (const { pkg, root, subpaths } of measured) {
			expect(root.size, `${pkg} root barrel parsed as empty`).toBeGreaterThan(10);
			expect(subpaths.length, `${pkg} declared no subpaths`).toBeGreaterThan(0);
			for (const { key, names } of subpaths) {
				expect(names.size, `${pkg} ${key} parsed as empty`).toBeGreaterThan(0);
			}
		}
	});

	it('finds a name that is genuinely absent', () => {
		// The root barrel does not export everything in the universe, so a name
		// nothing declares must come back missing.
		for (const { pkg, root } of measured) {
			expect(root.has('__definitelyNotExported'), pkg).toBe(false);
		}
	});

	it('reports a subpath name the root lacks, and only that', () => {
		// The positive control, through the real gap computation: a root that
		// lacks one real subpath name must produce exactly that gap. The arm
		// above only proved the root set was not universal.
		for (const { pkg, root, subpaths } of measured) {
			const first = subpaths[0]!;
			const name = [...first.names][0]!;
			const narrowed = new Set([...root].filter((n) => n !== name));
			const gaps = gapsOf(pkg, narrowed, subpaths);
			expect(gaps.some((g) => g.key === first.key && g.missing.includes(name)), `${pkg}: ${name} not reported`).toBe(true);
			expect(gapsOf(pkg, root, subpaths)).toEqual([]);
		}
	});
});

describe('a package promising a flat barrel', () => {
	it('re-exports every subpath from its root', () => {
		const gaps = measured.flatMap(({ gaps: g }) => g);

		expect(
			gaps.map((gap) => `${gap.pkg} ${gap.key}: ${gap.missing.join(', ')}`),
			'these are reachable only through a subpath. Either re-export them from ' +
				"the package's root barrel, or drop the package from FLAT_BARREL and " +
				'correct whatever documentation promises a flat API'
		).toEqual([]);
	});

	it('is registered only while it still has subpaths to check', () => {
		// A registration that checks nothing is not a passing check, it is an
		// absent one — the same reason every register in this directory has a
		// staleness arm.
		const vacuous = measured.filter(({ subpaths }) => subpaths.length === 0).map(({ pkg }) => pkg);

		expect(vacuous, 'registered in FLAT_BARREL but declares no subpaths').toEqual([]);
	});
});
