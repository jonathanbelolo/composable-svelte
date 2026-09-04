/**
 * A package's `dist/` must not be older than its `src/`.
 *
 * Cross-package tests do not exercise source. `@composable-svelte/core/animation`
 * resolves through the exports map to `./dist/`, so every test in chat, media,
 * code and the rest runs against a build artifact. Measured both directions:
 * changing `opacity: [0, 1]` to `opacity: 1` in core's **source** leaves chat's
 * fade tests green; the same edit in core's **dist** turns them red.
 *
 * That is the right thing to test — it is what a consumer installs — but it
 * means a stale `dist` produces a green suite that proves nothing about the code
 * in the diff. `tests/repo/side-effects.test.ts` already refuses to run against a
 * *missing* dist, for the same reason; this is the other half.
 *
 * Deliberately a timestamp comparison rather than a content hash. The question
 * is "was this built after it was last edited", and mtime answers exactly that
 * without needing a build to be reproducible.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { walkFiles, listDirs } from './walk.js';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Newest mtime under `dir`, and the file it belongs to. */
export function newest(dir: string): { at: number; file: string } | null {
	// `worktrees`: see the note in doc-examples.test.ts.
	const { files } = walkFiles(dir, { skip: ['node_modules', 'worktrees'], keep: () => true });

	let best: { at: number; file: string } | null = null;
	for (const file of files) {
		// Still the throwing form's job, but on a path `walkFiles` has already
		// stat-ed successfully — and guarded, because a file can be deleted
		// between the walk and here, and a build artefact vanishing mid-run must
		// not delete this suite.
		const stat = statSync(file, { throwIfNoEntry: false });
		if (!stat) continue;
		if (!best || stat.mtimeMs > best.at) best = { at: stat.mtimeMs, file };
	}
	return best;
}

const packages = listDirs(packagesDir).filter((name) =>
	existsSync(join(packagesDir, name, 'src'))
);

describe('built output is not stale', () => {
	it('found packages, so the arm below is about something', () => {
		// `it.each([])` registers no tests and passes; a `listDirs` that returned
		// nothing would have made this file decorative.
		expect(packages.length).toBeGreaterThan(1);
	});

	it('newest() reads a real mtime and returns null for an empty directory', () => {
		// The positive control for the comparison: a `newest` that always
		// returned null fails the not-null floors, but one that returned the
		// same constant for both sides would pass the comparison forever.
		const src = newest(join(packagesDir, 'core', 'src'));
		expect(src).not.toBeNull();
		expect(src!.at).toBeGreaterThan(0);
		expect(src!.file.startsWith(join(packagesDir, 'core', 'src'))).toBe(true);

		const empty = mkdtempSync(join(tmpdir(), 'dist-freshness-'));
		try {
			expect(newest(empty)).toBeNull();
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	it.each(packages)('%s was built after its sources were last edited', (name) => {
		const pkgDir = join(packagesDir, name);
		const src = newest(join(pkgDir, 'src'));
		const dist = newest(join(pkgDir, 'dist'));

		expect(src, `${name}/src is empty`).not.toBeNull();
		expect(
			dist,
			`${name}/dist is missing — run \`pnpm -r build\`, or every cross-package ` +
				`test that imports ${name} is proving nothing`
		).not.toBeNull();

		// No slack. The original had a second of it, justified by `svelte-package`
		// copying some files with their source mtime — measured on a real build,
		// that does not happen: of 121 files in chat's dist, 26 share a path with
		// a source file and none preserved its mtime. A second of tolerance is a
		// second-wide window in which a genuinely stale build passes.
		expect(
			dist!.at,
			`${name}/dist is older than ${relative(pkgDir, src!.file)} — run ` +
				`\`pnpm -r build\`. Cross-package tests import the built output, so a ` +
				`stale dist means they ran against code that is not in the diff.`
		).toBeGreaterThanOrEqual(src!.at);
	});
});
