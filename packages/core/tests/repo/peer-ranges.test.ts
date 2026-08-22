/**
 * A sibling's declared range for `@composable-svelte/core` must be the version
 * it is actually built against.
 *
 * Every core bump in this campaign widened the siblings by *appending* a minor:
 * `^0.4.1 || ^0.5.0 || … || ^0.11.0`. Appending moves the ceiling and never the
 * floor, so the range kept advertising compatibility with versions that predate
 * the exports the package imports. chat reached the point of importing
 * `animateFadeIn` (core 0.11.0), `animateListItemIn` (0.10.0) and
 * `createScrollFollower` (0.9.0) while declaring 0.4.1 acceptable — a consumer
 * resolving 0.9.0 satisfied the range and got
 * `does not provide an export named 'animateFadeIn'` at load.
 *
 * The true floor is not computable from here: it would need a symbol-to-version
 * map for every import. What is computable, and honest, is that these packages
 * are developed and released together against one core, so each declares that
 * core and nothing older. Pre-1.0 `^0.x.y` already refuses the next minor, so
 * the range is exactly one minor wide either way — enumerating the history only
 * ever added versions nobody verified.
 *
 * The cost is that a core bump must touch every sibling. That was already true;
 * this makes forgetting it fail rather than ship.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

const read = (name: string) =>
	JSON.parse(readFileSync(join(packagesDir, name, 'package.json'), 'utf8'));

const coreVersion: string = read('core').version;

const siblings = readdirSync(packagesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'package.json')))
	.map((e) => e.name)
	.filter((name) => name !== 'core');

describe('sibling peer ranges', () => {
	it('there are siblings to check', () => {
		// A rename of `packages/` would otherwise make every assertion below
		// vacuous by iterating an empty list.
		expect(siblings.length).toBeGreaterThan(0);
	});

	it.each(siblings)('%s requires exactly the current core', (name) => {
		const pkg = read(name);
		const declared = pkg.peerDependencies?.['@composable-svelte/core'];

		expect(declared, `${name} does not declare core as a peer at all`).toBeDefined();
		expect(
			declared,
			`${name} declares "${declared}" while core is ${coreVersion}. Appending a ` +
				`minor to a "||" list moves the ceiling and leaves the floor behind, so ` +
				`the package keeps advertising versions that lack the exports it imports.`
		).toBe(`^${coreVersion}`);
	});
});
