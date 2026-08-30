/**
 * A wildcard in `exports` publishes the whole build.
 *
 * `"./*": "./dist/*.js"` is not a convenience — it makes every internal module
 * a supported entry point, including the ones nothing was ever meant to import.
 * That is not theoretical here. It is why `createOverlay` was reachable from
 * outside the package, and why deleting `WebGLOverlay.ownsCanvas` on the
 * grounds that "`createOverlay` is not exported" was wrong: it was, by the
 * wildcard, and a consumer holding that overlay could have a caller-supplied
 * canvas permanently destroyed by `destroy()`. Reasoning about reachability is
 * only sound when the export map says what is reachable.
 *
 * The exceptions are registered rather than tolerated. Narrowing an export map
 * is a breaking change for anyone already deep-importing, so the five packages
 * below keep theirs until each is done deliberately — but a *sixth* package
 * cannot acquire the hole without editing this list.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { listDirs } from './walk.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

const packages = listDirs(packagesDir).filter((name) =>
	existsSync(join(packagesDir, name, 'package.json'))
);

/**
 * Registered, with a reason: narrowing these is a breaking change not yet taken.
 *
 * `check-coverage.test.ts` holds a second arm over the same set — that a
 * wildcard map also accepts the `.js` form of its own subpaths. Narrowing the
 * last package here empties that one too, so both come down together.
 */
const WILDCARD_EXPORTS_PENDING = ['charts', 'chat', 'code', 'media'];

function manifestOf(pkg: string): Manifest {
	return JSON.parse(readFileSync(join(packagesDir, pkg, 'package.json'), 'utf8')) as Manifest;
}

interface Manifest {
	exports?: unknown;
}

/**
 * What is wrong with a manifest, in a form the registration can reason about.
 *
 * The kind matters, not just the sentence. A registration here is for a
 * *wildcard* — a decision that narrowing one particular map is a breaking change
 * not yet taken — and it was being applied as blanket immunity: a registered
 * package that deleted its `exports` field altogether was skipped by the
 * offender arm, even though that publishes strictly more than the wildcard it
 * was excused for, `src/` included. The staleness arm then reported it as
 * *narrowed*, which is the opposite of what happened.
 */
type Problem = { kind: 'no-map' | 'wildcard' | 'shape'; detail: string };

/**
 * Every way a manifest can publish more than it names.
 *
 * Not just `Object.keys(exports)`. The first version checked only that, and so
 * missed the shape that publishes **strictly more** than a wildcard: no
 * `exports` field at all, which falls back to legacy resolution and exposes the
 * entire package directory — `src/` included. It also missed a wildcard sitting
 * in a condition *value* rather than a key, and an `exports` that is a plain
 * string, where `Object.keys` helpfully enumerates character indices.
 */
export function exportProblems({ exports }: Manifest): Problem[] {
	if (exports === undefined || exports === null) {
		return [
			{
				kind: 'no-map',
				detail: 'declares no `exports` map, so legacy resolution publishes the whole directory'
			}
		];
	}
	if (typeof exports === 'string') {
		return exports.includes('*')
			? [{ kind: 'wildcard', detail: `exports is the wildcard string "${exports}"` }]
			: [];
	}
	if (typeof exports !== 'object') {
		return [{ kind: 'shape', detail: `exports is a ${typeof exports}, not a map` }];
	}

	const problems: Problem[] = [];
	const visit = (node: unknown, path: string): void => {
		if (typeof node === 'string') {
			if (node.includes('*')) {
				problems.push({ kind: 'wildcard', detail: `${path} resolves to the wildcard "${node}"` });
			}
			return;
		}
		if (typeof node !== 'object' || node === null) return;
		for (const [key, value] of Object.entries(node)) {
			if (key.includes('*')) problems.push({ kind: 'wildcard', detail: `exports key "${key}"` });
			visit(value, path === '' ? `exports["${key}"]` : `${path}["${key}"]`);
		}
	};
	visit(exports, '');
	return problems;
}

/** Whether this manifest still carries the wildcard a registration is for. */
export function hasWildcard(manifest: Manifest): boolean {
	return exportProblems(manifest).some((p) => p.kind === 'wildcard');
}

/**
 * Whether a registration can excuse this problem.
 *
 * Only the wildcard it was written for. A missing map is never excused: it is
 * the shape that publishes *more* than a wildcard, so treating the registration
 * as blanket immunity let the worst case through the arm meant to catch it.
 */
const isExcusable = (problem: Problem) => problem.kind === 'wildcard';

/** What a package is answerable for, given whether it is registered. */
export function unexcused(manifest: Manifest, registered: boolean): Problem[] {
	return exportProblems(manifest).filter((problem) => !(registered && isExcusable(problem)));
}

/**
 * Whether a registration has outlived the wildcard it was written for.
 *
 * Only when the map is still there. A package whose `exports` vanished has not
 * been narrowed — it has been widened past what the registration excused — and
 * `unexcused` reports that with the right words. Saying "this package was
 * narrowed, drop it from the register" about it would send the reader to delete
 * the registration for a package that just became the worst offender.
 */
export function isStaleRegistration(manifest: Manifest): boolean {
	if (exportProblems(manifest).some((p) => p.kind === 'no-map')) return false;
	return !hasWildcard(manifest);
}

describe('export surface', () => {
	it('there are packages to check', () => {
		expect(packages.length).toBeGreaterThan(1);
	});

	it('no package publishes more than its registration excuses', () => {
		const offenders = packages.flatMap((pkg) =>
			unexcused(manifestOf(pkg), WILDCARD_EXPORTS_PENDING.includes(pkg)).map(
				(problem) => `${pkg} ${problem.detail}`
			)
		);

		expect(
			offenders,
			'this package publishes internal modules as public API — declare explicit entries instead'
		).toEqual([]);
	});

	it('every registered exception still has the wildcard it is registered for', () => {
		// Otherwise the list outlives the problem and quietly re-permits it.
		//
		// Scoped to packages that still *have* a map. A registration whose
		// `exports` vanished is not a narrowing and must not be reported as one —
		// the arm above owns that case, and says the true thing about it.
		const stale = WILDCARD_EXPORTS_PENDING.filter(
			(pkg) => packages.includes(pkg) && isStaleRegistration(manifestOf(pkg))
		);

		expect(stale, 'this package was narrowed — drop it from the register').toEqual([]);
	});

	it('names only packages that exist', () => {
		const missing = WILDCARD_EXPORTS_PENDING.filter((pkg) => !packages.includes(pkg));

		expect(missing).toEqual([]);
	});
});

describe('what a registration does and does not excuse', () => {
	// Against synthetic manifests, because the interesting cases cannot be
	// reached from the real ones: proving a registered package that drops its
	// `exports` is caught would otherwise mean editing a shipped package.json.
	const WILDCARD = { exports: { './*': './dist/*.js' } };
	const EXPLICIT = { exports: { '.': './dist/index.js' } };

	it('a wildcard is an offence unregistered', () => {
		// Two of them, not one: the key `./*` and the target `./dist/*.js` are
		// each reported, which is why the visitor descends into values at all —
		// a wildcard sitting in a condition value is the case `Object.keys` alone
		// used to miss.
		const kinds = unexcused(WILDCARD, false).map((p) => p.kind);

		expect(kinds.length, 'the key and its target are both wildcards').toBe(2);
		expect(new Set(kinds)).toEqual(new Set(['wildcard']));
	});

	it('and is excused when registered — the whole point of the register', () => {
		expect(unexcused(WILDCARD, true)).toEqual([]);
	});

	it('an explicit map is clean either way', () => {
		expect(unexcused(EXPLICIT, false)).toEqual([]);
		expect(unexcused(EXPLICIT, true)).toEqual([]);
	});

	it('a missing map is an offence even when registered', () => {
		// The hole. A registration is for a wildcard; no map at all publishes
		// strictly more, `src/` included, and was being waved through by the
		// exemption written for the lesser problem.
		expect(unexcused({}, true).map((p) => p.kind)).toEqual(['no-map']);
	});

	it('and says so, rather than calling it a narrowing', () => {
		expect(unexcused({}, true)[0]!.detail).toMatch(/no `exports` map/);
	});

	it('a wildcard hiding in a condition value is still a wildcard', () => {
		expect(
			unexcused({ exports: { '.': { import: './dist/*.js' } } }, false).map((p) => p.kind)
		).toEqual(['wildcard']);
	});

	it('a string exports field is read as a value, not enumerated', () => {
		// `Object.keys` on a string helpfully returns character indices.
		expect(unexcused({ exports: './dist/*.js' }, false).map((p) => p.kind)).toEqual(['wildcard']);
		expect(unexcused({ exports: './dist/index.js' }, false)).toEqual([]);
	});

	it('a manifest whose exports is neither object nor string is reported', () => {
		expect(unexcused({ exports: 42 }, true).map((p) => p.kind)).toEqual(['shape']);
	});

	it('hasWildcard is false for a manifest with no map at all', () => {
		// What made the staleness arm lie: `hasWildcard` cannot distinguish
		// "narrowed" from "vanished", so that arm now excludes the missing-map
		// case explicitly rather than describing it wrongly.
		expect(hasWildcard({})).toBe(false);
		expect(hasWildcard(WILDCARD)).toBe(true);
		expect(hasWildcard(EXPLICIT)).toBe(false);
	});
});

describe('a registration goes stale, or does not, for the right reason', () => {
	const WILDCARD = { exports: { './*': './dist/*.js' } };
	const EXPLICIT = { exports: { '.': './dist/index.js' } };

	it('is not stale while the wildcard is there', () => {
		expect(isStaleRegistration(WILDCARD)).toBe(false);
	});

	it('is stale once the map is narrowed, which is what it is for', () => {
		expect(isStaleRegistration(EXPLICIT)).toBe(true);
	});

	it('is not stale when the map vanished — that is not a narrowing', () => {
		// The arm that was reporting the opposite of the truth. `hasWildcard`
		// cannot tell "narrowed" from "gone", so both used to arrive here and the
		// message told the reader to delete the registration for a package that
		// had just started publishing its entire directory.
		expect(isStaleRegistration({})).toBe(false);
		expect(unexcused({}, true).map((p) => p.kind)).toEqual(['no-map']);
	});
});
