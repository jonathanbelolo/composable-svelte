/**
 * The shared walk, against a tree built to break the old one.
 *
 * The two defects this replaces have never fired in this repository, because
 * the working tree contains no symlinks. That makes the real tree useless as
 * evidence: a walk tested only against it passes whether or not it handles
 * either case. So the fixture supplies what the repo does not.
 *
 * Both defects are pinned as *preconditions* before anything else runs. They
 * assert the Node semantics the whole fix rests on — that `Dirent.isDirectory()`
 * is false for a link to a directory, and that a bare `statSync` throws on a
 * dangling one. If either stopped being true, every arm below would keep
 * passing while testing nothing, and the precondition is what says so.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { kindOf, listDirs, walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

let root = '';
/**
 * Whether this filesystem let us build the fixture at all.
 *
 * Creating a symlink needs a privilege on Windows that a plain checkout does
 * not have. Rather than fail there for a reason that has nothing to do with the
 * code, the symlink arms skip — and the flag is asserted true on the platforms
 * that do support it, so "skipped everywhere" cannot pass unnoticed.
 */
let symlinksAvailable = false;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'composable-walk-'));

	writeFileSync(join(root, 'a.md'), '# a');
	writeFileSync(join(root, 'ignored.txt'), 'not a doc');

	mkdirSync(join(root, 'real'));
	writeFileSync(join(root, 'real', 'b.md'), '# b');

	mkdirSync(join(root, 'node_modules'));
	writeFileSync(join(root, 'node_modules', 'c.md'), '# c');

	try {
		// A dangling link wearing the extension the caller is looking for: the
		// exact thing that used to throw at import time.
		symlinkSync(join(root, 'nowhere.md'), join(root, 'dangling.md'));
		// A link to a directory holding a file that must still be found.
		symlinkSync(join(root, 'real'), join(root, 'linkdir'));
		// A link to an ancestor, so following links can recurse forever.
		symlinkSync(root, join(root, 'loop'));
		symlinksAvailable = true;
	} catch {
		symlinksAvailable = false;
	}
});

afterAll(() => {
	if (root) rmSync(root, { recursive: true, force: true });
});

const markdown = { keep: (name: string) => name.endsWith('.md'), skip: ['node_modules'] };

describe('the fixture reproduces both defects', () => {
	it('is available on this platform', () => {
		// Not `expect(true)`: on anything but Windows the fixture must exist, so a
		// silent fallback to "skip everything" is itself a failure.
		if (process.platform === 'win32') return;
		expect(symlinksAvailable, 'the fixture could not create symlinks').toBe(true);
	});

	it('Dirent.isDirectory() is false for a linked directory', () => {
		if (!symlinksAvailable) return;
		const entry = readdirSync(root, { withFileTypes: true }).find((e) => e.name === 'linkdir');

		expect(entry, 'the fixture has no linkdir').toBeDefined();
		expect(
			entry!.isDirectory(),
			'readdir now reports linked directories as directories — the defect this guards is gone'
		).toBe(false);
	});

	it('a bare statSync throws on the dangling link', () => {
		if (!symlinksAvailable) return;

		expect(() => statSync(join(root, 'dangling.md'))).toThrow();
	});
});

describe('kindOf', () => {
	it('classifies a real file and a real directory', () => {
		expect(kindOf(join(root, 'a.md'))).toBe('file');
		expect(kindOf(join(root, 'real'))).toBe('dir');
	});

	it('sees through a link to the directory behind it', () => {
		if (!symlinksAvailable) return;
		expect(kindOf(join(root, 'linkdir'))).toBe('dir');
	});

	it('returns null for a dangling link instead of throwing', () => {
		if (!symlinksAvailable) return;
		expect(kindOf(join(root, 'dangling.md'))).toBeNull();
	});

	it('returns null for a path that is not there', () => {
		expect(kindOf(join(root, 'no-such-thing'))).toBeNull();
	});
});

describe('listDirs', () => {
	it('lists real directories', () => {
		expect(listDirs(root)).toContain('real');
	});

	it('lists a linked directory, which Dirent would have hidden', () => {
		if (!symlinksAvailable) return;
		expect(listDirs(root)).toContain('linkdir');
	});

	it('does not list files', () => {
		expect(listDirs(root)).not.toContain('a.md');
	});

	it('returns nothing for a directory that is not there', () => {
		expect(listDirs(join(root, 'no-such-thing'))).toEqual([]);
	});
});

describe('walkFiles', () => {
	it('finds a file at the root', () => {
		expect(walkFiles(root, markdown).files).toContain(join(root, 'a.md'));
	});

	it('applies keep, so unrelated files stay out', () => {
		expect(walkFiles(root, markdown).files).not.toContain(join(root, 'ignored.txt'));
	});

	it('honours skip', () => {
		expect(walkFiles(root, markdown).files).not.toContain(join(root, 'node_modules', 'c.md'));
	});

	it('finds a file inside a linked directory', () => {
		if (!symlinksAvailable) return;
		expect(
			walkFiles(root, markdown).files,
			'a linked directory vanished, exactly as Dirent.isDirectory() made it'
		).toContain(join(root, 'linkdir', 'b.md'));
	});

	it('does not throw on a dangling link', () => {
		if (!symlinksAvailable) return;
		expect(() => walkFiles(root, markdown)).not.toThrow();
	});

	it('reports the dangling link rather than passing over it', () => {
		if (!symlinksAvailable) return;
		// The whole point: a guard that scans less than yesterday must say so.
		expect(walkFiles(root, markdown).unreadable).toContain(join(root, 'dangling.md'));
	});

	it('does not invent paths through a link to an ancestor', () => {
		if (!symlinksAvailable) return;
		// The arm that actually observes the cycle check, and the first version of
		// this test did not. It asserted only that the walk *terminated* — which
		// it does either way, because the OS stops resolving a symlink chain after
		// a few dozen links and `kindOf` turns that into `null`. Removing the
		// check left all 22 arms green.
		//
		// What it really prevents is the descent inventing `root/loop/a.md`,
		// `root/loop/loop/a.md` and so on: forty paths for one file, each of which
		// a guard would report as a violation site that does not exist.
		const found = walkFiles(root, markdown).files.filter((f) => f.endsWith('a.md'));

		expect(found, 'the loop was walked and one file became many paths').toEqual([
			join(root, 'a.md')
		]);
	});

	it('walks both genuine routes to the same directory', () => {
		if (!symlinksAvailable) return;
		// Deliberately not deduplicated by real path. `real/` and `linkdir/` are
		// two true names for one directory and both are reported, because a
		// visited-set would drop whichever came second — for a symlinked package
		// that means the guard stops scanning the real directory because it
		// happened to see the link first.
		const found = walkFiles(root, markdown).files.filter((f) => f.endsWith('b.md'));

		expect(found).toEqual([join(root, 'linkdir', 'b.md'), join(root, 'real', 'b.md')]);
	});

	it('returns nothing for a root that is not a directory', () => {
		expect(walkFiles(join(root, 'a.md'), markdown)).toEqual({ files: [], unreadable: [] });
	});
});

describe('the real repository', () => {
	it('has nothing unreadable under the roots the guards scan', () => {
		// The arm that turns a future dangling symlink into a red test instead of
		// a suite that quietly shrinks. It is also why `unreadable` is returned
		// rather than swallowed.
		const roots = ['packages', '.claude', 'guides', 'examples'];
		const skip = ['node_modules', 'dist', '.svelte-kit', 'worktrees'];

		const unreadable = roots.flatMap(
			(dir) => walkFiles(join(repoRoot, dir), { skip, keep: () => true }).unreadable
		);

		expect(unreadable, 'these paths cannot be classified — a broken symlink?').toEqual([]);
	});

	it('finds the documents the guards rely on, so the arm above is not vacuous', () => {
		const { files } = walkFiles(join(repoRoot, 'packages'), {
			skip: ['node_modules', 'dist', '.svelte-kit', 'worktrees'],
			keep: (name) => name.endsWith('.md')
		});

		expect(files.length).toBeGreaterThan(5);
	});
});
