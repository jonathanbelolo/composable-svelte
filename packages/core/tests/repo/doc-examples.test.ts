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

/**
 * Every documented call to a dismiss-dependency factory, checked against the
 * real signatures.
 *
 * All three take the parent's **dispatch** first and an action **wrapper**
 * second (`dismissDependency` takes the action field name instead). Passing a
 * store, or a string where the wrapper goes, throws
 * `TypeError: actionWrapper is not a function` at execute time — and until the
 * captured dispatch was actually used, passing the wrong thing first was
 * silently harmless, which is how six documented sites drifted.
 *
 * `docs/api/reference.md` had gone further and documented an API that never
 * existed: a one-argument form, a `DismissDependency<Action>` type parameter,
 * and `deps.dismiss.dismiss(dispatch)` on what is a plain function.
 */
describe('documented dismiss dependency call shapes', () => {
	const calls = blocks.flatMap((b) => {
		const out: Array<{ where: string; fn: string; first: string; second: string }> = [];
		const names = [
			'createDismissDependencyWithCleanup',
			'createDismissDependency',
			'dismissDependency'
		];

		for (let i = 0; i < b.body.length; i += 1) {
			const name = names.find(
				(n) => b.body.startsWith(n, i) && !/[A-Za-z0-9_$]/.test(b.body[i - 1] ?? '')
			);
			if (!name) continue;

			let j = i + name.length;
			while (j < b.body.length && /\s/.test(b.body[j]!)) j += 1;
			if (b.body[j] !== '(') {
				i = j;
				continue;
			}

			// Balanced scan to the matching close paren — the arguments here are
			// arrow functions and object literals, so a regex cannot find the end.
			let depth = 0;
			let k = j;
			for (; k < b.body.length; k += 1) {
				const ch = b.body[k]!;
				if ('([{'.includes(ch)) depth += 1;
				else if (')]}'.includes(ch)) {
					depth -= 1;
					if (depth === 0) break;
				}
			}
			const args = b.body.slice(j + 1, k);

			// Split on top-level commas only.
			const parts: string[] = [];
			let d = 0;
			let cur = '';
			for (const ch of args) {
				if ('([{'.includes(ch)) d += 1;
				if (')]}'.includes(ch)) d -= 1;
				if (ch === ',' && d === 0) {
					parts.push(cur.trim());
					cur = '';
					continue;
				}
				cur += ch;
			}
			if (cur.trim()) parts.push(cur.trim());

			// Skip commented-out lines: they are prose, not a call.
			const lineStart = b.body.lastIndexOf('\n', i) + 1;
			const prefix = b.body.slice(lineStart, i);
			if (/^\s*(\/\/|\*)/.test(prefix)) {
				i = k;
				continue;
			}

			out.push({
				where: `${b.file}:${b.line}`,
				fn: name,
				first: (parts[0] ?? '').replace(/\s+/g, ' '),
				second: (parts[1] ?? '').replace(/\s+/g, ' ')
			});
			i = k;
		}
		return out;
	});

	it('finds the documented calls at all', () => {
		// Guards the regex: if it stops matching, the arms below pass vacuously.
		expect(calls.length).toBeGreaterThan(5);
	});

	it('passes a dispatch first, never a store', () => {
		const offenders = calls
			.filter((c) => /store\b/i.test(c.first) && !/=>/.test(c.first) && !/\.dispatch\b/.test(c.first))
			.map((c) => `${c.where} ${c.fn}(${c.first}, …)`);

		expect(
			offenders,
			'the first argument is the parent dispatch, not the store. Pass ' +
				'`(action) => dispatch(action)`.'
		).toEqual([]);
	});

	it('passes a wrapper function second, never the action field name', () => {
		// `dismissDependency` is the one that takes a field name; the other two
		// take a function that wraps a PresentationAction into a parent action.
		const offenders = calls
			.filter((c) => c.fn !== 'dismissDependency')
			.filter((c) => c.second !== '' && /^['"`]/.test(c.second))
			.map((c) => `${c.where} ${c.fn}(…, ${c.second})`);

		expect(
			offenders,
			'a string here throws `actionWrapper is not a function` at execute ' +
				'time. Either pass a wrapper, or use `dismissDependency`, which ' +
				'takes the field name.'
		).toEqual([]);
	});

	it('never calls the one-argument form', () => {
		const offenders = calls
			.filter((c) => c.second === '' && c.first !== '')
			.map((c) => `${c.where} ${c.fn}(${c.first})`);

		expect(
			offenders,
			'all three factories require at least a dispatch and a wrapper or ' +
				'field name; the one-argument form leaves `actionWrapper` undefined.'
		).toEqual([]);
	});

	it('returns the dismiss effect rather than discarding it', () => {
		const offenders = blocks
			.filter((b) => /deps\.dismiss\s*\(\s*\)\s*;/.test(b.body))
			.map((b) => `${b.file}:${b.line}`);

		expect(
			offenders,
			'`deps.dismiss()` IS the effect. Calling it as a statement and ' +
				'returning `Effect.none()` discards the dismiss entirely.'
		).toEqual([]);
	});
});

