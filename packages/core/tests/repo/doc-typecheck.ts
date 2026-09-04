/**
 * Typecheck every documented example that names this library.
 *
 * The documentation makes claims about an API — `createLiveAPI`, `ws.on(...)`,
 * `Button` from `core/components/form` — and nothing checked them. The count of
 * false ones has been measured four times across the hardening sessions and read
 * 94, then 85, then 78, then 86, drifting every time because each measurement
 * was a throwaway script. One of those drifts was a regression a session had
 * introduced and caught only by chance re-running it.
 *
 * **Only diagnostics that are claims about the library count.** A blanket
 * typecheck is not adoptable and never was: the same program reports ~1,969
 * semantic diagnostics, almost all of them excerpt noise — `Cannot find name
 * 'store'` in a snippet that never declared one, which is what an excerpt *is*.
 * The adoptable set is the codes that can only be produced by getting the
 * library's own surface wrong; see `SURFACE_CODES`.
 *
 * **Svelte blocks are checked by their `<script lang="ts">` body.** That is not
 * a full Svelte check — markup expressions like `{store.state.tpyo}` are not
 * examined, and this file does not pretend otherwise. It covers the class that
 * actually shipped: `code`'s quickstart broke on a renamed import, and imports
 * live in the script.
 *
 * This reads the built `dist/*.d.ts`, which is what a consumer resolves, so it
 * requires a build. `dist-freshness.test.ts` is what keeps that build current.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';

import { listDirs, walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Diagnostics that can only mean the document got *this library* wrong.
 *
 * Deliberately not the whole set. Each of these needs a real declaration to fire
 * against — a missing export, a property that is not on the type, an argument
 * list that does not match the signature — so an excerpt with undeclared
 * variables produces `TS2304` and is ignored, while an excerpt calling a real
 * function with the wrong arity is caught.
 */
const SURFACE_CODES = new Set([
	2305, // module has no exported member
	2724, // ...and here is the closest name it does export
	2749, // value used as a type
	2551, // property does not exist — did you mean
	2339, // property does not exist on type
	2554, // wrong number of arguments
	2345, // argument type not assignable to parameter
	2739, // missing properties from type
	2740, // type missing several properties
	2741 // property missing in type
]);

/**
 * Documents whose code is *supposed* to be out of date.
 *
 * `plans/` records designs that were considered and often not built, and a
 * CHANGELOG quotes the API as it was at each version — that is the job. Both
 * are excluded for the same reason the `side-effects` guard excludes them: a
 * record of the past is not an instruction.
 */
const SKIP_DIRS = ['node_modules', 'dist', '.svelte-kit', 'worktrees', 'plans'];
const isRecordOfThePast = (name: string) => name === 'CHANGELOG.md';

/**
 * Prose that marks the block after it as a deliberate counter-example.
 *
 * Troubleshooting documents show the broken form, then the fix, then why —
 * `guides/forms-guide.md` does exactly that for `Button` imported from
 * `components/form`. Reporting those as defects would push a writer to delete
 * the wrong half of a Problem/Solution pair, which is the half that makes it
 * useful.
 *
 * Marked blocks are *expected to fail*, and `doc-typecheck.test.ts` asserts they
 * still do: an exemption that outlives its cause is the failure mode this
 * repository keeps finding, and a counter-example that quietly became correct
 * teaches nothing.
 */
export const COUNTER_EXAMPLE_MARKERS = [/\*\*Problem\*\*/, /WRONG\s*❌/, /❌\s*(BEFORE|Pitfall|BAD)/i];

export interface DocBlock {
	/** Repo-relative path of the document. */
	file: string;
	/** Line the fence opened on, so a finding can be found by a human. */
	line: number;
	/** `ts` for a TypeScript fence, `svelte` for a script body lifted from one. */
	kind: 'ts' | 'svelte';
	source: string;
	/** The virtual filename this block compiles under. */
	name: string;
	/** Marked in the prose above it as showing the *wrong* way. */
	counterExample: boolean;
}

export interface Finding {
	file: string;
	line: number;
	kind: DocBlock['kind'];
	code: number;
	message: string;
	/** From a block the prose marks as showing the wrong way. */
	counterExample: boolean;
}

/** Every markdown document in scope. */
export function documents(): string[] {
	return ['packages', '.claude', 'guides', 'examples']
		.flatMap(
			(root) =>
				walkFiles(join(repoRoot, root), {
					skip: SKIP_DIRS,
					keep: (name) => name.endsWith('.md') && !isRecordOfThePast(name)
				}).files
		)
		.concat(
			// The two root documents. `CLAUDE.md` is the one every session loads
			// first, and it was the one document with no guard behind it: the
			// audit found it naming APIs that do not exist and a skill file that
			// never did (AUDIT-2026-09-03-FINDINGS G1, G2, G3, G8).
			['README.md', 'CLAUDE.md']
				.map((name) => join(repoRoot, name))
				.filter((file) => existsSync(file))
		);
}

/**
 * The fenced blocks that name this library, from one document.
 *
 * A block that never mentions `@composable-svelte` is somebody else's code — a
 * shell transcript, a Vite config, a JSON sample — and typechecking it would
 * report on things this repository does not own.
 */
export function blocksIn(file: string): DocBlock[] {
	const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const path = relative(repoRoot, file);
	const out: DocBlock[] = [];
	const lineOf = (index: number) => source.slice(0, index).split('\n').length;

	/** Whether the prose just above this fence marks it as the wrong way. */
	const markedWrong = (index: number): boolean => {
		const before = source.slice(0, index).split('\n').filter((l) => l.trim()).slice(-2);
		return before.some((line) => COUNTER_EXAMPLE_MARKERS.some((m) => m.test(line)));
	};

	const typescript = /^```(?:ts|typescript)\b[^\n]*\n([\s\S]*?)^```/gm;
	for (let m = typescript.exec(source); m; m = typescript.exec(source)) {
		if (!m[1]!.includes('@composable-svelte')) continue;
		out.push({
			file: path,
			line: lineOf(m.index),
			kind: 'ts',
			source: m[1]!,
			name: '',
			counterExample: markedWrong(m.index)
		});
	}

	const svelte = /^```svelte\b[^\n]*\n([\s\S]*?)^```/gm;
	for (let m = svelte.exec(source); m; m = svelte.exec(source)) {
		if (!m[1]!.includes('@composable-svelte')) continue;
		// Only a typed script has anything a TypeScript program can check. A
		// block with no `<script>`, or an untyped one, is markup — out of reach
		// here, and said so in the file docstring rather than counted as covered.
		const script = /<script[^>]*\blang=["']ts["'][^>]*>([\s\S]*?)<\/script>/.exec(m[1]!);
		if (!script) continue;
		out.push({
			file: path,
			line: lineOf(m.index),
			kind: 'svelte',
			source: script[1]!,
			name: '',
			counterExample: markedWrong(m.index)
		});
	}

	return out;
}

/** `@composable-svelte/<pkg>` → that package's built types. */
function builtTypePaths(): { paths: Record<string, string[]>; missing: string[] } {
	const paths: Record<string, string[]> = {};
	const missing: string[] = [];
	const packagesDir = join(repoRoot, 'packages');

	for (const pkg of listDirs(packagesDir)) {
		if (!existsSync(join(packagesDir, pkg, 'package.json'))) continue;
		const entry = join(packagesDir, pkg, 'dist', 'index.d.ts');
		if (!existsSync(entry)) {
			missing.push(pkg);
			continue;
		}
		paths[`@composable-svelte/${pkg}`] = [entry];
		paths[`@composable-svelte/${pkg}/*`] = [join(packagesDir, pkg, 'dist', '*')];
	}

	return { paths, missing };
}

/**
 * Ambient declarations a documented example may legitimately rely on.
 *
 * `types: []` keeps `@types/node` out — a snippet reaching for `process` should
 * not look correct when a consumer's browser build would fail — but it also
 * removes Vite's `ImportMeta` augmentation, and `import.meta.env`,
 * `import.meta.hot` and `import.meta.glob` are ordinary, correct things for a
 * Vite application to write.
 *
 * Without this the guard reported four errors against documentation that was
 * right, which is worse than reporting nothing: it would have had me "fix"
 * working examples into broken ones.
 */
const VITE_AMBIENT = `
interface ImportMetaEnv { readonly [key: string]: string | boolean | undefined }
interface ImportMetaHot {
	dispose(callback: () => void): void;
	accept(callback?: (module: unknown) => void): void;
	data: Record<string, unknown>;
}
interface ImportMeta {
	readonly env: ImportMetaEnv;
	readonly hot?: ImportMetaHot;
	glob(pattern: string, options?: unknown): Record<string, () => Promise<unknown>>;
}
`;
const AMBIENT_FILE = '/documented/ambient.d.ts';

export interface CheckResult {
	blocks: DocBlock[];
	findings: Finding[];
	/** Packages with no `dist` — the check cannot speak for these. */
	unbuilt: string[];
	/** Every semantic diagnostic, including the noise, for the vacuity arms. */
	total: number;
}

/** Compile every block and report only what the surface codes catch. */
export function checkDocs(): CheckResult {
	return checkBlocks(documents().flatMap((file) => blocksIn(file)));
}

/**
 * Compile an explicit list of blocks.
 *
 * Exported for one reason: the guard's positive control. Every other arm in
 * `doc-typecheck.test.ts` passes when `SURFACE_CODES` is empty, when the
 * `paths` mapping resolves to nothing, or when the filter is inverted — a guard
 * that reports zero looks exactly like a repository with zero defects. Now that
 * `REGISTER` is empty there is no live finding to contradict any of that, so
 * the test compiles a block it knows to be wrong and asserts the machinery
 * still says so.
 */
export function checkBlocks(blocks: DocBlock[]): CheckResult {
	blocks.forEach((block, index) => {
		block.name = `/documented/${index}.ts`;
	});

	const { paths, missing } = builtTypePaths();
	const virtual = new Map(blocks.map((b) => [b.name, b.source]));
	virtual.set(AMBIENT_FILE, VITE_AMBIENT);

	const host = ts.createCompilerHost({});
	const readReal = host.getSourceFile.bind(host);
	host.getSourceFile = (name, language, onError, shouldCreate) =>
		virtual.has(name)
			? ts.createSourceFile(name, virtual.get(name)!, language, true)
			: readReal(name, language, onError, shouldCreate);
	host.fileExists = (name) => virtual.has(name) || ts.sys.fileExists(name);
	host.readFile = (name) => (virtual.has(name) ? virtual.get(name) : ts.sys.readFile(name));

	const program = ts.createProgram([...virtual.keys()], {
		noEmit: true,
		strict: true,
		skipLibCheck: true,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.ES2022,
		baseUrl: repoRoot,
		paths,
		// No ambient `@types` packages: a documented example is read on its own,
		// and pulling node's globals in would let a snippet reference `process`
		// and look correct when a consumer's browser build would not.
		types: []
	}, host);

	const all = program.getSemanticDiagnostics();
	const byName = new Map(blocks.map((b) => [b.name, b]));

	const findings = all
		.filter((d) => SURFACE_CODES.has(d.code) && d.file && byName.has(d.file.fileName))
		.map((d) => {
			const block = byName.get(d.file!.fileName)!;
			return {
				file: block.file,
				line: block.line,
				kind: block.kind,
				code: d.code,
				message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
				counterExample: block.counterExample
			};
		});

	return { blocks, findings, unbuilt: missing, total: all.length };
}

/** The key a finding is registered under: line-independent, so edits do not churn it. */
export const keyOf = (finding: Pick<Finding, 'file' | 'code' | 'message'>): string =>
	`${finding.file} :: TS${finding.code} :: ${finding.message}`;
