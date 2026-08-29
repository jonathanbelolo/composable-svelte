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
 * Documents that are written for a consumer, so they have to reach one.
 *
 * `README.md` is deliberately absent: npm packs it regardless of `files`, so
 * requiring it here could only ever produce a false alarm — measured against
 * npm 11.6.0, `files: ["dist","LICENSE"]` still packs the README. CHANGELOG.md
 * gets no such treatment, which is the whole reason this test exists.
 */
const CONSUMER_FACING = ['CHANGELOG.md'];

/**
 * Does `files` cover this document?
 *
 * `files` entries are globs, so a literal `includes` reports a package that
 * ships everything via `*.md` as though it shipped nothing. Only the two forms
 * that occur in practice are handled — an exact name and a `*`-bearing pattern —
 * because a full glob implementation here would be a second thing to get wrong.
 */
function covers(files: string[], doc: string): boolean {
	return files.some((entry) => {
		const pattern = entry.replace(/^\.\//, '');
		if (!pattern.includes('*')) return pattern === doc;
		const source = pattern
			.split('*')
			.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
			.join('[^/]*');
		return new RegExp(`^${source}$`).test(doc);
	});
}

describe('published files', () => {
	it('there are packages to check', () => {
		expect(packages.length).toBeGreaterThan(0);
	});

	it('the glob handling is right', () => {
		// Both halves, because a matcher that says yes to everything is the same
		// as no test at all.
		expect(covers(['dist', 'CHANGELOG.md'], 'CHANGELOG.md')).toBe(true);
		expect(covers(['dist', '*.md'], 'CHANGELOG.md')).toBe(true);
		expect(covers(['dist', './CHANGELOG.md'], 'CHANGELOG.md')).toBe(true);
		expect(covers(['dist', 'LICENSE'], 'CHANGELOG.md')).toBe(false);
		expect(covers(['dist', 'CHANGELOG.mdx'], 'CHANGELOG.md')).toBe(false);
	});

	it.each(packages)('%s ships the documents it maintains', (name) => {
		const pkgDir = join(packagesDir, name);
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
		const files: string[] = pkg.files ?? [];

		// No `files` at all means npm packs everything, which is wasteful but not
		// a lie — the documents do reach the consumer.
		if (pkg.files === undefined) return;

		const missing = CONSUMER_FACING.filter(
			(doc) => existsSync(join(pkgDir, doc)) && !covers(files, doc)
		);

		expect(
			missing,
			`${name} maintains ${missing.join(', ')} but does not list it in "files", ` +
				`so it is written for consumers and shipped to none of them.`
		).toEqual([]);
	});
});
