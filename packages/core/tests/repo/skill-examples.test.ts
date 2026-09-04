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
import { listDirs } from './walk.js';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Skills whose `svelte` fences are pinned by typechecked fixtures. More than
 * one where a single component cannot hold every fence: ssr documents two
 * `<svelte:head>` blocks and Svelte allows one per component.
 */
const PINNED = [
	{ skill: '.claude/skills/composable-svelte-auth/SKILL.md', fixtures: ['packages/auth/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', fixtures: ['packages/charts/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-chat/SKILL.md', fixtures: ['packages/chat/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-code/SKILL.md', fixtures: ['packages/code/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', fixtures: ['packages/graphics/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-maps/SKILL.md', fixtures: ['packages/maps/tests/test-components/SkillExamples.svelte'] },
	{ skill: '.claude/skills/composable-svelte-media/SKILL.md', fixtures: ['packages/media/tests/test-components/SkillExamples.svelte'] },
	// Skills about core, pinned by fixtures in core's own test tree.
	{ skill: '.claude/skills/composable-svelte/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-umbrella.svelte'] },
	{ skill: '.claude/skills/composable-svelte-components/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-components.svelte'] },
	{ skill: '.claude/skills/composable-svelte-core/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-core.svelte'] },
	{ skill: '.claude/skills/composable-svelte-deployment/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-deployment.svelte'] },
	{ skill: '.claude/skills/composable-svelte-forms/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-forms.svelte'] },
	{ skill: '.claude/skills/composable-svelte-i18n/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-i18n.svelte'] },
	{ skill: '.claude/skills/composable-svelte-navigation/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-navigation.svelte'] },
	{ skill: '.claude/skills/composable-svelte-ssr/SKILL.md', fixtures: ['packages/core/tests/test-components/SkillExamples-ssr.svelte', 'packages/core/tests/test-components/SkillExamples-ssr-pitfall.svelte'] }
];

/**
 * Fence markup a clean fixture cannot hold as live markup. Some does not parse
 * at all — runes, functions and `import` statements outside any `<script>`,
 * JS `//` comments as markup; some parses but cannot typecheck against the
 * real components — literal `...` placeholder attributes, "Future API" props
 * no component declares. Each entry is a real documentation defect
 * (AUDIT-2026-09-03-FINDINGS DA-X2). R4 fixes the skill; the staleness arm
 * below deletes the entry the day the fence is live in its fixture. Keyed by
 * skill and the first 72 normalised characters of the fence, so an edit
 * beyond that prefix stays exempt until the entry is re-keyed.
 */
const NOT_COMPILED: ReadonlyArray<{ skill: string; startsWith: string }> = [
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', startsWith: '<div class="chart-container"> <Chart store={chartStore} ... /> </div> <s' },
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', startsWith: 'let chartWidth = $state(800); $effect(() => { const updateWidth = () => ' },
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', startsWith: '<Chart store={chartStore1} ... onSelectionChange={syncSelection} /> <Cha' },
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', startsWith: '<input type="range" bind:value={minValue} min="0" max="100" /> <input ty' },
	{ skill: '.claude/skills/composable-svelte-charts/SKILL.md', startsWith: '<Chart store={chartStore} enableAnimations={false} ... />' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: 'import { createStore } from \'@composable-svelte/core\'; import { Scene, C' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// 3 meshes = 3 draw calls <Mesh id="obj1" ... /> <Mesh id="obj2" ... />' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// 1000 meshes = 1000 draw calls (very slow!) {#each items as item} <Mes' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// Update rotation only when button clicked let rotation = $state(0); fu' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// Updates every frame (60 FPS) - expensive! let time = $state(0); setIn' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: 'let rotation = $state(0); function rotateObject() { rotation += Math.PI ' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: 'let cameraDistance = $state(12); function zoomIn() { cameraDistance = Ma' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: 'let lightIntensity = $state(1.0); function adjustBrightness(delta: numbe' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: 'let showObject = $state(true); // Option 1: Conditional rendering {#if s' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// Future API <Mesh id="textured" geometry={{ type: \'box\', size: 1 }} ma' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// Future API <Mesh {store} id="animated" geometry={{ type: \'box\', size:' },
	{ skill: '.claude/skills/composable-svelte-graphics/SKILL.md', startsWith: '// Future API <Scene {store} postProcessing={{ bloom: { enabled: true, i' },
	{ skill: '.claude/skills/composable-svelte-maps/SKILL.md', startsWith: 'let showLayer = $state(true); $effect(() => { if (showLayer) { mapStore.' },
];

/** A skill's fixtures, read as one haystack. */
const fixtureText = (fixtures: readonly string[]): string =>
	fixtures.map((fixture) => readFileSync(join(repoRoot, fixture), 'utf8')).join('\n');

const registered = (skill: string, markup: string): boolean =>
	NOT_COMPILED.some((e) => e.skill === skill && markup.startsWith(e.startsWith));

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

/**
 * The fence markup a fixture does not carry as live, typechecked markup.
 *
 * HTML comments are stripped from both sides: a fence copied into a fixture
 * `<!-- -->` satisfies a substring match and compiles nothing, which is how
 * the fences a fixture cannot hold were first "pinned". The fixture's own
 * `<script>` is stripped too: a fence quoted in a JSDoc or a template literal
 * there would satisfy the match and compile nothing, the same way. Pure, so
 * the positive control drives the real comparison.
 */
export function missingMarkup(skillText: string, fixtureText: string): string[] {
	// Stripped from both sides: the skills' own fences carry comments
	// (<!-- WRONG -->) that a fixture reproduces verbatim, so stripping the
	// fixture alone made every such fence unmatchable.
	const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '');
	const withoutScript = (text: string) => text.replace(/<script[\s\S]*?<\/script>/g, '');
	const haystack = normalise(withoutComments(withoutScript(fixtureText)));
	return fenceMarkup(withoutComments(skillText)).filter((markup) => !haystack.includes(markup));
}

describe('the check itself', () => {
	it('points at files that exist', () => {
		for (const { skill, fixtures } of PINNED) {
			expect(existsSync(join(repoRoot, skill)), skill).toBe(true);
			for (const fixture of fixtures) expect(existsSync(join(repoRoot, fixture)), fixture).toBe(true);
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

	it('reports drifted markup and accepts identical markup', () => {
		// The positive control for the comparison itself, not only the extractor.
		const skill = '```svelte\n<Button size="lg">Go</Button>\n```';
		expect(missingMarkup(skill, '<div>\n  <Button   size="lg">Go</Button>\n</div>')).toEqual([]);
		expect(missingMarkup(skill, '<div><Button size="sm">Go</Button></div>')).toEqual(['<Button size="lg">Go</Button>']);
		// Quoted inside the fixture's script: not live markup, so still missing.
		expect(
			missingMarkup(skill, '<script>\n// <Button size="lg">Go</Button>\n</script>\n<p />')
		).toEqual(['<Button size="lg">Go</Button>']);
	});

	it('pins every skill that ships markup', () => {
		// Disk to register, the direction the rot travels: a new skill with
		// svelte fences must be pinned on the day it is added.
		const skillsDir = join(repoRoot, '.claude/skills');
		const withMarkup = listDirs(skillsDir)
			.map((name) => `.claude/skills/${name}/SKILL.md`)
			.filter((rel) => existsSync(join(repoRoot, rel)))
			.filter((rel) => fenceMarkup(readFileSync(join(repoRoot, rel), 'utf8')).length > 0);
		const pinned = new Set(PINNED.map((p) => p.skill));

		expect(
			withMarkup.filter((rel) => !pinned.has(rel)),
			'these skills have svelte fences with markup and no fixture pins them'
		).toEqual([]);
	});
});

describe('every pinned skill', () => {
	it('has each markup example present in its fixture', () => {
		const drifted: string[] = [];

		for (const { skill, fixtures } of PINNED) {
			for (const markup of missingMarkup(readFileSync(join(repoRoot, skill), 'utf8'), fixtureText(fixtures))) {
				if (registered(skill, markup)) continue;
				drifted.push(`${skill}\n    ${markup.slice(0, 160)}`);
			}
		}

		expect(
			drifted,
			'these markup examples are not live in the fixture that typechecks them, so ' +
				'nothing is verifying they compile. Copy them across verbatim — or, if the ' +
				'fence is not valid Svelte, fix the skill or register it in NOT_COMPILED with its finding'
		).toEqual([]);
	});

	it('keeps NOT_COMPILED current', () => {
		// An entry whose fence is now live, or gone, is a permanent licence for a
		// broken example under that text. Same arm every register in this
		// directory keeps.
		const stale = NOT_COMPILED.filter(({ skill, startsWith }) => {
			const pin = PINNED.find((p) => p.skill === skill);
			if (!pin) return true;
			const missing = missingMarkup(readFileSync(join(repoRoot, skill), 'utf8'), fixtureText(pin.fixtures));
			return !missing.some((markup) => markup.startsWith(startsWith));
		});

		expect(
			stale.map((e) => `${e.skill}: ${e.startsWith}`),
			'these NOT_COMPILED entries no longer match a fence missing from its fixture — drop them'
		).toEqual([]);
	});
});
