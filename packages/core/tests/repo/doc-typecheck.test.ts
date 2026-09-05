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

import { checkBlocks, checkDocs, keyOf, type DocBlock, type Finding } from './doc-typecheck.js';

/**
 * Errors present when this guard was written, with the count for each.
 *
 * Every entry is a real false claim about the API, not a tolerated wart. They
 * are listed rather than fixed-in-one-go so that the guard could land first:
 * 86 corrections across 28 documents is a long change, and without the register
 * the 87th could have arrived while it was in progress.
 */
const REGISTER = new Map<string, number>([
	// Registered by R0.2.b (4 September 2026), when SURFACE_CODES admitted
	// TS2322/2353/2561/2774, each section tagged with its finding in
	// plans/hardening/AUDIT-2026-09-03-FINDINGS.md. Every entry but the EXCERPT
	// section at the end is a real false claim about an API. R4 empties this;
	// the staleness arm below fails on the day an entry is fixed.
	//
	// G6 — the audit's 24 skill fences, 23 keys here (re-counted by the R1 closure's C9).
	['.claude/skills/composable-svelte-auth/SKILL.md :: TS2322 :: Type \'(signal: AbortSignal | undefined) => Promise<{ email: string; emailVerified: true; hasPassword: true; mfaEnabled: false; providers: never[]; }>\' is not assignable to type \'(signal?: AbortSignal | undefined) => Promise<AccountSnapshot>\'.   Type \'Promise<{ email: string; emailVerified: true; hasPassword: true; mfaEnabled: false; providers: never[]; }>\' is not assignable to type \'Promise<AccountSnapshot>\'.     Property \'pendingEmail\' is missing in type \'{ email: string; emailVerified: true; hasPassword: true; mfaEnabled: false; providers: never[]; }\' but required in type \'AccountSnapshot\'.', 1],
	['.claude/skills/composable-svelte-chat/SKILL.md :: TS2353 :: Object literal may only specify known properties, and \'generateUserColor\' does not exist in type \'CollaborativeDependencies\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'never[]\' is not assignable to type \'Record<string, Node<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'never[]\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'never[]\' is not assignable to type \'Record<string, Edge<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'never[]\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'<NodeData extends Record<string, unknown> = Record<string, unknown>, EdgeData extends Record<string, unknown> = Record<string, unknown>>(state: NodeCanvasState<NodeData, EdgeData>, action: NodeCanvasAction<...>, deps?: NodeCanvasDependencies | undefined) => [...]\' is not assignable to type \'Reducer<NodeCanvasState<Record<string, unknown>, Record<string, unknown>>, unknown, {}>\'.   Types of parameters \'action\' and \'action\' are incompatible.     Type \'unknown\' is not assignable to type \'NodeCanvasAction<Record<string, unknown>, Record<string, unknown>>\'.', 3],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'{ id: string; type: string; position: { x: number; y: number; }; data: { label: string; }; }[]\' is not assignable to type \'Record<string, Node<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'{ id: string; type: string; position: { x: number; y: number; }; data: { label: string; }; }[]\'.', 1],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'{ id: string; source: string; target: string; }[]\' is not assignable to type \'Record<string, Edge<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'{ id: string; source: string; target: string; }[]\'.', 2],
	['.claude/skills/composable-svelte-code/SKILL.md :: TS2322 :: Type \'({ id: string; type: string; position: { x: number; y: number; }; data: { label: string; value: number; }; } | { id: string; type: string; position: { x: number; y: number; }; data: { label: string; operation: string; value: number; }; } | { ...; })[]\' is not assignable to type \'Record<string, Node<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'({ id: string; type: string; position: { x: number; y: number; }; data: { label: string; value: number; }; } | { id: string; type: string; position: { x: number; y: number; }; data: { label: string; operation: string; value: number; }; } | { ...; })[]\'.', 1],
	// Re-pinned by the R1 closure (C6a): the AfterDelay member gained `groups?`, so the same false claim reads differently.
	['.claude/skills/composable-svelte-forms/SKILL.md :: TS2322 :: Type \'(state: AppState, action: AppAction) => [any, { readonly _tag: "AfterDelay"; readonly ms: number; readonly execute: EffectExecutor<AppAction>; readonly groups?: EffectGroups; }] | [...] | undefined\' is not assignable to type \'Reducer<AppState, AppAction>\'.   Type \'[any, { readonly _tag: "AfterDelay"; readonly ms: number; readonly execute: EffectExecutor<AppAction>; readonly groups?: EffectGroups; }] | [AppState, { readonly _tag: "None"; }] | undefined\' is not assignable to type \'readonly [AppState, Effect<AppAction>]\'.     Type \'undefined\' is not assignable to type \'readonly [AppState, Effect<AppAction>]\'.', 1],
	// Re-pinned by the R1 closure (C5): receive() is overloaded, so the same false claim is TS2769.
	['.claude/skills/composable-svelte-i18n/SKILL.md :: TS2769 :: No overload matches this call.   Overload 1 of 2, \'(partialAction: PartialAction<unknown>, assert?: StateAssertion<{ i18n: any; }> | undefined, timeout?: number | undefined): Promise<void>\', gave the following error.     Object literal may only specify known properties, and \'namespace\' does not exist in type \'PartialAction<unknown>\'.   Overload 2 of 2, \'(partialActions: PartialAction<unknown>[], assert?: StateAssertion<{ i18n: any; }> | undefined, timeout?: number | undefined): Promise<void>\', gave the following error.     Object literal may only specify known properties, and \'type\' does not exist in type \'PartialAction<unknown>[]\'.', 1],
	['.claude/skills/composable-svelte-maps/SKILL.md :: TS2322 :: Type \'"osm"\' is not assignable to type \'TileProvider | undefined\'.', 3],
	['.claude/skills/composable-svelte-maps/SKILL.md :: TS2322 :: Type \'number[]\' is not assignable to type \'LngLat\'.   Target requires 2 element(s) but source may have fewer.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2353 :: Object literal may only specify known properties, and \'tracks\' does not exist in type \'{ volume?: number | undefined; playbackSpeed?: number | undefined; loopMode?: LoopMode | undefined; isShuffled?: boolean | undefined; }\'.', 3],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2322 :: Type \'"nextTrack"\' is not assignable to type \'"error" | "ended" | "pause" | "play" | "togglePlayPause" | "stop" | "next" | "previous" | "skipForward" | "skipBackward" | "seekStarted" | "seekUpdated" | "seekEnded" | "seekTo" | ... 21 more ... | "buffering"\'.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2353 :: Object literal may only specify known properties, and \'onAudioData\' does not exist in type \'VoiceInputDependencies\'.', 3],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2322 :: Type \'"startRecording"\' is not assignable to type \'"activatePushToTalk" | "activateConversationMode" | "deactivateVoiceInput" | "startPushToTalkRecording" | "stopPushToTalkRecording" | "cancelPushToTalkRecording" | "conversationModeToggled" | ... 10 more ... | "transcriptionCompleted"\'.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2769 :: No overload matches this call.   Overload 1 of 2, \'(partialAction: PartialAction<VoiceInputAction>, assert?: StateAssertion<VoiceInputState> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Type \'"recordingStarted"\' is not assignable to type \'"activatePushToTalk" | "activateConversationMode" | "deactivateVoiceInput" | "startPushToTalkRecording" | "stopPushToTalkRecording" | "cancelPushToTalkRecording" | "conversationModeToggled" | ... 10 more ... | "transcriptionCompleted"\'.   Overload 2 of 2, \'(partialActions: PartialAction<VoiceInputAction>[], assert?: StateAssertion<VoiceInputState> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Object literal may only specify known properties, and \'type\' does not exist in type \'PartialAction<VoiceInputAction>[]\'.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2353 :: Object literal may only specify known properties, and \'albumArt\' does not exist in type \'AudioTrack\'.', 2],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2322 :: Type \'"addTrack"\' is not assignable to type \'"error" | "ended" | "pause" | "play" | "togglePlayPause" | "stop" | "next" | "previous" | "skipForward" | "skipBackward" | "seekStarted" | "seekUpdated" | "seekEnded" | "seekTo" | ... 21 more ... | "buffering"\'.', 1],
	['.claude/skills/composable-svelte-media/SKILL.md :: TS2322 :: Type \'"setMode"\' is not assignable to type \'"activatePushToTalk" | "activateConversationMode" | "deactivateVoiceInput" | "startPushToTalkRecording" | "stopPushToTalkRecording" | "cancelPushToTalkRecording" | "conversationModeToggled" | ... 10 more ... | "transcriptionCompleted"\'.', 1],
	['.claude/skills/composable-svelte-navigation/SKILL.md :: TS2561 :: Object literal may only specify known properties, but \'serializers\' does not exist in type \'BrowserHistoryConfig<BlogState, AppAction, PostDestination>\'. Did you mean to write \'serialize\'?', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2561 :: Object literal may only specify known properties, but \'serializers\' does not exist in type \'BrowserHistoryConfig<BlogState, AppAction, { type: "post"; state: { postId: string; }; }>\'. Did you mean to write \'serialize\'?', 1],
	['.claude/skills/composable-svelte-ssr/SKILL.md :: TS2774 :: This condition will always return true since this function is always defined. Did you mean to call it instead?', 1],
	// DA-H12 (four entries) cleared by R1.4.g: the fields exist, the docs use them.
	// DA-X1 — found by the widened guard, beyond the audit's own list.
	['packages/core/docs/navigation/components.md :: TS2353 :: Object literal may only specify known properties, and \'stiffness\' does not exist in type \'Partial<SpringConfig>\'.', 1],
	['packages/core/docs/navigation/dismiss.md :: TS2769 :: No overload matches this call.   Overload 1 of 2, \'(partialAction: PartialAction<unknown>, assert?: StateAssertion<{ destination: { type: string; state: { name: string; quantity: number; }; }; }> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Object literal may only specify known properties, and \'action\' does not exist in type \'PartialAction<unknown>\'.   Overload 2 of 2, \'(partialActions: PartialAction<unknown>[], assert?: StateAssertion<{ destination: { type: string; state: { name: string; quantity: number; }; }; }> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Object literal may only specify known properties, and \'type\' does not exist in type \'PartialAction<unknown>[]\'.', 1],
	['packages/core/docs/quick-reference.md :: TS2322 :: Type \'(state: { count: number; }, action: unknown, deps: {}) => [{ count: number; }, { readonly _tag: "None"; }] | undefined\' is not assignable to type \'Reducer<{ count: number; }, unknown, {}>\'.   Type \'[{ count: number; }, { readonly _tag: "None"; }] | undefined\' is not assignable to type \'readonly [{ count: number; }, Effect<unknown>]\'.     Type \'undefined\' is not assignable to type \'readonly [{ count: number; }, Effect<unknown>]\'.', 1],
	['packages/code/README.md :: TS2769 :: No overload matches this call.   Overload 1 of 2, \'(partialAction: PartialAction<CodeHighlightAction>, assert?: StateAssertion<CodeHighlightState> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Type \'"highlightCompleted"\' is not assignable to type \'"init" | "codeChanged" | "languageChanged" | "themeChanged" | "copyCode" | "copyCompleted" | "copyFailed" | "resetCopyStatus" | "toggleLineNumbers" | "highlightLinesChanged" | "highlighted" | "highlightFailed"\'.   Overload 2 of 2, \'(partialActions: PartialAction<CodeHighlightAction>[], assert?: StateAssertion<CodeHighlightState> | undefined, timeout?: number | undefined): Promise<...>\', gave the following error.     Object literal may only specify known properties, and \'type\' does not exist in type \'PartialAction<CodeHighlightAction>[]\'.', 1],
	['packages/code/README.md :: TS2353 :: Object literal may only specify known properties, and \'code\' does not exist in type \'{ value?: string | undefined; language?: SupportedLanguage | undefined; theme?: "dark" | "light" | "auto" | undefined; showLineNumbers?: boolean | undefined; enableFolding?: boolean | undefined; readOnly?: boolean | undefined; enableAutocomplete?: boolean | undefined; tabSize?: number | undefined; }\'.', 1],
	['packages/code/README.md :: TS2322 :: Type \'{ id: string; type: string; position: { x: number; y: number; }; data: { label: string; }; }[]\' is not assignable to type \'Record<string, Node<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'{ id: string; type: string; position: { x: number; y: number; }; data: { label: string; }; }[]\'.', 1],
	['packages/code/README.md :: TS2322 :: Type \'{ id: string; source: string; target: string; }[]\' is not assignable to type \'Record<string, Edge<Record<string, unknown>>>\'.   Index signature for type \'string\' is missing in type \'{ id: string; source: string; target: string; }[]\'.', 1],
	['packages/code/README.md :: TS2322 :: Type \'<NodeData extends Record<string, unknown> = Record<string, unknown>, EdgeData extends Record<string, unknown> = Record<string, unknown>>(state: NodeCanvasState<NodeData, EdgeData>, action: NodeCanvasAction<...>, deps?: NodeCanvasDependencies | undefined) => [...]\' is not assignable to type \'Reducer<NodeCanvasState<Record<string, unknown>, Record<string, unknown>>, unknown, {}>\'.   Types of parameters \'action\' and \'action\' are incompatible.     Type \'unknown\' is not assignable to type \'NodeCanvasAction<Record<string, unknown>, Record<string, unknown>>\'.', 1],
	['packages/maps/README.md :: TS2353 :: Object literal may only specify known properties, and \'provider\' does not exist in type \'{ accessToken?: string | undefined; tileProvider?: TileProvider | undefined; center?: LngLat | undefined; zoom?: number | undefined; bearing?: number | undefined; pitch?: number | undefined; style?: string | undefined; markers?: any[] | undefined; }\'.', 1],
	['packages/media/README.md :: TS2353 :: Object literal may only specify known properties, and \'tracks\' does not exist in type \'{ volume?: number | undefined; playbackSpeed?: number | undefined; loopMode?: LoopMode | undefined; isShuffled?: boolean | undefined; }\'.', 1],
	['packages/media/README.md :: TS2322 :: Type \'"nextTrack"\' is not assignable to type \'"error" | "ended" | "pause" | "play" | "togglePlayPause" | "stop" | "next" | "previous" | "skipForward" | "skipBackward" | "seekStarted" | "seekUpdated" | "seekEnded" | "seekTo" | ... 21 more ... | "buffering"\'.', 1],
	['packages/code/src/lib/node-canvas/README.md :: TS2322 :: Type \'<NodeData extends Record<string, unknown> = Record<string, unknown>, EdgeData extends Record<string, unknown> = Record<string, unknown>>(state: NodeCanvasState<NodeData, EdgeData>, action: NodeCanvasAction<...>, deps?: NodeCanvasDependencies | undefined) => [...]\' is not assignable to type \'Reducer<NodeCanvasState<Record<string, unknown>, Record<string, unknown>>, unknown, any>\'.   Types of parameters \'action\' and \'action\' are incompatible.     Type \'unknown\' is not assignable to type \'NodeCanvasAction<Record<string, unknown>, Record<string, unknown>>\'.', 1],
	['packages/core/docs/animation/animated-navigation.md :: TS2769 :: No overload matches this call.   Overload 1 of 2, \'(partialAction: PartialAction<unknown>, assert?: StateAssertion<any> | undefined, timeout?: number | undefined): Promise<void>\', gave the following error.     Object literal may only specify known properties, and \'event\' does not exist in type \'PartialAction<unknown>\'.   Overload 2 of 2, \'(partialActions: PartialAction<unknown>[], assert?: StateAssertion<any> | undefined, timeout?: number | undefined): Promise<void>\', gave the following error.     Object literal may only specify known properties, and \'type\' does not exist in type \'PartialAction<unknown>[]\'.', 2],
	['packages/core/docs/backend/dependencies.md :: TS2353 :: Object literal may only specify known properties, and \'title\' does not exist in type \'FormData\'.', 1],
	['packages/core/docs/core-concepts/composition.md :: TS2322 :: Type \'string\' is not assignable to type \'"counter" | "setUser"\'.', 1],
	['packages/core/docs/core-concepts/testing.md :: TS2322 :: Type \'(state: any, action: any, deps: any) => any[]\' is not assignable to type \'Reducer<{ count: number; }, any, any>\'.   Type \'any[]\' is not assignable to type \'readonly [{ count: number; }, Effect<any>]\'.     Target requires 2 element(s) but source may have fewer.', 3],
	['packages/core/docs/core-concepts/testing.md :: TS2322 :: Type \'(state: ParentState, action: ParentAction, deps: any) => [any, { readonly _tag: "None"; }] | [unknown, Effect<unknown>]\' is not assignable to type \'Reducer<ParentState, ParentAction>\'.   Type \'[any, { readonly _tag: "None"; }] | [unknown, Effect<unknown>]\' is not assignable to type \'readonly [ParentState, Effect<ParentAction>]\'.     Type \'[unknown, Effect<unknown>]\' is not assignable to type \'readonly [ParentState, Effect<ParentAction>]\'.       Type at position 0 in source is not compatible with type at position 0 in target.         Type \'unknown\' is not assignable to type \'ParentState\'.', 1],
	// EXCERPT — what an elided or partially typed excerpt produces, not a claim
	// about the library (R0 review, 4 September 2026): a reducer whose body is
	// `// ...` and so returns void; a `const _never: never = action` in a block
	// that never types `action`. Kept registered so the count arm stays exact;
	// R4 completes the excerpts or leaves them, and either way says which.
	['packages/core/docs/backend/dependencies.md :: TS2322 :: Type \'(state: State, action: Action, deps: typeof dependencies) => void\' is not assignable to type \'Reducer<State, Action, { clock: Clock; storage: SyncStorage<UserData>; api: APIClient; websocket: WebSocketClient<unknown>; }>\'.   Type \'void\' is not assignable to type \'readonly [State, Effect<Action>]\'.', 1],
	['.claude/skills/composable-svelte-core/SKILL.md :: TS2322 :: Type \'any\' is not assignable to type \'never\'.', 1],
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

	it('still reports a surface error when one is put in front of it', () => {
		// The arm the empty REGISTER made necessary. Every other check in this
		// file is satisfied by a guard that finds nothing — an emptied
		// `SURFACE_CODES`, a `paths` map that resolves to no declaration, an
		// inverted filter — and all three look identical to a clean repository.
		// So: compile a block that is definitely wrong, and require the machinery
		// to say so through the same path the real ones take.
		const probe: DocBlock = {
			file: '<positive-control>',
			line: 1,
			kind: 'ts',
			name: '',
			counterExample: false,
			source:
				"import { scopeToOptionalXX } from '@composable-svelte/core';\n" +
				'export const used = scopeToOptionalXX;\n'
		};

		const codes = checkBlocks([probe]).findings.map((finding) => finding.code);

		expect(
			codes,
			'the checker no longer reports a name the library does not export — it is not measuring anything'
		).toContain(2724);
	});

	it('still reports a documented option that the type does not have', () => {
		// The two codes R0.2.b admitted, each through the same path. `prefx` is
		// one letter off `prefix`, so TypeScript suggests the correction (2561);
		// `bogus` is not near anything (2353).
		const block = (source: string): DocBlock => ({
			file: '<positive-control>',
			line: 1,
			kind: 'ts',
			name: '',
			counterExample: false,
			source
		});
		const codes = (source: string) => checkBlocks([block(source)]).findings.map((f) => f.code);

		expect(
			codes(
				"import { createCookieStorage } from '@composable-svelte/core';\n" +
					'export const s = createCookieStorage({ bogus: 1 });\n'
			)
		).toContain(2353);
		expect(
			codes(
				"import { createCookieStorage } from '@composable-svelte/core';\n" +
					"export const s = createCookieStorage({ prefx: 'x' });\n"
			)
		).toContain(2561);
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
