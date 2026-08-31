/**
 * A skill's markup examples must be the ones a compiler actually reads.
 *
 * `doc-typecheck` compiles the `<script>` body of a `svelte` fence and says so
 * in its own header — markup expressions are out of scope. That gap is not
 * theoretical: `composable-svelte-auth` shipped a `bind:value` on
 * `PasswordInput`, whose `value` is deliberately not `$bindable()`, and no
 * guard in this directory could have caught it.
 *
 * The answer was to copy the component examples into a `.svelte` fixture that
 * `svelte-check` reads. But a copy is only evidence while it is still a copy —
 * and within one session the two had already drifted, the skill using a
 * fictional `<AdminPanel />` the fixture had replaced with a paragraph. A
 * snapshot nobody compares is a snapshot that rots, so this compares them.
 *
 * It checks *markup*, not the script blocks: those are `doc-typecheck`'s half
 * of the same job, and requiring the imports to match too would force the
 * fixture to invent a store for every fence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Skills whose `svelte` fences are pinned by a typechecked fixture. */
const PINNED = [
	{
		skill: '.claude/skills/composable-svelte-auth/SKILL.md',
		fixture: 'packages/auth/tests/test-components/SkillExamples.svelte'
	}
];

/** Whitespace-insensitive, so tabs-versus-spaces is not a finding. */
export function normalise(source: string): string {
	return source.replace(/\s+/g, ' ').trim();
}

/**
 * The markup of every `svelte` fence, with its `<script>` block removed.
 *
 * A fence with no markup left — imports only — yields nothing to compare and is
 * dropped rather than counted as a vacuous pass.
 */
export function fenceMarkup(document: string): string[] {
	return [...document.matchAll(/```svelte\n([\s\S]*?)```/g)]
		.map((match) => match[1]!.replace(/<script[\s\S]*?<\/script>/g, ''))
		.map(normalise)
		.filter((markup) => markup.length > 0);
}

describe('the check itself', () => {
	it('points at files that exist', () => {
		for (const { skill, fixture } of PINNED) {
			expect(existsSync(join(repoRoot, skill)), skill).toBe(true);
			expect(existsSync(join(repoRoot, fixture)), fixture).toBe(true);
		}
	});

	it('extracts markup and drops the script', () => {
		// The vacuity arm, and the positive control. An extractor that returned
		// nothing would satisfy every assertion below.
		const document = '```svelte\n<script>import X from "y";</script>\n<X a={1} />\n```';

		expect(fenceMarkup(document)).toEqual(['<X a={1} />']);
		expect(fenceMarkup('```svelte\n<script>const a = 1;</script>\n```')).toEqual([]);
		expect(fenceMarkup('no fences here')).toEqual([]);
	});

	it('found fences to compare', () => {
		for (const { skill } of PINNED) {
			const fences = fenceMarkup(readFileSync(join(repoRoot, skill), 'utf8'));
			expect(fences.length, `${skill} yielded no markup`).toBeGreaterThan(0);
		}
	});
});

describe('every pinned skill', () => {
	it('has each markup example present in its fixture', () => {
		const drifted: string[] = [];

		for (const { skill, fixture } of PINNED) {
			const haystack = normalise(readFileSync(join(repoRoot, fixture), 'utf8'));
			for (const markup of fenceMarkup(readFileSync(join(repoRoot, skill), 'utf8'))) {
				if (!haystack.includes(markup)) {
					drifted.push(`${skill}\n    ${markup.slice(0, 160)}`);
				}
			}
		}

		expect(
			drifted,
			'these markup examples are not in the fixture that typechecks them, so ' +
				'nothing is verifying they compile. Copy them across verbatim'
		).toEqual([]);
	});
});
