/**
 * A changelog nobody receives is not a changelog.
 *
 * `files` in `package.json` is an allowlist: anything not named is left out of
 * the tarball. `code` and `media` each wrote and maintained a `CHANGELOG.md`
 * that was never published, because their `files` listed only `dist`,
 * `README.md` and `LICENSE` — the document existed for consumers and reached
 * none of them.
 *
 * Deliberately narrow. This does not police what a package *should* have; it
 * checks that what a package has written for its consumers actually ships.
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

/** Documents that are written for a consumer, so they have to reach one. */
const CONSUMER_FACING = ['README.md', 'CHANGELOG.md'];

describe('published files', () => {
	it('there are packages to check', () => {
		expect(packages.length).toBeGreaterThan(0);
	});

	it.each(packages)('%s ships the documents it maintains', (name) => {
		const pkgDir = join(packagesDir, name);
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
		const files: string[] = pkg.files ?? [];

		// No `files` at all means npm packs everything, which is wasteful but not
		// a lie — the documents do reach the consumer.
		if (pkg.files === undefined) return;

		const missing = CONSUMER_FACING.filter(
			(doc) => existsSync(join(pkgDir, doc)) && !files.includes(doc)
		);

		expect(
			missing,
			`${name} maintains ${missing.join(', ')} but does not list it in "files", ` +
				`so it is written for consumers and shipped to none of them.`
		).toEqual([]);
	});
});
