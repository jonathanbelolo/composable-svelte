/**
 * The filesystem walk the repo guards share.
 *
 * Not a tidying exercise. Every guard in this directory walked the tree itself,
 * and each copy carried the same two defects:
 *
 * - **A throwing `statSync` inside a module-scope walk.** These walks run at
 *   *import* time, so one dangling symlink makes the whole file fail to
 *   **collect**. Every test in it ceases to exist and the suite still reports
 *   green — no vacuity arm can fire, because a file cannot guard its own
 *   existence. That was the shape in five guards.
 * - **`Dirent.isDirectory()` is false for a symlinked directory.** `readdir`
 *   reports a symlink as a symlink, so a linked directory fell through to the
 *   name check, failed it, and vanished with no message. Every guard decided
 *   directory-ness this way.
 *
 * Neither has ever fired: the working tree has no symlinks. They are fixed
 * because the failure mode is a guard that stops guarding without saying so,
 * which is the thing this whole campaign exists to prevent.
 *
 * The design follows from that. `kindOf` never throws, so the filesystem cannot
 * delete a test file; it stats *through* symlinks, so a linked directory is
 * seen; and `walkFiles` returns what it could not classify rather than
 * swallowing it, so a dangling link makes a guard **fail loudly** instead of
 * quietly scanning less. Silence is the enemy, not errors.
 *
 * This file is deliberately not `*.test.ts`: the node config's `include` is an
 * explicit list, and a helper is not a guard.
 */

import { readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** What a path turned out to be, or `null` if the filesystem would not say. */
export type Kind = 'file' | 'dir' | null;

/**
 * Classify a path, following symlinks, without ever throwing.
 *
 * `throwIfNoEntry: false` alone is not enough: it suppresses `ENOENT` and
 * nothing else, so a self-referential link still throws `ELOOP` and a
 * permission error still propagates. A guard must not be deletable by anything
 * on disk, so every failure becomes `null` and the caller decides.
 *
 * Returns `null` for a dangling symlink, a path that disappeared between
 * `readdir` and here, and for anything that is neither a file nor a directory.
 */
export function kindOf(path: string): Kind {
	try {
		const stats = statSync(path, { throwIfNoEntry: false });
		if (!stats) return null;
		if (stats.isDirectory()) return 'dir';
		if (stats.isFile()) return 'file';
		return null;
	} catch {
		return null;
	}
}

/**
 * The child directories of `parent`, by name, sorted.
 *
 * Decided by `kindOf` rather than `Dirent.isDirectory()`, so a symlinked
 * package directory is listed instead of silently disappearing. Returns `[]`
 * rather than throwing when `parent` does not exist.
 */
export function listDirs(parent: string): string[] {
	let entries: string[];
	try {
		entries = readdirSync(parent);
	} catch {
		return [];
	}

	return entries.filter((name) => kindOf(join(parent, name)) === 'dir').sort();
}

export interface WalkResult {
	/** Every matching file found, sorted, as absolute paths. */
	files: string[];
	/**
	 * Paths the filesystem would not classify — a dangling symlink, a directory
	 * that could not be read. Carried out rather than swallowed so a guard can
	 * assert on it: an unreadable path should make a suite **fail**, not make it
	 * quietly scan less than it did yesterday.
	 */
	unreadable: string[];
}

/**
 * Every file under `root` whose name passes `keep`.
 *
 * `skip` names directories to leave unvisited, by basename — `node_modules`,
 * `dist`, `worktrees` and friends. It does not apply to files; no caller has
 * ever needed that, and a name-based file filter is what `keep` is.
 *
 * Symlinked directories *are* followed, because a guard's job is to see the
 * source and a linked directory is source. That makes cycles reachable, so a
 * directory already on the current branch — by real path, so a link and its
 * target count as one — is not entered again.
 *
 * Be exact about what that buys, because the obvious claim is wrong: the walk
 * does **not** recurse forever without it. The operating system gives up
 * resolving a symlink chain after a few dozen links and `kindOf` turns the
 * resulting `ELOOP` into `null`, so the descent always ends. What the check
 * prevents is the *garbage on the way down*: a link to an ancestor otherwise
 * yields `root/loop/a.md`, `root/loop/loop/a.md` and so on, forty invented
 * paths for one file, each of which a guard would then report as a violation
 * site that does not exist. Measured, not assumed — removing the check leaves
 * every arm here green except the one that counts those paths.
 *
 * It is deliberately a *branch* check and not a visited-set: two genuine routes
 * to one directory are both walked, and the same file is reported under each
 * name it really has. Deduplicating by real path instead would silently drop
 * whichever route came second, which for a symlinked package directory means
 * the guard stops scanning the real one because it saw the link first.
 */
export function walkFiles(
	root: string,
	opts: { skip?: Iterable<string>; keep: (name: string) => boolean }
): WalkResult {
	const skip = new Set(opts.skip ?? []);
	const files: string[] = [];
	const unreadable: string[] = [];
	// Directories on the current branch, by real path. Not a visited-set: see
	// the note above for why the difference matters.
	const branch = new Set<string>();

	const walk = (dir: string): void => {
		let real: string;
		try {
			real = realpathSync(dir);
		} catch {
			unreadable.push(dir);
			return;
		}
		if (branch.has(real)) return;
		branch.add(real);

		// `finally`, not a line at the end: an unreadable directory returns early,
		// and leaving its entry behind would make a *later* legitimate visit to
		// the same directory look like a cycle and be skipped — a silent
		// under-scan introduced by the thing preventing silent under-scans.
		try {
			let entries: string[];
			try {
				entries = readdirSync(dir);
			} catch {
				unreadable.push(dir);
				return;
			}

			for (const name of entries) {
				const full = join(dir, name);
				const kind = kindOf(full);

				if (kind === 'dir') {
					if (!skip.has(name)) walk(full);
					continue;
				}
				if (kind === 'file') {
					if (opts.keep(name)) files.push(full);
					continue;
				}
				// Neither, and the filesystem would not say why. Only worth
				// reporting for something the caller wanted: an unrelated broken
				// link beside the files under test is noise, a broken link *where a
				// source file should be* is what used to delete this suite.
				if (opts.keep(name)) unreadable.push(full);
			}
		} finally {
			branch.delete(real);
		}
	};

	if (kindOf(root) === 'dir') walk(root);

	return { files: files.sort(), unreadable: unreadable.sort() };
}
