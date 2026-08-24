/**
 * Every test file must actually be inside the config its workspace checks.
 *
 * `tests/repo/check-coverage.test.ts` asserts the `check` *script* is the
 * canonical string. That is not enough, and this repo is the proof: for the
 * whole life of the project `packages/core/tsconfig.test.json` existed, was
 * spelled correctly, added `tests/**` to `include` — and resolved **zero** of
 * core's 123 test files. `extends` *replaces* `include` and `exclude` rather
 * than merging them, so redefining only `include` left the parent's
 * `"**\/*.test.ts"` in `exclude`, which filtered every test straight back out.
 * 42,017 lines were checked by nothing behind a script that looked more
 * thorough than the ones that worked.
 *
 * A byte-comparison of the script could never have caught that. The defect was
 * one layer below, in config resolution, so this asks the compiler itself what
 * the config resolves — `tsc --showConfig` — and compares that against what is
 * on disk. Re-implementing tsconfig resolution here would be a second thing to
 * get wrong, and would not have modelled the `extends` semantics that caused
 * the original defect.
 *
 * Lives in `core` for the same reason `check-coverage` does: it is a repo-level
 * invariant needing a home, and `core` is the only workspace with a
 * node-environment suite. `files: ["dist"]` keeps it out of the tarball.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Directories that hold no source. `__screenshots__` is here for a specific
 * reason: vitest names a screenshot directory after the test file, so it is
 * literally a *directory* called `something.test.ts`. A walk that does not skip
 * it counts phantom test files and reports a coverage gap that is not real.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.svelte-kit', '__screenshots__', 'build']);

/**
 * Test files a config is allowed not to resolve, with the reason.
 *
 * Empty, and the "exemption still exists" arm below is what keeps it that way.
 * It held one entry — `charts/tests/visual/charts.visual.test.ts`, a Playwright
 * suite `pnpm test` never ran — and that suite has since been deleted, because
 * it pointed at a route the styleguide does not have, had `webServer` commented
 * out, and had never produced a baseline image. The arm caught the stale entry
 * in the same change that deleted the file.
 */
const EXEMPT = new Map<string, string>();

function workspaceDirs(): string[] {
	const yaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
	const globs = [...yaml.matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]!);
	expect(globs.length, 'pnpm-workspace.yaml declares no package globs').toBeGreaterThan(0);

	return globs.flatMap((glob) => {
		const [parent, star] = glob.split('/');
		expect(star, `unsupported workspace glob: ${glob}`).toBe('*');
		const parentDir = join(repoRoot, parent!);
		return readdirSync(parentDir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && existsSync(join(parentDir, e.name, 'package.json')))
			.map((e) => `${parent}/${e.name}`);
	});
}

/** Every `*.test.ts` on disk under a workspace, as workspace-relative paths. */
function testFilesOnDisk(dir: string): string[] {
	const root = join(repoRoot, dir);
	const out: string[] = [];

	const walk = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) walk(full);
				continue;
			}
			// `isFile()` rather than the name alone, for the `__screenshots__`
			// reason above — belt and braces, since that directory is also skipped.
			if (entry.name.endsWith('.test.ts') && statSync(full).isFile()) {
				out.push(relative(root, full));
			}
		}
	};

	walk(root);
	return out.sort();
}

/**
 * The config a workspace's `check` script points at. That is the config that
 * gates, so it is the one that has to contain the tests — a `tsconfig.test.json`
 * sitting on disk unreferenced measures nothing.
 */
function checkedConfig(dir: string): string | null {
	const pkgPath = join(repoRoot, dir, 'package.json');
	if (!existsSync(pkgPath)) return null;
	const check = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts?.check as string | undefined;
	if (!check) return null;
	const match = /--tsconfig\s+\.\/(\S+)/.exec(check);
	return match ? match[1]! : null;
}

/** What `tsc` says the config resolves, as workspace-relative paths. */
function resolvedFiles(dir: string, tsconfig: string): string[] {
	const cwd = join(repoRoot, dir);
	const shown = execFileSync(
		'npx',
		['tsc', '--showConfig', '-p', tsconfig],
		{ cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
	);
	const files: string[] = JSON.parse(shown).files ?? [];
	return files.map((f) => relative(cwd, resolve(cwd, f)));
}

const workspaces = workspaceDirs().map((dir) => ({
	dir,
	tests: testFilesOnDisk(dir),
	tsconfig: checkedConfig(dir)
}));

const withTests = workspaces.filter((w) => w.tests.length > 0);

describe('every test file is inside the config its workspace checks', () => {
	it('finds workspaces with tests, so the arms below are not vacuous', () => {
		// The failure this guards against is the one the whole file is about: a
		// check that silently measures nothing still reports success.
		expect(withTests.length, 'no workspace appears to have test files').toBeGreaterThan(5);
	});

	it('every workspace with tests has a check script naming a config', () => {
		const offenders = withTests
			.filter((w) => w.tsconfig === null)
			.map((w) => `${w.dir} (${w.tests.length} test files)`);

		expect(
			offenders,
			'`pnpm -r check` skips a workspace with no check script, silently and ' +
				'with exit 0.'
		).toEqual([]);
	});

	it.each(withTests.filter((w) => w.tsconfig !== null).map((w) => [w.dir, w] as const))(
		'%s resolves all of its test files',
		(dir, w) => {
			const resolved = new Set(resolvedFiles(dir, w.tsconfig!));
			const missing = w.tests
				.filter((t) => !resolved.has(t))
				.filter((t) => !EXEMPT.has(`${dir}/${t}`));

			expect(
				missing,
				`${dir}/${w.tsconfig} does not resolve these test files, so nothing ` +
					`type-checks them. If \`extends\` is in play, remember it *replaces* ` +
					`\`include\`/\`exclude\` rather than merging: redefining one keeps the ` +
					`other, which is how core's config excluded every test it claimed to add.`
			).toEqual([]);
		}
	);

	it('every exemption still exists, so the list cannot rot', () => {
		const stale = [...EXEMPT.keys()].filter((path) => !existsSync(join(repoRoot, path)));

		expect(stale, 'exempted a file that is no longer here').toEqual([]);
	});
});
