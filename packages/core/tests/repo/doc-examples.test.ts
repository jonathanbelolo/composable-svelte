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
 *
 * The `svelte` blocks are a third case, and they *are* checked wholesale —
 * because compiling one is cheap and a compiler cannot be fooled the way a
 * reader or a grep can. `graphics`'s README shipped `<Scene>` examples whose
 * children all omitted the required `{store}` prop; the fix for that introduced
 * a *duplicate* `{store}` on one element, which is a different compile error in
 * the same block. Both survived review by grep — the first because a missing
 * attribute spread over a multi-line element is awkward to match, the second
 * because the duplicate spanned two lines.
 *
 * Note which of those two this actually catches: **the second only.** A
 * duplicate attribute is a parse error; a *missing required prop* is perfectly
 * valid Svelte and needs `svelte-check` against the real component to see. So
 * this closes the hole the fix opened, not the one the fix was for. Catching
 * the original would mean generating a component per block and running
 * `svelte-check` over it — a much larger machine, recorded in
 * `plans/hardening/README.md` rather than built here.
 */

import { describe, it, expect } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { walkFiles, listDirs } from './walk.js';
import { COUNTER_EXAMPLE_MARKERS } from './doc-typecheck.js';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every markdown file that documents this library, wherever it lives. */
function docs(): string[] {
	// `examples/` is in scope so the code in an example's documentation is held
	// to the same standard as the code in a package's. Be clear about what that
	// buys today: it adds 63 blocks across eight READMEs, and exactly **one**
	// reaches a rule — a single TestStore block. The seven ```svelte ones are
	// not compiled, because that arm reads `SWEPT_DOCS`, an explicit list which
	// names no example.
	//
	// `shader-gallery/README.md` contributes **zero** — its only fence is
	// ```bash. It is the document that prompted this root, having described an
	// architecture months gone, but that rot was prose, and prose is not what
	// this compiles. The root is here for the next block written under it.
	//
	// `plans/` deliberately stays out — those documents are historical and their
	// code is *supposed* to be stale; a banner is the instrument there, not a
	// compiler.
	const roots = [
		join(repoRoot, 'packages'),
		join(repoRoot, '.claude'),
		join(repoRoot, 'guides'),
		join(repoRoot, 'examples')
	];
	// `worktrees` holds throwaway checkouts that agents run in. They are full
	// copies of the repo, so scanning them double-counts every doc and reports
	// findings against paths that will not exist tomorrow — and a worktree left
	// behind by a killed agent fails this suite for reasons that have nothing to
	// do with the working tree.
	// `plans` is skipped wherever it appears, not only at the repo root: a
	// package's own plans are the same kind of historical record, and three
	// mislabelled fences in `packages/chat/plans/` were the only thing that made
	// the difference visible.
	const skip = ['node_modules', 'dist', '.svelte-kit', 'worktrees', 'plans'];

	// `walkFiles`, not a local walk. This function ran a throwing `statSync` at
	// module scope, so a single dangling `.md` symlink made the whole file fail
	// to *collect* — every test in it gone, suite still green. `unreadable` is
	// not inspected here because `walk.test.ts` asserts it repo-wide, in one
	// place rather than eleven.
	// CHANGELOGs are excluded, as they are by `doc-typecheck.ts` and
	// `side-effects.test.ts` for the reason those two state: a changelog quotes
	// the API as it was at each version, and a record of the past is not an
	// instruction. This file was the only one of the three still scanning them,
	// which put a 2026-era `packages/core/CHANGELOG.md` block in the compile
	// backlog and pointed the dismiss-dependency and TestStore arms at historical
	// prose as though it were advice.
	return roots.flatMap(
		(root) =>
			walkFiles(root, { skip, keep: (n) => n.endsWith('.md') && n !== 'CHANGELOG.md' }).files
	);
}

/**
 * Fenced code blocks, with the file, the language, and the line the fence opened on.
 *
 * Line endings normalised, and that is not symmetry for its own sake. The
 * example side was normalised alone, so under `core.autocrlf=true` — the very
 * checkout the normalisation was added for — the example was stripped, the
 * document was not, and `block.body === body` could not hold for any pair. The
 * one-sided fix turned a silent skip into a **false accusation**: three
 * documents that quote their files exactly were reported as "no longer quotes
 * … verbatim — the file is what compiles, so the document is what is wrong".
 */
/**
 * Whether the prose just above a fence marks it as showing the *wrong* way.
 *
 * Shared with `doc-typecheck.ts` rather than restated, because a second copy of
 * the marker list is a second thing to keep in step. `guides/forms-guide.md`'s
 * Pitfall 6 is the case that needs it here: a `<script>` whose JSDoc contains a
 * nested ```svelte example, under `**Problem**:`, with the document's own next
 * line quoting the compile error as the lesson. The block failing to parse *is*
 * the documentation, and making it compile would delete the point.
 */
function markedWrong(lines: string[], fenceLine: number): boolean {
	const before = lines
		.slice(0, fenceLine - 1)
		.filter((line) => line.trim())
		.slice(-2);

	return before.some((line) => COUNTER_EXAMPLE_MARKERS.some((marker) => marker.test(line)));
}

function codeBlocks(
	file: string
): Array<{ line: number; body: string; lang: string; counterExample: boolean }> {
	const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
	const blocks: Array<{ line: number; body: string; lang: string; counterExample: boolean }> = [];

	let open: { line: number; body: string[]; lang: string } | null = null;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (open) {
			if (/^\s*```\s*$/.test(line)) {
				blocks.push({
					line: open.line,
					body: open.body.join('\n'),
					lang: open.lang,
					counterExample: markedWrong(lines, open.line)
				});
				open = null;
			} else {
				open.body.push(line);
			}
			continue;
		}
		const fence = /^\s*```(ts|typescript|js|javascript|svelte)\b/.exec(line);
		if (fence) {
			open = { line: i + 1, body: [], lang: fence[1]! };
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

/**
 * Every ```svelte block in a swept document must at least parse.
 *
 * A *syntax* check and nothing more: the blocks are excerpts referencing stores
 * and handlers they never define, so typechecking them would need a harness per
 * block. In particular this does not catch a missing required prop —
 * `<Camera position={…} />` with no `{store}` is valid Svelte, and only
 * `svelte-check` against the real component would object. Syntax is what has
 * actually broken.
 *
 * ## Why a list rather than the whole repo
 *
 * Running this across every markdown file finds **53 non-compiling blocks in 18
 * files**: 18 `global_reference_invalid` (an excerpt whose `<script>` shows only
 * part of itself, so an auto-subscribed store is undeclared — mostly benign) and
 * **35 real syntax errors** — 20 `js_parse_error`, 8 `expected_token`, 4
 * `script_duplicate`, 2 `block_unclosed`, 1 `state_invalid_placement`. Turning
 * that on wholesale would gate the repo on documents nobody has read in this
 * campaign, and each needs individual judgement about whether the excerpt or the
 * code is wrong.
 *
 * Re-measured after the fence sweep, and it went **up** from 41 in 16 — which
 * is the sweep working rather than a regression. Relabelling 60 mislabelled
 * fences and splitting 22 mixed listings moved a large block of markup out of
 * ```typescript fences and into this arm's population for the first time. The
 * failures are old; they were simply not being looked at. Spot-checked against
 * the split blocks specifically: none of the 53 is one of them, and the two
 * `script_duplicate` blocks trace to `854d21e`, the original documentation
 * commit.
 *
 * So the list holds the documents that have been swept and verified, and grows
 * as sweeps land. The backlog is recorded in `plans/hardening/README.md`.
 */
const SWEPT_DOCS = [
	'packages/graphics/README.md',
	'.claude/skills/composable-svelte-graphics/SKILL.md'
];

/** The runes, which look like store references and must not be declared. */
const RUNES = new Set(['state', 'derived', 'effect', 'props', 'bindable', 'inspect', 'host']);

/**
 * Turn a script-less excerpt into something the compiler actually checks.
 *
 * Two problems, both of which made this weaker than it looked:
 *
 * 1. A markup-only excerpt auto-subscribes to a store it never declares
 *    (`$store`) — a compile error out of context, but exactly what the
 *    surrounding prose describes. So the stores get declared.
 * 2. Several blocks put bare JavaScript *above* their markup with no `<script>`
 *    tag. Svelte parses that as a **text node**, so the JS was never checked:
 *    corrupting it left the suite green. Those leading lines are lifted into the
 *    `<script>` where the prose plainly means them to be.
 */
function withDeclaredStores(body: string): string {
	const lines = body.split('\n');
	// Markup starts at the first line opening a tag or a Svelte block.
	const markupAt = lines.findIndex((line) => /^\s*[<{]/.test(line));
	const leading = markupAt === -1 ? [] : lines.slice(0, markupAt);
	const markup = markupAt === -1 ? body : lines.slice(markupAt).join('\n');

	const declared = new Set(
		leading
			.flatMap((line) => [
				...line.matchAll(/\b(?:let|const|var|function)\s+([a-zA-Z_$][\w$]*)/g)
			])
			.map((m) => m[1]!)
	);

	const referenced = [
		...new Set(
			[...markup.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g)]
				.map((m) => m[1]!)
				.filter((name) => !RUNES.has(name) && !declared.has(name))
		)
	];

	const props = referenced.length > 0 ? `  let { ${referenced.join(', ')} } = $props();\n` : '';
	const script = leading.join('\n');

	if (!props && !script.trim()) return body;

	return `<script lang="ts">\n${props}${script}\n</script>\n${markup}`;
}

/**
 * Declare the stores an excerpt *with* a `<script>` still never introduces.
 *
 * `withDeclaredStores` above only runs on blocks that have no `<script>` at all,
 * so an excerpt whose script shows one half of a component and writes
 * `$store.locale` in the other half got no help and failed with
 * `global_reference_invalid`. That was 18 of the 53 non-compiling blocks — every
 * one of them an excerpt eliding a declaration the surrounding prose has already
 * made, which is what an excerpt is for. Editing 18 documents to add a line the
 * author deliberately left out would make all 18 worse.
 *
 * Plain `let`, not `$props()`: the script may already destructure props, and a
 * second `$props()` call is itself a compile error. A bare binding is all the
 * auto-subscription needs to resolve.
 */
function withDeclaredStoresInScript(body: string): string {
	const tag = /<script[^>]*>/.exec(body);
	if (!tag) return body;

	const declared = new Set(
		[...body.matchAll(/\b(?:let|const|var|function|class)\s+([a-zA-Z_$][\w$]*)/g)].map(
			(m) => m[1]!
		)
	);
	// Destructured bindings are declarations too, and missing one redeclares a
	// name already in scope. Anchored on the `let`/`const`/`import` keyword, not
	// on the brace: `let { store }: { store: Store<S, A> } = $props()` has two
	// brace groups and only the first binds anything. Matching braces followed by
	// `=` found the *annotation*, recorded `Store<S, A>` as the binding, and then
	// redeclared `store` — which broke three blocks that had been compiling.
	for (const m of body.matchAll(/\b(?:let|const|var)\s*\{([^}]*)\}/g)) {
		for (const part of m[1]!.split(',')) {
			// `{ a: b }` binds `b`; `{ a }` binds `a`; `...rest` binds `rest`.
			const name = part.split(':').pop()!.trim().replace(/^\.\.\./, '');
			if (name) declared.add(name);
		}
	}
	for (const m of body.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}/g)) {
		for (const part of m[1]!.split(',')) {
			const name = part.split(/\s+as\s+/).pop()!.trim();
			if (name) declared.add(name);
		}
	}

	const referenced = [
		...new Set(
			[...body.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g)]
				.map((m) => m[1]!)
				.filter((name) => !RUNES.has(name) && !declared.has(name))
		)
	];

	if (referenced.length === 0) return body;

	return body.replace(tag[0], `${tag[0]}\n\tlet ${referenced.join(', ')};`);
}

/**
 * Whether a block is Svelte markup, whatever its fence says.
 *
 * The fence label cannot be trusted. `composable-svelte-graphics/SKILL.md` was
 * the case that proved it: at the time, 44 ```typescript blocks against a
 * single ```svelte, 28 of them component markup — which is why a fence-only
 * check found nothing in the very file whose examples were wrong. A line
 * beginning with a capitalised component tag, or with Svelte block syntax, is
 * the signal.
 *
 * Those figures are **historical and stated as such**, because they moved the
 * moment the mislabelled blocks were relabelled. Two comments in this file used
 * to give them in the present tense and disagree with each other — 45 here, 44
 * below, "most of 45" against "28 of them" — and both were stale: the file
 * carries 18 ```typescript and 29 ```svelte today. A number that describes a
 * fixed defect belongs in the past tense, or it becomes a claim about now.
 */
function looksLikeSvelte(body: string): boolean {
	return (
		// A component tag, including the dotted form this repo uses throughout
		// (`<Card.Header>`) — which an `[A-Z][A-Za-z0-9]*` pattern alone misses.
		/^\s*<[A-Z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*[\s/>]/m.test(body) ||
		// Plain HTML markup at the start of a line.
		/^\s*<(div|span|button|p|section|main|form|input|ul|li|a|h[1-6])[\s/>]/m.test(body) ||
		// Svelte block syntax — opening, continuing or closing.
		/^\s*\{[#:/@](if|each|await|key|else|then|catch|render|html|const|snippet)\b/m.test(body) ||
		// A `<svelte:*>` special element. Not covered by the two tag rules above —
		// it is lowercase, so it is not a component tag, and it is not HTML. A
		// second mixed listing in `composable-svelte-ssr/SKILL.md` sat behind this
		// hole: the one beside it was caught only because it also contained a
		// `{#if}`, and the pair differed by nothing else.
		/^\s*<svelte:(head|window|document|body|element|boundary|options)\b/m.test(body)
	);
}

/**
 * Markup inside a template literal is string content, not the fence's language.
 *
 * `composable-svelte-ssr/SKILL.md` writes an error page into
 * `document.body.innerHTML` as a backtick string. Its `<div>` starts a line, so
 * the HTML rule above matched and called a correctly-labelled TypeScript block
 * mislabelled. Relabelling it would have been wrong twice: the block is a `.ts`
 * module from its first line, and a ```svelte fence with no `<script>` is
 * skipped by the doc typechecker — so "fixing" it would have deleted the only
 * checking that block gets.
 *
 * Svelte markup is never written inside a template literal in this repository,
 * so nothing real is lost by not looking there.
 *
 * Line comments are removed *before* the backticks are paired, and that order
 * matters. Prose in a comment routinely quotes an identifier — `store` — and a
 * single backtick pairs with the next real one, blanking everything between the
 * two. A mutation with two backticked words in comments either side of a
 * `<Modal>` hid it completely and this arm passed. Comments cannot contain the
 * markup being looked for, so dropping them first costs nothing and closes it.
 */
const outsideTemplateLiterals = (body: string): string =>
	body
		// `(?<!:)` so a `https://` URL does not eat the rest of its line.
		.replace(/(?<!:)\/\/[^\n]*/g, '')
		.replace(/`[\s\S]*?`/g, '``');

const sweptSvelteBlocks = blocks.filter(
	(b) => SWEPT_DOCS.includes(b.file) && b.lang === 'svelte' && !b.counterExample
);

/**
 * Blocks that are Svelte markup but are not fenced as such.
 *
 * The fence label is the contract this check runs on, so a mislabelled fence is
 * a hole in it. See `looksLikeSvelte` above for the case that established it;
 * the figures live there once, in the past tense, rather than in two comments
 * that drifted apart.
 *
 * **Zero now**, for the swept documents. It was 6 for one round, under a
 * comment saying those six "do not compile as they stand" — which stopped being
 * true the moment the detector learned to lift a block's leading JavaScript into
 * a `<script>`, and nobody re-checked. All six compile and are relabelled.
 *
 * Kept as a constant rather than inlining `0`, because a document may arrive
 * with a backlog and raising this deliberately is better than deleting the arm.
 *
 * Note the scope: this arm reads *every* document, not `SWEPT_DOCS`. An earlier
 * version of this comment said `SWEPT_DOCS`, left over from before the arm was
 * widened, which understated it — any new markdown file anywhere in `packages`,
 * `.claude`, `guides` or `examples` can move this number.
 */
const ALLOWED_MISLABELLED = 0;

/*
 * Why this was 22, and why it is 0.
 *
 * Widening this arm from `SWEPT_DOCS` to every document found 82 blocks with the
 * wrong fence label. Sixty were pure markup or full components and were simply
 * relabelled. The remaining 22 were **mixed listings**: one fence carrying a
 * state interface, a reducer *and* the component markup that used them, which is
 * neither valid TypeScript nor valid Svelte.
 *
 * They were held at ```typescript on purpose while they waited. Relabelling one
 * to ```svelte makes this arm pass and stops `doc-typecheck` seeing its
 * TypeScript at all — that checker extracts only `<script lang="ts">` bodies —
 * which is how 22 wrong relabels silently hid two real errors, including a
 * `forEach` example whose item shape cannot work. A guard that passes by not
 * looking is worse than one that fails.
 *
 * All 22 are now split: types in a ```typescript fence, runes and markup in a
 * ```svelte one whose script is typed, so both halves are checked rather than
 * neither. Two of them contained a `<script>` already and an automated attempt
 * nested the tags, so every split was verified against both guards before the
 * next.
 *
 * Exactly one of the 22 was not a defect: an HTML error page inside a template
 * literal. The other correction went the other way — a *23rd* mixed listing the
 * detector could not see, because its markup is `<svelte:head>` and no rule
 * matched it. Both are recorded on `looksLikeSvelte` and
 * `outsideTemplateLiterals`. Counting them together as "two false positives"
 * would hide the more interesting of the two: the arm was passing a block it
 * should have failed, which a green count can never reveal.
 */
/**
 * Examples that are compiled for real, and the documents that must match them.
 *
 * The compile arm above is syntax-only, by design — and that design let a
 * documentation defect through in each of three review rounds: props that did
 * not exist on the component, a function whose return type could not land where
 * it was passed, and a constructor called with three arguments instead of one.
 * None is a syntax error. All three are caught the moment the example is a
 * *file*, because `svelte-check --tsconfig ./tsconfig.test.json` already
 * compiles every file under a package's `tests/`.
 *
 * So the example lives in `packages/<pkg>/tests/doc-examples/`, the gate
 * compiles it for free, and this arm asserts the document still quotes it
 * verbatim. The **file is authoritative**: it is the thing that has to compile,
 * and drift in either direction fails here.
 */
interface DocExample {
	path: string;
	mirrors: string[];
	body: string;
}

/**
 * Every file under a `doc-examples/` directory, parsed — or named as a reason
 * this returned fewer than it found.
 *
 * The `unparsed` half is the point. This used to `continue` past anything it
 * could not read, so a file that was *compiled* by the gate but never *checked
 * against its document* looked exactly like a file that did not exist. Five
 * ordinary things triggered it, all reported green: a CRLF checkout (the Svelte
 * header regex needs `-->\n`, and there is no `.gitattributes`, so on Windows
 * with the default `core.autocrlf=true` both Svelte examples went unguarded
 * while the `.ts` one held the vacuity arm up single-handed); a JSDoc block
 * header, which is this repo's dominant comment style; a `-->` inside the
 * header; `See:` where the parser wants `Mirrors:`; and a subdirectory, which
 * still compiles, so it looks guarded from every angle except this one.
 *
 * A count-based vacuity arm cannot catch any of that — it is a *total* check,
 * and one surviving file keeps it green. Silence is the failure, so silence is
 * what gets reported.
 */
function docExamples(): { examples: DocExample[]; unparsed: string[] } {
	const examples: DocExample[] = [];
	const unparsed: string[] = [];
	const packagesDir = join(repoRoot, 'packages');
	if (!existsSync(packagesDir)) return { examples, unparsed };

	// This walk was already symlink-aware — it was the *other* one in this file
	// that threw — but it dropped a dangling link with a bare `continue`, which
	// is the silence this function's own docstring calls the failure. `walkFiles`
	// reports it instead, and it lands in `unparsed` below.
	const files: string[] = [];
	for (const pkg of listDirs(packagesDir)) {
		const dir = join(packagesDir, pkg, 'tests', 'doc-examples');
		const found = walkFiles(dir, { keep: () => true });
		files.push(...found.files);
		unparsed.push(
			...found.unreadable.map((f) => `${relative(repoRoot, f)} — the filesystem would not read it`)
		);
	}

	for (const full of files) {
		const path = relative(repoRoot, full);
		// Normalised, because the header patterns anchor on a newline and a
		// document quotes the body — so a CRLF checkout would otherwise fail to
		// parse and then fail to match, for a reason invisible in the diff.
		const source = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');

		// The header names the documents and is not part of the example.
		// `<!-- … -->` for Svelte; for TypeScript either a `/** … */` block or a
		// run of `//` lines.
		const header =
			/^<!--([\s\S]*?)-->\n/.exec(source) ??
			/^\/\*\*?([\s\S]*?)\*\/\n/.exec(source) ??
			/^((?:\/\/[^\n]*\n)+)/.exec(source);

		if (!header) {
			unparsed.push(`${path} — starts with no header comment, so it names no document`);
			continue;
		}

		const mirrors = /Mirrors:\s*([^\n]+)/.exec(header[1]!);
		if (!mirrors) {
			unparsed.push(`${path} — header has no \`Mirrors:\` line, so nothing is checked against it`);
			continue;
		}

		examples.push({
			path,
			mirrors: mirrors[1]!.split(',').map((name) => name.trim()),
			body: source.slice(header[0].length).replace(/\n$/, '')
		});
	}

	return { examples, unparsed };
}

/**
 * The compiled examples that must exist.
 *
 * Named rather than counted, because a count cannot say *which* one went.
 */
const EXPECTED_EXAMPLES = [
	'packages/charts/tests/doc-examples/keyboard-chart.svelte',
	'packages/code/tests/doc-examples/code-highlight.svelte',
	'packages/media/tests/doc-examples/audio-player.svelte',
	'packages/media/tests/doc-examples/video-embed.svelte',
	'packages/graphics/tests/doc-examples/overlay.svelte',
	'packages/graphics/tests/doc-examples/scene.svelte',
	'packages/graphics/tests/doc-examples/test-store.test.ts'
];

const { examples, unparsed: unparsedExamples } = docExamples();

describe('documented examples that are compiled for real', () => {
	it('finds them, so the arms below are not vacuous', () => {
		expect(examples.length, 'no doc-examples directories found').toBeGreaterThan(0);
	});

	it('still has every example it is supposed to have', () => {
		// The per-file arm below only reports files that *exist*, and the count
		// arm is total — so deleting an example outright was completely silent,
		// which is the exact state this guard exists to prevent. `overlay.svelte`
		// is the file whose own header records that every prop in the README's
		// `<WebGLOverlay>` block was once fabricated; remove it and that block
		// goes unchecked with nothing to show for it.
		//
		// Exact match in both directions, on the `SWEPT_DOCS` principle: a new
		// example must be listed, so the list cannot quietly stop describing the
		// directory.
		expect(examples.map((e) => e.path).sort()).toEqual([...EXPECTED_EXAMPLES].sort());
	});

	it('reads every file it finds, so none is silently unguarded', () => {
		// Per-file, deliberately. The count arm above is *total* — it cannot tell
		// three guarded examples from one guarded example and two dropped ones.
		expect(
			unparsedExamples,
			'a file under doc-examples/ is compiled by the gate but checked against no document'
		).toEqual([]);
	});

	it('names a document that exists', () => {
		const missing = examples.flatMap(({ path, mirrors }) =>
			mirrors.filter((doc) => !existsSync(join(repoRoot, doc))).map((doc) => `${path} → ${doc}`)
		);

		expect(missing, 'an example mirrors a document that is not there').toEqual([]);
	});

	it('is quoted verbatim by every document it names', () => {
		const drifted = examples.flatMap(({ path, mirrors, body }) =>
			mirrors
				.filter((doc) => !codeBlocks(join(repoRoot, doc)).some((block) => block.body === body))
				.map(
					(doc) =>
						`${doc} no longer quotes ${path} verbatim — the file is what compiles, so the document is what is wrong`
				)
		);

		expect(drifted).toEqual([]);
	});
});

describe('documented Svelte examples', () => {
	it('every swept document still exists, so the list cannot rot', () => {
		const missing = SWEPT_DOCS.filter((doc) => !existsSync(join(repoRoot, doc)));

		expect(missing, 'a swept document was moved or deleted').toEqual([]);
	});

	it('finds svelte blocks in them, so the arm below is not vacuous', () => {
		expect(
			sweptSvelteBlocks.length,
			`no \`\`\`svelte blocks found in ${SWEPT_DOCS.join(', ')}`
		).toBeGreaterThan(20);
	});

	it('every one of them compiles', () => {
		const failures = sweptSvelteBlocks.flatMap(({ file, line, body }) => {
			// A markup-only excerpt still auto-subscribes to a store it never
			// declares — `$store` — which is a compile error out of context but is
			// exactly what the surrounding prose describes.
			const source = body.includes('<script')
				? withDeclaredStoresInScript(body)
				: withDeclaredStores(body);

			try {
				compile(source, { generate: 'client' });
				return [];
			} catch (error) {
				const { code, message } = error as { code?: string; message: string };
				return [`${file}:${line} — ${code ?? 'error'}: ${message.split('\n')[0]}`];
			}
		});

		expect(failures).toEqual([]);
	});
});

describe('Svelte markup is fenced as svelte', () => {
	it('no document hides markup behind another fence label', () => {
		// Every document, not only `SWEPT_DOCS`. Scoped to two files this arm
		// could not see `composable-svelte-code/SKILL.md`, which fenced a whole
		// component — `<script>`, markup and `<style>` — as ```typescript. The
		// doc typechecker then parsed its CSS as a regular expression and
		// reported `Property 'canvas' does not exist on type 'RegExp'`, which is
		// a long way from "this fence has the wrong label".
		const mislabelled = blocks
			.filter((b) => b.lang !== 'svelte' && looksLikeSvelte(outsideTemplateLiterals(b.body)))
			.map((b) => `${b.file}:${b.line}`);

		expect(
			mislabelled.length,
			`mislabelled blocks:\n${mislabelled.join('\n')}`
		).toBe(ALLOWED_MISLABELLED);
	});
});

/**
 * A ```svelte fence is a component, not a listing with a component at the end.
 *
 * The mirror of the mislabelled-fence arm, and the reason that arm's backlog
 * reaching zero was not the whole story. It only ever looks at fences whose
 * label is *not* `svelte`, so a mixed listing — types, a reducer, then the
 * markup that uses them — is invisible to it the moment somebody relabels the
 * fence ```svelte. And `doc-typecheck.ts` extracts only the `<script lang="ts">`
 * body from such a fence, discarding everything above it.
 *
 * So a mixed listing on this side of the label is checked by nothing at all,
 * which is exactly the failure `2fde4b0` was written about. Twenty-two were
 * split out of ```typescript fences and the backlog was declared zero; **eight
 * more were sitting on this side**, holding 501 lines of unchecked TypeScript
 * across the core and navigation skills and `migration.md`. Nothing looked,
 * because the only arm that could have was pointed the other way.
 */
const ALLOWED_MIXED_LISTINGS = 0;

const mixedListings = blocks
	.filter((block) => block.lang === 'svelte')
	.filter((block) => {
		const script = block.body.indexOf('<script');
		if (script < 0) return false;

		// Declarations at the start of a line, above the script tag. Markup and
		// comments above a script are ordinary; a `type` or a `const` is not.
		return /^\s*(?:export\s+)?(?:interface|type|const|let|var|function|class|enum)\s/m.test(
			block.body.slice(0, script)
		);
	})
	.map((block) => `${block.file}:${block.line}`);

describe('a svelte fence holds a component', () => {
	it('carries no TypeScript above its script tag', () => {
		expect(
			mixedListings.length,
			mixedListings.length > ALLOWED_MIXED_LISTINGS
				? `new mixed listings — split the types into their own \`\`\`typescript fence:\n${mixedListings.join('\n')}`
				: `${ALLOWED_MIXED_LISTINGS - mixedListings.length} have been split — lower ALLOWED_MIXED_LISTINGS to ${mixedListings.length}`
		).toBe(ALLOWED_MIXED_LISTINGS);
	});
});
