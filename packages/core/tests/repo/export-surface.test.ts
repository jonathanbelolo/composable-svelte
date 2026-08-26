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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

const packages = readdirSync(packagesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'package.json')))
	.map((e) => e.name);

/**
 * Registered, with a reason: narrowing these is a breaking change not yet taken.
 *
 * `check-coverage.test.ts` holds a second arm over the same set — that a
 * wildcard map also accepts the `.js` form of its own subpaths. Narrowing the
 * last package here empties that one too, so both come down together.
 */
const WILDCARD_EXPORTS_PENDING = ['charts', 'chat', 'code', 'maps', 'media'];

function wildcardKeys(pkg: string): string[] {
	const manifest = JSON.parse(
		readFileSync(join(packagesDir, pkg, 'package.json'), 'utf8')
	) as { exports?: Record<string, unknown> };

	return Object.keys(manifest.exports ?? {}).filter((key) => key.includes('*'));
}

describe('export surface', () => {
	it('there are packages to check', () => {
		expect(packages.length).toBeGreaterThan(1);
	});

	it('no unregistered package publishes its whole build tree', () => {
		const offenders = packages
			.filter((pkg) => !WILDCARD_EXPORTS_PENDING.includes(pkg))
			.flatMap((pkg) => wildcardKeys(pkg).map((key) => `${pkg} exports "${key}"`));

		expect(
			offenders,
			'a wildcard export makes every internal module public API — add an explicit entry instead'
		).toEqual([]);
	});

	it('every registered exception still has the wildcard it is registered for', () => {
		// Otherwise the list outlives the problem and quietly re-permits it.
		const stale = WILDCARD_EXPORTS_PENDING.filter(
			(pkg) => packages.includes(pkg) && wildcardKeys(pkg).length === 0
		);

		expect(stale, 'this package was narrowed — drop it from the register').toEqual([]);
	});

	it('names only packages that exist', () => {
		const missing = WILDCARD_EXPORTS_PENDING.filter((pkg) => !packages.includes(pkg));

		expect(missing).toEqual([]);
	});
});
