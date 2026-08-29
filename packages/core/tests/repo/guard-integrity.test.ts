/**
 * The guards' own preconditions: that they run at all, and that they cannot
 * reacquire the defect just taken out of them.
 *
 * Everything in this directory checks the repository. Nothing checked *them*,
 * and both ways a guard can stop working are silent:
 *
 * - **It is never run.** `vitest.node.config.ts` lists its test files one by
 *   one rather than globbing, so a new guard in this directory simply does not
 *   execute. It sits in the tree looking like coverage, passes review, and
 *   asserts nothing — the failure that leaves no trace at all, since an absent
 *   suite produces no output to notice. This nearly happened to `walk.test.ts`
 *   in the commit that added it.
 * - **It reacquires the walk.** Eleven guards walked the tree with a throwing
 *   `statSync` and `Dirent.isDirectory()`; a dangling symlink deleted every
 *   assertion in a file, and a symlinked directory vanished from every scan.
 *   That is fixed by `walk.ts`, and one copied `readdirSync` puts it back.
 *
 * A source-scanning rule is a blunt instrument, and it is the right one here:
 * the property is syntactic, the whole point is that a *new* file must not do
 * it, and a behavioural test cannot see a file nobody wrote yet.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const guardDir = fileURLToPath(new URL('.', import.meta.url));

/** Every guard in this directory, by file name. */
const guards = walkFiles(guardDir, { keep: (name) => name.endsWith('.test.ts') }).files
	.map((file) => relative(guardDir, file))
	.sort();

const nodeConfig = readFileSync(
	join(repoRoot, 'packages', 'core', 'vitest.node.config.ts'),
	'utf8'
);

/** Source with comments stripped, so a rule reads code and not commentary. */
function code(file: string): string {
	return readFileSync(join(guardDir, file), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^[ \t]*\/\/[^\n]*$/gm, '');
}

describe('the guards are guards', () => {
	it('there are some, so every rule below is about something', () => {
		// The vacuity arm this file cannot do without: if the walk returned
		// nothing, every `flatMap` below is `[]` and the suite is decorative.
		expect(guards.length).toBeGreaterThanOrEqual(11);
	});

	it('includes this file, so the walk reaches the directory it means to', () => {
		expect(guards).toContain('guard-integrity.test.ts');
	});
});

describe('every guard actually runs', () => {
	it('is named in the node config, which lists files rather than globbing', () => {
		// A guard missing from this list is not a weak test, it is no test. The
		// config's `include` is explicit, so nothing else would say so.
		const unlisted = guards.filter((file) => !nodeConfig.includes(`tests/repo/${file}`));

		expect(
			unlisted,
			'these guards exist but never execute — add them to vitest.node.config.ts'
		).toEqual([]);
	});

	it('the config names no guard that is gone', () => {
		// The other direction: a stale entry is a config that lies about its
		// coverage, and vitest does not complain about one that matches nothing.
		const listed = [...nodeConfig.matchAll(/'tests\/repo\/([^']+)'/g)].map((m) => m[1]!);
		const missing = listed.filter((file) => !guards.includes(file));

		expect(missing, 'the node config lists a guard that no longer exists').toEqual([]);
	});
});

/**
 * The two files that may name the raw calls, and why.
 *
 * Registered rather than special-cased in the regex, because an exemption that
 * hides inside a pattern cannot be reviewed and cannot go stale visibly. The
 * arm below checks each one still needs it.
 */
const ALLOWED = new Map([
	[
		'walk.test.ts',
		'its preconditions call the raw forms on purpose, to prove the two defects the helper replaces are real'
	],
	['guard-integrity.test.ts', 'the rules in this file quote both names as regex literals']
]);

const usesReaddir = (file: string) => /\breaddirSync\b/.test(code(file));
const usesThrowingStat = (file: string) =>
	[...code(file).matchAll(/\bstatSync\s*\(([^)]*)\)/g)].some(
		(m) => !m[1]!.includes('throwIfNoEntry')
	);

describe('no guard walks the tree itself', () => {
	// `walk.ts` is the only place allowed to touch these, so the fix cannot be
	// undone one copied line at a time.
	it('none calls readdirSync', () => {
		const offenders = guards.filter((file) => !ALLOWED.has(file) && usesReaddir(file));

		expect(
			offenders,
			'use listDirs or walkFiles from ./walk.js — Dirent.isDirectory() is false for a symlinked directory'
		).toEqual([]);
	});

	it('none calls statSync without suppressing the throw', () => {
		// `throwIfNoEntry: false` is permitted: `dist-freshness` reads an mtime
		// from a path the walk already produced, and that is not a walk.
		const offenders = guards.filter((file) => !ALLOWED.has(file) && usesThrowingStat(file));

		expect(
			offenders,
			'a throwing statSync at module scope deletes every test in the file on one dangling symlink'
		).toEqual([]);
	});

	it('every registered exception still needs one', () => {
		// An exemption that outlives its reason quietly re-permits the thing it
		// was written around. Same arm `export-surface` keeps over its own
		// register, for the same reason.
		const unnecessary = [...ALLOWED.keys()].filter(
			(file) => guards.includes(file) && !usesReaddir(file) && !usesThrowingStat(file)
		);

		expect(unnecessary, 'these no longer call either — drop them from ALLOWED').toEqual([]);
	});

	it('names only guards that exist', () => {
		const missing = [...ALLOWED.keys()].filter((file) => !guards.includes(file));

		expect(missing, 'ALLOWED names a guard that is gone').toEqual([]);
	});

	it('the rules can see a violation when there is one', () => {
		// Non-vacuity, and not optional: both arms above are `filter(...)` over a
		// regex, and a regex that matches nothing passes exactly like a clean
		// tree. `walk.ts` is the file that legitimately contains both, so it is
		// the honest positive control.
		const helper = readFileSync(join(guardDir, 'walk.ts'), 'utf8');

		expect(/\breaddirSync\b/.test(helper), 'the readdirSync rule matches nothing').toBe(true);
		expect(/\bstatSync\s*\(/.test(helper), 'the statSync rule matches nothing').toBe(true);
	});

	it('does not mistake a mention in prose for a call', () => {
		// The paired half: these files discuss `readdirSync` and `statSync` at
		// length in their comments, which is why the rules read stripped source.
		// Without that every guard would be an offender and the arms would fail
		// for the wrong reason.
		const discussed = guards.filter((file) =>
			/readdirSync|statSync/.test(readFileSync(join(guardDir, file), 'utf8'))
		);

		expect(discussed.length, 'no guard mentions either name, so stripping proves nothing').toBeGreaterThan(0);
	});
});
