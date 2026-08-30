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
	['packages/core/docs/navigation/components.md :: TS2345 :: Argument of type \'"destination"\' is not assignable to parameter of type \'never\'.', 4],
	['packages/core/docs/navigation/tree-based.md :: TS2724 :: \'"@composable-svelte/core/routing"\' has no exported member named \'createParserConfig\'. Did you mean \'ParserConfig\'?', 1],
	['packages/core/docs/navigation/tree-based.md :: TS2339 :: Property \'type\' does not exist on type \'never\'.', 1],
	['packages/core/docs/quick-reference.md :: TS2554 :: Expected 3 arguments, but got 2.', 1],
	['packages/core/docs/quick-reference.md :: TS2554 :: Expected 4 arguments, but got 3.', 1],
	['packages/core/docs/quick-reference.md :: TS2345 :: Argument of type \'"destination"\' is not assignable to parameter of type \'never\'.', 1],
	['packages/core/docs/quick-reference.md :: TS2339 :: Property \'on\' does not exist on type \'WebSocketClient<unknown>\'.', 2],
	['packages/core/docs/quick-reference.md :: TS2554 :: Expected 1-2 arguments, but got 0.', 1],
	['packages/core/docs/quick-reference.md :: TS2305 :: Module \'"@composable-svelte/core/routing"\' has no exported member \'matchPattern\'.', 1],
	['packages/core/docs/quick-reference.md :: TS2345 :: Argument of type \'string[]\' is not assignable to parameter of type \'{ supportedLocales: string[]; defaultLocale: string; urlParam?: string | undefined; cookieName?: string | undefined; storageKey?: string | undefined; }\'.   Type \'string[]\' is missing the following properties from type \'{ supportedLocales: string[]; defaultLocale: string; urlParam?: string | undefined; cookieName?: string | undefined; storageKey?: string | undefined; }\': supportedLocales, defaultLocale', 1],
	['packages/core/docs/routing/url-sync.md :: TS2339 :: Property \'itemId\' does not exist on type \'{}\'.', 2],
	['packages/core/docs/routing/url-sync.md :: TS2345 :: Argument of type \'{ search: Schema<string | undefined>; page: Schema<number | undefined>; perPage: Schema<number | undefined>; sortBy: Schema<"price" | "name" | "date" | undefined>; tags: Schema<...>; }\' is not assignable to parameter of type \'Schema<unknown>\'.   Property \'parse\' is missing in type \'{ search: Schema<string | undefined>; page: Schema<number | undefined>; perPage: Schema<number | undefined>; sortBy: Schema<"price" | "name" | "date" | undefined>; tags: Schema<...>; }\' but required in type \'Schema<unknown>\'.', 1],
	['packages/core/docs/routing/url-sync.md :: TS2345 :: Argument of type \'"destination"\' is not assignable to parameter of type \'never\'.', 1],
	['packages/charts/README.md :: TS2345 :: Argument of type \'string\' is not assignable to parameter of type \'(d: unknown) => any\'.', 1],
	['packages/charts/README.md :: TS2345 :: Argument of type \'string\' is not assignable to parameter of type \'(d: unknown) => number\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2339 :: Property \'id\' does not exist on type \'Node\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2339 :: Property \'canvas\' does not exist on type \'RegExp\'.', 1],
	['.claude/skills/composable-svelte-core/SKILL.md :: TS2345 :: Argument of type \'(s: TodosState) => TodoState[]\' is not assignable to parameter of type \'(state: TodosState) => IdentifiedItem<string | number, unknown>[]\'.   Type \'TodoState[]\' is not assignable to type \'IdentifiedItem<string | number, unknown>[]\'.     Property \'state\' is missing in type \'TodoState\' but required in type \'IdentifiedItem<string | number, unknown>\'.', 1],
	['.claude/skills/composable-svelte-i18n/SKILL.md :: TS2554 :: Expected 2 arguments, but got 1.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2554 :: Expected 0 arguments, but got 1.', 2],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2339 :: Property \'isRecording\' does not exist on type \'VoiceInputState\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2554 :: Expected 4 arguments, but got 3.', 3],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2339 :: Property \'type\' does not exist on type \'{}\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2339 :: Property \'state\' does not exist on type \'{}\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2305 :: Module \'"@composable-svelte/core/navigation-components"\' has no exported member \'Button\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2554 :: Expected 4 arguments, but got 2.', 3],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2554 :: Expected 1 arguments, but got 2.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2554 :: Expected 6 arguments, but got 4.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2554 :: Expected 2 arguments, but got 3.', 2],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2345 :: Argument of type \'"counter"\' is not assignable to parameter of type \'never\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2345 :: Argument of type \'"todos"\' is not assignable to parameter of type \'never\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2345 :: Argument of type \'"destination"\' is not assignable to parameter of type \'never\'.', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2345 :: Argument of type \'string | undefined\' is not assignable to parameter of type \'string\'.   Type \'undefined\' is not assignable to type \'string\'.', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2554 :: Expected 1 arguments, but got 2.', 3],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2339 :: Property \'type\' does not exist on type \'{}\'.', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2339 :: Property \'state\' does not exist on type \'{}\'.', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2339 :: Property \'isRateLimited\' does not exist on type \'RateLimiter\'.', 1],
	['.claude/skills/composable-svelte-testing/SKILL.md :: TS2339 :: Property \'simulateOpen\' does not exist on type \'MockWebSocketClient<unknown>\'.', 1],
	['guides/NAVIGATION-GUIDE.md :: TS2554 :: Expected 4 arguments, but got 3.', 1],
	['guides/NAVIGATION-GUIDE.md :: TS2554 :: Expected 6 arguments, but got 4.', 1],
	['guides/README.md :: TS2554 :: Expected 1 arguments, but got 3.', 1],
	['guides/README.md :: TS2554 :: Expected 5 arguments, but got 4.', 1],
	['guides/forms-guide.md :: TS2305 :: Module \'"@composable-svelte/core/components/form"\' has no exported member \'Button\'.', 1],
	['guides/forms-guide.md :: TS2305 :: Module \'"@composable-svelte/core/components/form"\' has no exported member \'Input\'.', 1],
	['README.md :: TS2339 :: Property \'on\' does not exist on type \'WebSocketClient<unknown>\'.', 1],
	['README.md :: TS2554 :: Expected 1-2 arguments, but got 0.', 1],
	['packages/core/docs/backend/dependencies.md :: TS2739 :: Type \'{ enabled: true; maxAttempts: number; }\' is missing the following properties from type \'ReconnectConfig\': initialDelay, maxDelay, backoffMultiplier, jitter', 1],
	['packages/core/docs/backend/websocket.md :: TS2739 :: Type \'{ enabled: true; maxAttempts: number; initialDelay: number; }\' is missing the following properties from type \'ReconnectConfig\': maxDelay, backoffMultiplier, jitter', 1],
	['packages/core/docs/backend/websocket.md :: TS2345 :: Argument of type \'{ maxSize: number; }\' is not assignable to parameter of type \'number\'.', 1],
	['packages/core/docs/backend/websocket.md :: TS2345 :: Argument of type \'{ maxSize: number; dropStrategy: string; }\' is not assignable to parameter of type \'number\'.', 1],
	['packages/core/docs/backend/websocket.md :: TS2339 :: Property \'queue\' does not exist on type \'WebSocketClient<unknown>\'.', 3],
	['packages/core/docs/core-concepts/testing.md :: TS2345 :: Argument of type \'(state: any, action: any, deps: any) => any[]\' is not assignable to parameter of type \'Reducer<any, any, any>\'.   Type \'any[]\' is not assignable to type \'readonly [any, Effect<any>]\'.     Target requires 2 element(s) but source may have fewer.', 1],
	['packages/core/docs/core-concepts/testing.md :: TS2554 :: Expected 5 arguments, but got 6.', 1],
	['packages/core/docs/i18n/internationalization.md :: TS2345 :: Argument of type \'string[]\' is not assignable to parameter of type \'{ supportedLocales: string[]; defaultLocale: string; urlParam?: string | undefined; cookieName?: string | undefined; storageKey?: string | undefined; }\'.   Type \'string[]\' is missing the following properties from type \'{ supportedLocales: string[]; defaultLocale: string; urlParam?: string | undefined; cookieName?: string | undefined; storageKey?: string | undefined; }\': supportedLocales, defaultLocale', 1],
	['packages/core/docs/migration.md :: TS2339 :: Property \'live\' does not exist on type \'{ new (): Storage; prototype: Storage; }\'.', 1],
]);

const result = checkDocs();
const findings: Finding[] = result.findings;

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

	it('name only documents that still exist', () => {
		const files = new Set(result.blocks.map((block) => block.file));
		const gone = [...REGISTER.keys()]
			.map((key) => key.split(' :: ')[0]!)
			.filter((file) => !files.has(file));

		expect([...new Set(gone)], 'REGISTER names a document with no examples in it').toEqual([]);
	});
});
