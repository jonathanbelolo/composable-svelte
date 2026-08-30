/**
 * Every documented example that names this library must typecheck against it.
 *
 * The mechanism, the scope and the limits are in `doc-typecheck.ts`. This file
 * is the register and the arms.
 *
 * `REGISTER` holds the errors that existed when the guard landed, so the count
 * could not grow while they were being fixed. It is keyed by document, code and
 * message rather than by line, so editing a document does not churn it, and a
 * document that swaps one error for another is caught rather than covered.
 *
 * The register is meant to reach zero and stay there. Both directions are
 * checked: an unregistered error fails, and a registered error that no longer
 * happens fails too — an exemption that outlives its cause quietly re-permits
 * the thing it was written around.
 */

import { describe, it, expect } from 'vitest';

import { checkDocs, keyOf, type Finding } from './doc-typecheck.js';

/**
 * Errors present when this guard was written, with the count for each.
 *
 * Every entry is a real false claim about the API, not a tolerated wart. They
 * are listed rather than fixed-in-one-go so that the guard could land first:
 * 86 corrections across 28 documents is a long change, and without the register
 * the 87th could have arrived while it was in progress.
 */
const REGISTER = new Map<string, number>([
	['packages/core/docs/navigation/tree-based.md :: TS2339 :: Property \'type\' does not exist on type \'never\'.', 1],
	['packages/core/docs/routing/url-sync.md :: TS2339 :: Property \'itemId\' does not exist on type \'{}\'.', 2],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2339 :: Property \'id\' does not exist on type \'Node\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2339 :: Property \'type\' does not exist on type \'{}\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2339 :: Property \'state\' does not exist on type \'{}\'.', 1],
	['packages/core/docs/core-concepts/testing.md :: TS2345 :: Argument of type \'(state: any, action: any, deps: any) => any[]\' is not assignable to parameter of type \'Reducer<any, any, any>\'.   Type \'any[]\' is not assignable to type \'readonly [any, Effect<any>]\'.     Target requires 2 element(s) but source may have fewer.', 1],
	['packages/core/docs/core-concepts/testing.md :: TS2554 :: Expected 5 arguments, but got 6.', 1],
]);

const result = checkDocs();
/**
 * Findings from blocks the prose does *not* mark as counter-examples.
 *
 * A troubleshooting document shows the broken form, then the fix, then why.
 * Reporting the broken half as a defect pushes a writer to delete the thing that
 * makes the pair useful, so those are held separately — and asserted still to
 * fail, below.
 */
const findings: Finding[] = result.findings.filter((f) => !f.counterExample);
const counterExamples: Finding[] = result.findings.filter((f) => f.counterExample);

const tally = (list: Finding[]): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const finding of list) counts.set(keyOf(finding), (counts.get(keyOf(finding)) ?? 0) + 1);
	return counts;
};

const current = tally(findings);

/** A line that can be pasted straight into REGISTER, so burning it down is mechanical. */
const asRegisterEntry = (key: string, count: number) =>
	`\t['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', ${count}],`;

describe('the check itself', () => {
	it('found documents with examples in them', () => {
		// The vacuity arm. Every assertion below is over `findings`, and an
		// extraction that silently matched nothing would satisfy all of them.
		expect(result.blocks.length, 'no documented examples were found at all').toBeGreaterThan(200);
	});

	it('checked both kinds of fence', () => {
		const kinds = new Set(result.blocks.map((block) => block.kind));

		expect(kinds.has('ts'), 'no TypeScript blocks were extracted').toBe(true);
		expect(kinds.has('svelte'), 'no Svelte script bodies were extracted').toBe(true);
	});

	it('ran against a built library', () => {
		// Without `dist` every import resolves to nothing, which produces a
		// different error entirely and would make the whole guard meaningless.
		expect(
			result.unbuilt,
			`these packages have no dist — run \`pnpm -r build\` before this guard:\n  ${result.unbuilt.join('\n  ')}`
		).toEqual([]);
	});

	it('reports far less than it sees, which is the point', () => {
		// The filter is what makes this adoptable: most diagnostics in a doc
		// excerpt are `Cannot find name 'store'`, which is what an excerpt is.
		// If the surface codes ever matched most of the noise, the guard would
		// have become a blanket typecheck and would need re-thinking, not
		// silencing.
		expect(result.total, 'nothing was compiled').toBeGreaterThan(100);
		expect(findings.length).toBeLessThan(result.total / 4);
	});
});

describe('documented examples match the library', () => {
	it('report no error that is not registered', () => {
		const unregistered: string[] = [];
		for (const [key, count] of current) {
			const allowed = REGISTER.get(key) ?? 0;
			if (count > allowed) {
				const finding = findings.find((f) => keyOf(f) === key)!;
				unregistered.push(
					`${finding.file}:${finding.line}  TS${finding.code}  ${finding.message}` +
						(allowed > 0 ? `  [${count} now, ${allowed} registered]` : '') +
						`\n    ${asRegisterEntry(key, count)}`
				);
			}
		}

		expect(
			unregistered,
			`documented examples make claims the library does not support.\n` +
				`Fix the document — read the real signature from the package's dist/*.d.ts.\n\n` +
				unregistered.join('\n\n')
		).toEqual([]);
	});

	it('leave no registered error that has been fixed', () => {
		const stale: string[] = [];
		for (const [key, count] of REGISTER) {
			const now = current.get(key) ?? 0;
			if (now < count) stale.push(`${key}  [registered ${count}, now ${now}]`);
		}

		expect(
			stale,
			'these are fixed — delete them from REGISTER, or lower the count:\n' + stale.join('\n')
		).toEqual([]);
	});

	it('still demonstrate what they claim to — every one of them', () => {
		// Per block, not in aggregate. Marking is an *opt-out from checking*, so
		// a marked block that produces no error is exempt for nothing: either it
		// was fixed and the marker should go, or the marker is being used to
		// silence a block that was never a counter-example. A total-count arm
		// cannot tell the difference — one block still failing would carry the
		// assertion for all of them.
		const demonstrating = new Set(counterExamples.map((f) => `${f.file}:${f.line}`));
		const idle = result.blocks
			.filter((b) => b.counterExample)
			.map((b) => `${b.file}:${b.line}`)
			.filter((where) => !demonstrating.has(where));

		expect(
			[...new Set(idle)],
			'these blocks are marked **Problem** or ❌ but compile cleanly — drop the marker, or they are exempt from checking for no reason:\n' +
				idle.join('\n')
		).toEqual([]);
	});

	it('name only documents that still exist', () => {
		const files = new Set(result.blocks.map((block) => block.file));
		const gone = [...REGISTER.keys()]
			.map((key) => key.split(' :: ')[0]!)
			.filter((file) => !files.has(file));

		expect([...new Set(gone)], 'REGISTER names a document with no examples in it').toEqual([]);
	});
});
