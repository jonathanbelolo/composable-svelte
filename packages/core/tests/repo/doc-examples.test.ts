/**
 * The two ways a documented `TestStore` example has failed, both pinned.
 *
 * Every `TestStore` example in this repo's markdown has been broken at some
 * point, twice for reasons a reader only discovers by running it:
 *
 * 1. Driving `createMockStreamingChat()`, which fakes a realistic reply — a
 *    300ms lead-in then a word every 50ms — while `receive` times out after one
 *    second and `finish()` refuses to pass with any dispatched action
 *    unasserted.
 * 2. Registering `vi.useFakeTimers()` in a hook and then doing the work at
 *    module scope, outside any `it()`, so the hook never runs. The example looks
 *    right and cannot pass.
 *
 * The second of those used to be "calling `finish()` without fake timers at
 * all", which threw. That was a defect in `advanceTime`, not in twenty-one
 * documented examples, and it is fixed there instead — `finish()` no longer
 * needs a faked clock.
 *
 * A claim that "the documents quote a test file, so they cannot rot" was made
 * and was false: nothing in any suite read a `.md`. This does.
 *
 * Deliberately two specific traps rather than an attempt to execute the
 * snippets. Running arbitrary markdown is a much larger machine, and these are
 * the failures that actually happened.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every markdown file that documents this library, wherever it lives. */
function docs(): string[] {
	const roots = [join(repoRoot, 'packages'), join(repoRoot, '.claude'), join(repoRoot, 'guides')];
	const out: string[] = [];

	const walk = (dir: string) => {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (['node_modules', 'dist', '.svelte-kit'].includes(entry.name)) continue;
				walk(full);
				continue;
			}
			if (entry.name.endsWith('.md') && statSync(full).isFile()) out.push(full);
		}
	};

	roots.forEach(walk);
	return out;
}

/** Fenced code blocks, with the file and the line the fence opened on. */
function codeBlocks(file: string): Array<{ line: number; body: string }> {
	const lines = readFileSync(file, 'utf8').split('\n');
	const blocks: Array<{ line: number; body: string }> = [];

	let open: { line: number; body: string[] } | null = null;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (open) {
			if (/^\s*```\s*$/.test(line)) {
				blocks.push({ line: open.line, body: open.body.join('\n') });
				open = null;
			} else {
				open.body.push(line);
			}
			continue;
		}
		if (/^\s*```(ts|typescript|js|javascript|svelte)\b/.test(line)) {
			open = { line: i + 1, body: [] };
		}
	}
	return blocks;
}

const blocks = docs().flatMap((file) =>
	codeBlocks(file).map((block) => ({ ...block, file: relative(repoRoot, file) }))
);

/** Blocks that drive a TestStore — the only ones these rules apply to. */
const testStoreBlocks = blocks.filter(
	(b) => /\bnew TestStore\b|\bcreateTestStore\s*\(/.test(b.body)
);

describe('documented TestStore examples', () => {
	it('finds some, so the rules below are not vacuous', () => {
		expect(testStoreBlocks.length).toBeGreaterThan(0);
	});

	it('never drive one with a mock that streams on a real clock', () => {
		const offenders = testStoreBlocks
			.filter((b) => /createMockStreamingChat\s*\(/.test(b.body))
			.map((b) => `${b.file}:${b.line}`);

		expect(
			offenders,
			'`createMockStreamingChat()` fakes a multi-second reply; `receive` times ' +
				'out after 1s and `finish()` refuses unasserted actions, so this example ' +
				'cannot pass. Hand the callbacks out from your own fake instead.'
		).toEqual([]);
	});

	it('put the assertions inside an it(), so the hooks apply', () => {
		// The failure this catches is subtle: the hook is registered, so the
		// example *looks* right, but everything runs at module scope before any
		// hook fires.
		const offenders = testStoreBlocks
			.filter((b) => /vi\.useFakeTimers\s*\(/.test(b.body))
			.filter((b) => !/\bit\s*\(/.test(b.body))
			.map((b) => `${b.file}:${b.line}`);

		expect(
			offenders,
			'this example registers a timer hook and then runs at module scope, where ' +
				'no hook has fired yet.'
		).toEqual([]);
	});
});
