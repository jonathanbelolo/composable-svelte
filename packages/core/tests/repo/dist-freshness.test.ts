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
import { readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Newest mtime under `dir`, and the file it belongs to. */
function newest(dir: string): { at: number; file: string } | null {
	if (!existsSync(dir)) return null;

	let best: { at: number; file: string } | null = null;
	const walk = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				// `worktrees`: see the note in doc-examples.test.ts.
				if (['node_modules', 'worktrees'].includes(entry.name)) continue;
				walk(full);
				continue;
			}
			const at = statSync(full).mtimeMs;
			if (!best || at > best.at) best = { at, file: full };
		}
	};
	walk(dir);
	return best;
}

const packages = readdirSync(packagesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'src')))
	.map((e) => e.name);

describe('built output is not stale', () => {
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
