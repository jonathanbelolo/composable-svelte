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
}

export interface Finding {
	file: string;
	line: number;
	kind: DocBlock['kind'];
	code: number;
	message: string;
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
		.concat(existsSync(join(repoRoot, 'README.md')) ? [join(repoRoot, 'README.md')] : []);
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

	const typescript = /^```(?:ts|typescript)\b[^\n]*\n([\s\S]*?)^```/gm;
	for (let m = typescript.exec(source); m; m = typescript.exec(source)) {
		if (!m[1]!.includes('@composable-svelte')) continue;
		out.push({ file: path, line: lineOf(m.index), kind: 'ts', source: m[1]!, name: '' });
	}

	const svelte = /^```svelte\b[^\n]*\n([\s\S]*?)^```/gm;
	for (let m = svelte.exec(source); m; m = svelte.exec(source)) {
		if (!m[1]!.includes('@composable-svelte')) continue;
		// Only a typed script has anything a TypeScript program can check. A
		// block with no `<script>`, or an untyped one, is markup — out of reach
		// here, and said so in the file docstring rather than counted as covered.
		const script = /<script[^>]*\blang=["']ts["'][^>]*>([\s\S]*?)<\/script>/.exec(m[1]!);
		if (!script) continue;
		out.push({ file: path, line: lineOf(m.index), kind: 'svelte', source: script[1]!, name: '' });
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
	const blocks = documents().flatMap((file) => blocksIn(file));
	blocks.forEach((block, index) => {
		block.name = `/documented/${index}.ts`;
	});

	const { paths, missing } = builtTypePaths();
	const virtual = new Map(blocks.map((b) => [b.name, b.source]));

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
				message: ts.flattenDiagnosticMessageText(d.messageText, ' ')
			};
		});

	return { blocks, findings, unbuilt: missing, total: all.length };
}

/** The key a finding is registered under: line-independent, so edits do not churn it. */
export const keyOf = (finding: Pick<Finding, 'file' | 'code' | 'message'>): string =>
	`${finding.file} :: TS${finding.code} :: ${finding.message}`;
