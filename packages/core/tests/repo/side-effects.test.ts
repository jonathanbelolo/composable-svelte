/**
 * Every bare side-effect import must be covered by its package's `sideEffects`.
 *
 * `import './websocket/effect-websocket.js'` in core's barrel exists to run
 * `Effect.websocket = { … }`. Nothing imports a *binding* from that module, so a
 * bundler is free to drop the statement — and `Effect.websocket` then becomes
 * `undefined` at runtime, with no error anywhere.
 *
 * The subtlety this test exists to pin, because I got it wrong once: allowlisting
 * the *target* is not enough. If the **importing** module is marked
 * side-effect-free, the bundler removes its unused top-level statements — the
 * bare import among them — before it ever consults the target's flag. The barrel
 * has to be listed too.
 *
 * Measured with a real Vite lib build against a packed tarball. `sideEffects`
 * absent: `Effect.websocket = {` survives. `sideEffects: false`, or an allowlist
 * naming only the target: dropped. An allowlist naming the barrel *and* the
 * target: survives, and still shakes to the same 17,563 bytes as a blanket
 * `**\/*.js`.
 *
 * This is the cheap structural stand-in for that experiment, so CI does not need
 * a bundler.
 *
 * It walks the whole chain from each package entry, not just the module holding
 * the bare import — a hostile review demonstrated that checking one hop is not
 * enough. Move the bare import one re-export outward and a one-hop check passes
 * while Vite still drops the registration, because a side-effect-free
 * *intermediate* deletes the re-export before the leaf's flag is ever consulted.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { kindOf, walkFiles, listDirs } from './walk.js';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Bare `import 'x';` — no bindings, so it is kept only for its side effect. */
const BARE_IMPORT = /^[ \t]*import[ \t]+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

/**
 * A top-level assignment into an imported binding — `Effect.api = api;`.
 *
 * The second way a module exists only for its side effect, and the one the
 * first version of this guard could not see: `dist/api/effect-api.js` attaches
 * `Effect.api` at import time exactly as `effect-websocket.js` attaches
 * `Effect.websocket`, but it is reached through a *binding* re-export
 * (`export { api } from './effect-api.js'`) rather than a bare import. An unused
 * binding re-export out of a side-effect-free module is dropped before the
 * assignment ever runs, and `Effect.api` was `undefined` in every bundled
 * consumer while this guard was green (AUDIT-2026-09-03-FINDINGS P1).
 *
 * Leading whitespace is allowed. The first version anchored at column 0 so
 * that an assignment inside a function body would not count, and the R0
 * review showed the cost: the same assignment indented by two spaces — a
 * top-level `try`, `if` or block, all of them import-time code — made the
 * guard report core's api chain as clean. An assignment in a function body
 * now matches too; that is a false positive the `sideEffects` list can carry
 * (measured over every package's dist: none today), where the miss was
 * silent. Bracket access and the logical assignments are the other spellings.
 * A JSDoc example is still not code: block comments are stripped first.
 */
const IMPORTED_MUTATION =
	/^[ \t]*([A-Za-z_$][\w$]*)(?:\.[\w$]+|\[[^\]]+\])+\s*(?:\?\?|\|\||&&)?=(?!=)/gm;

/**
 * Minified module syntax — `import{Effect}from'./e.js'`, `export*from` — which
 * none of the regexes in this file can read. Exported for its control.
 */
export function looksMinified(source: string): boolean {
	return /^(?:import|export)[{'"*]/m.test(source);
}

/** The local names a module's `import` statements bind. */
export function importBindings(source: string): Set<string> {
	const out = new Set<string>();
	const re = /^import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\*\s+as\s+([A-Za-z_$][\w$]*)|\{([^}]*)\})?\s*from\s*['"]/gm;
	for (const m of source.matchAll(re)) {
		if (m[1]) out.add(m[1]);
		if (m[2]) out.add(m[2]);
		if (m[3]) {
			for (const part of m[3].split(',')) {
				const name = part.trim().split(/\s+as\s+/).pop()?.trim();
				if (name) out.add(name);
			}
		}
	}
	return out;
}

/** Source with block comments removed, so a commented-out assignment is not a marker. */
function withoutBlockComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The imported bindings a module assigns into at its top level. */
export function mutatedImports(source: string): string[] {
	const bindings = importBindings(source);
	const roots = [...withoutBlockComments(source).matchAll(IMPORTED_MUTATION)].map((m) => m[1]!);
	return [...new Set(roots.filter((root) => bindings.has(root)))];
}

/** Translate one `sideEffects` glob into a regex. Supports `*` and `**`. */
function globToRegExp(pattern: string): RegExp {
	const p = pattern.replace(/^\.\//, '');
	let out = '';
	let i = 0;
	while (i < p.length) {
		if (p.startsWith('**/', i)) {
			out += '(?:[^/]*/)*';
			i += 3;
		} else if (p.startsWith('**', i)) {
			out += '.*';
			i += 2;
		} else if (p[i] === '*') {
			out += '[^/]*';
			i += 1;
		} else {
			out += p[i]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
			i += 1;
		}
	}
	return new RegExp(`^${out}$`);
}

/** Does `sideEffects` mark this path as side-effectful? */
function covered(sideEffects: unknown, relPath: string): boolean {
	if (sideEffects === undefined || sideEffects === true) return true;
	if (sideEffects === false) return false;
	if (!Array.isArray(sideEffects)) return false;
	return sideEffects.some((pattern: string) => globToRegExp(pattern).test(relPath));
}

/** Every relative specifier a module imports or re-exports from. */
function relativeDeps(source: string): string[] {
	const out: string[] = [];
	for (const re of [
		/(?:^|\n)\s*import\s+[^;'"]*?from\s*['"](\.[^'"]+)['"]/g,
		/(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g,
		/(?:^|\n)\s*export\s+[^;'"]*?from\s*['"](\.[^'"]+)['"]/g
	]) {
		for (const m of source.matchAll(re)) out.push(m[1]!);
	}
	return out;
}

/** The entry files a consumer can reach, from the package's exports map. */
function entryFiles(pkgDir: string, pkg: { exports?: Record<string, unknown> }): string[] {
	const targets = new Set<string>();
	const collect = (t: unknown) => {
		if (typeof t === 'string') {
			if (t.endsWith('.js')) targets.add(t);
		} else if (t && typeof t === 'object') {
			Object.values(t as Record<string, unknown>).forEach(collect);
		}
	};
	Object.entries(pkg.exports ?? {}).forEach(([subpath, t]) => {
		if (subpath.includes('*')) return; // wildcards cannot be enumerated
		collect(t);
	});
	return [...targets].map((t) => join(pkgDir, t.replace(/^\.\//, '')));
}

/** Files that might name a subpath: sources, and the documents about them. */
function referencingFiles(): string[] {
	// `plans/` holds historical design records — they describe APIs that were
	// considered and often not built, are not published (`files` excludes them),
	// and are not instructions to anyone.
	const skip = ['node_modules', 'dist', '.svelte-kit', '.git', 'plans', 'worktrees'];

	// A changelog quotes what used to be wrong — that is its job — so it is
	// excluded for the same reason `plans/` is: both are records of the past, not
	// instructions. Live documentation is still scanned.
	const keep = (name: string) => name !== 'CHANGELOG.md' && /\.(ts|js|svelte|md)$/.test(name);

	const out = ['packages', 'examples', 'guides', '.claude'].flatMap(
		(dir) => walkFiles(join(repoRoot, dir), { skip, keep }).files
	);
	return out;
}

/**
 * What a package's exports map turns `subpath` into, or null if nothing matches.
 *
 * Exact keys win over patterns, and a longer pattern prefix wins over a shorter
 * one — Node's own rule.
 */
function resolveSubpath(pkgDir: string, subpath: string): string | null {
	const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
	const exports: Record<string, unknown> = pkg.exports ?? {};

	const target = (entry: unknown): string | null => {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>;
			for (const condition of ['svelte', 'default', 'types']) {
				const value = record[condition];
				if (typeof value === 'string') return value;
			}
		}
		return null;
	};

	if (subpath in exports) {
		const file = target(exports[subpath]);
		return file ? join(pkgDir, file.replace(/^\.\//, '')) : null;
	}

	const patterns = Object.keys(exports)
		.filter((key) => key.includes('*'))
		.sort((a, b) => b.indexOf('*') - a.indexOf('*'));

	for (const pattern of patterns) {
		const [prefix, suffix] = pattern.split('*') as [string, string];
		if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
		const filled = subpath.slice(prefix.length, subpath.length - (suffix.length || 0));
		const file = target(exports[pattern]);
		if (!file) continue;
		return join(pkgDir, file.replace('*', filled).replace(/^\.\//, ''));
	}

	return null;
}

function resolveFrom(fromFile: string, spec: string): string | null {
	const base = join(fromFile, '..', spec);
	for (const c of [base, `${base}.js`, join(base, 'index.js'), base.replace(/\.js$/, '.svelte')]) {
		if (kindOf(c) === 'file') return c;
	}
	return null;
}

const packages = listDirs(packagesDir).filter((name) =>
	existsSync(join(packagesDir, name, 'package.json'))
);

describe('side-effect imports survive tree-shaking', () => {
	it('the glob translation is right', () => {
		expect(globToRegExp('**/*.css').test('dist/styles/globals.css')).toBe(true);
		expect(globToRegExp('dist/index.js').test('dist/index.js')).toBe(true);
		expect(globToRegExp('dist/index.js').test('dist/websocket/index.js')).toBe(false);
		expect(globToRegExp('**/*.svelte').test('dist/node-canvas/NodeCanvas.svelte')).toBe(true);
	});

	it.each(packages)('%s is built, so this guard is not vacuous', (name) => {
		// `return`-ing on a missing dist scores as a pass, which made this silently
		// meaningless on a fresh clone: dist is gitignored and the root `test`
		// script has no build dependency.
		expect(
			existsSync(join(packagesDir, name, 'dist')),
			`${name}/dist is missing — run \`pnpm -r build\` first, or this test proves nothing`
		).toBe(true);
	});

	it('every referenced subpath resolves to a file that exists', () => {
		// The wildcard `"./*": "./dist/*.js"` turns a *directory* subpath into a
		// file that cannot exist: `@composable-svelte/chat/streaming-chat` became
		// `dist/streaming-chat.js`. It was named in three documents and had never
		// resolved — and the existence check below could not see it, because that
		// one only inspects explicit entries.
		//
		// The rule is deliberately "referenced", not "every dist directory with an
		// index.js". The stronger version reads well and is wrong: it would force
		// forty-odd internal build products in `core` — every `components/ui/*` —
		// into public API to satisfy a lint. What matters is that a subpath
		// someone actually writes down works.
		const specifier = /@composable-svelte\/([a-z-]+)\/([A-Za-z0-9_./-]+)/g;
		const broken: string[] = [];
		const seen = new Set<string>();

		for (const file of referencingFiles()) {
			const source = readFileSync(file, 'utf8');
			for (const match of source.matchAll(specifier)) {
				const [full, pkg, subpath] = match as unknown as [string, string, string];
				// `…/dist/…` in prose is a file path being described, not a specifier
				// anyone imports — the exports map deliberately does not expose it.
				if (!packages.includes(pkg) || subpath.startsWith('dist') || seen.has(full)) continue;
				seen.add(full);

				const target = resolveSubpath(join(packagesDir, pkg), `./${subpath}`);
				if (target === null) {
					broken.push(`${full} — no exports entry matches`);
				} else if (!existsSync(target)) {
					broken.push(`${full} -> ${relative(repoRoot, target)} (missing)`);
				}
			}
		}

		expect(
			broken,
			'these subpaths are written down somewhere and do not resolve. Add an ' +
				'explicit exports entry, or stop referencing them.'
		).toEqual([]);
	});

	it.each(packages)('%s exports map points at files that exist', (name) => {
		// A subpath whose target is missing fails at *import* time with
		// ERR_MODULE_NOT_FOUND, which no build step and no typecheck catches.
		// `@composable-svelte/chat/streaming-chat` was documented in three places
		// and resolved to `dist/streaming-chat.js` — a file that has never
		// existed, because the wildcard `"./*"` entry cannot see that
		// `streaming-chat` is a directory.
		//
		// This used to be a `.filter(existsSync)` in `entryFiles`, which silently
		// dropped exactly the case worth reporting.
		const pkgDir = join(packagesDir, name);
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

		const missing = entryFiles(pkgDir, pkg).filter((f) => !existsSync(f));

		expect(
			missing.map((f) => relative(pkgDir, f)),
			`${name} declares subpaths whose targets are not in dist — run ` +
				`\`pnpm -r build\`, then check the exports map.`
		).toEqual([]);
	});

	it.each(packages.filter((name) => name !== 'core'))(
		'%s declares every side-effect module it relies on',
		(name) => {
			const pkgDir = join(packagesDir, name);
			const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

			expect(
				uncoveredChains(pkgDir, pkg.sideEffects, entryFiles(pkgDir, pkg)),
				`${name}: a side-effect module is reachable only through a module marked ` +
					`side-effect-free, so a bundler may drop the edge before it ever consults ` +
					`the target's flag. Every module on the chain from the entry must be ` +
					`listed in "sideEffects", not only the one holding the import or assignment.`
			).toEqual([]);
		}
	);

	it.each(packages)('%s ships dist in the shape the markers read', (name) => {
		// Every regex in this file — BARE_IMPORT, IMPORTED_MUTATION,
		// importBindings, relativeDeps — assumes one statement per line with
		// whitespace after `import` and `export`. A minified emission matches
		// none of them, and the chain walk would go silent rather than red.
		const dist = join(packagesDir, name, 'dist');
		const files = walkFiles(dist, { skip: ['node_modules'], keep: (f) => f.endsWith('.js') }).files;
		const minified = files.filter((file) => looksMinified(readFileSync(file, 'utf8')));

		expect(
			minified.map((f) => relative(dist, f)),
			`${name}: minified module syntax, which the side-effect markers cannot read`
		).toEqual([]);
		// And the shape they do read is present, so the arm is about something.
		expect(files.some((file) => /^import\s/m.test(readFileSync(file, 'utf8')))).toBe(true);
	});

	it("P1 (pinned defect): core's Effect.api registration chain is uncovered", () => {
		// Pinned, not fixed: `dist/api/effect-api.js` assigns `Effect.api` at
		// import and is reached from `dist/index.js` and `dist/api/index.js` by
		// binding re-export, none of which `sideEffects` lists. This asserts
		// the chain to it IS reported — whichever link is the unprotected one,
		// so a partial listing still reads as uncovered; the first form named
		// the barrel and went red when the barrel alone was listed, which does
		// not fix the bundle. It fails the moment R1.2 lists the whole chain,
		// and must be removed in that commit together with core's exclusion
		// from the arm above. AUDIT-2026-09-03-FINDINGS P1.
		const pkgDir = join(packagesDir, 'core');
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
		const problems = uncoveredChains(pkgDir, pkg.sideEffects, entryFiles(pkgDir, pkg));

		expect(problems.some((p) => p.includes('dist/api/effect-api.js'))).toBe(true);
		// And nothing else in core is uncovered: the websocket chain is listed.
		expect(problems.filter((p) => !p.includes('dist/api/'))).toEqual([]);
	});
});

/**
 * Walk down from every entry, carrying the path. When a side-effect module is
 * reached — a bare import, or an assignment into an imported binding — every
 * module on the chain to it must be covered, because any side-effect-free link
 * lets a bundler delete the edge above it. Exported for the positive controls.
 */
export function uncoveredChains(pkgDir: string, sideEffects: unknown, entries: string[]): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();

	const visit = (file: string, path: string[]) => {
		if (seen.has(file)) return;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		const chain = [...path, file];
		// CSS is exempt, and that is measured rather than assumed: a real Vite
		// build keeps `import 'maplibre-gl/dist/maplibre-gl.css'` in a retained
		// component even under `sideEffects: false`, because the CSS pipeline
		// treats it as a side effect independently of the flag. A bare *JS*
		// import gets no such treatment — that is the one that vanished.
		const bare = [...source.matchAll(BARE_IMPORT)]
			.map((m) => m[1]!)
			.filter((spec) => !/\.(css|scss|sass|less)$/.test(spec));
		const mutated = mutatedImports(source);

		if (bare.length > 0 || mutated.length > 0) {
			const gap = chain.find((m) => !covered(sideEffects, relative(pkgDir, m)));
			if (gap) {
				const what = [
					bare.length > 0 ? `bare: ${bare.join(', ')}` : '',
					mutated.length > 0 ? `assigns into: ${mutated.join(', ')}` : ''
				]
					.filter(Boolean)
					.join('; ');
				problems.push(`${relative(pkgDir, file)} (${what}) — unprotected link: ${relative(pkgDir, gap)}`);
			}
		}

		for (const spec of relativeDeps(source)) {
			const next = resolveFrom(file, spec);
			if (next) visit(next, chain);
		}
	};

	for (const entry of entries) {
		if (existsSync(entry)) visit(entry, []);
	}

	return problems;
}

describe('the chain walk itself', () => {
	// Positive controls, through the real walk, on a package built in a temp
	// directory: the arms above are `filter`s over regexes and a regex that
	// matches nothing passes exactly like a clean tree.
	function scratchPackage(files: Record<string, string>): string {
		const dir = mkdtempSync(join(tmpdir(), 'side-effects-'));
		for (const [rel, content] of Object.entries(files)) {
			mkdirSync(join(dir, rel, '..'), { recursive: true });
			writeFileSync(join(dir, rel), content);
		}
		return dir;
	}

	const attachingPackage = () =>
		scratchPackage({
			'dist/index.js': "export { api } from './api.js';\n",
			'dist/api.js': "import { Effect } from './effect.js';\nexport const api = 1;\nEffect.api = api;\n",
			'dist/effect.js': 'export const Effect = {};\n'
		});

	it('reads the local names an import binds', () => {
		expect([...importBindings("import D, { a, b as c } from 'x';\nimport * as ns from 'y';\n")]).toEqual([
			'D',
			'a',
			'c',
			'ns'
		]);
	});

	it('sees an assignment into an import wherever it sits, and not one in a comment', () => {
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api = 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\n/* Effect.api = 1; */\n")).toEqual([]);
		// Indented: a top-level block, the shape that evaded the column-0 form.
		expect(mutatedImports("import { Effect } from './e.js';\ntry {\n  Effect.api = 1;\n} catch {}\n")).toEqual(['Effect']);
		// A function body matches too — accepted; see IMPORTED_MUTATION.
		expect(mutatedImports("import { Effect } from './e.js';\nfunction f() {\n  Effect.api = 1;\n}\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect['api'] = 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api ??= 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api === 1;\n")).toEqual([]);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api == 1;\n")).toEqual([]);
		expect(mutatedImports("const Local = {};\nLocal.x = 1;\n")).toEqual([]);
	});

	it('tells minified module syntax from the shape the markers read', () => {
		expect(looksMinified("import{Effect}from'./e.js';Effect.api=1;")).toBe(true);
		expect(looksMinified("export*from'./x.js';")).toBe(true);
		expect(looksMinified("import { Effect } from './e.js';\nexport * from './x.js';\n")).toBe(false);
	});

	it('reports an assignment reached only through an unlisted re-export', () => {
		const dir = attachingPackage();
		try {
			const problems = uncoveredChains(dir, ['dist/index.js'], [join(dir, 'dist/index.js')]);
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('dist/api.js');
			expect(problems[0]).toContain('assigns into: Effect');
			expect(problems[0]).toContain('unprotected link: dist/api.js');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reports a bare import the same way', () => {
		const dir = scratchPackage({
			'dist/index.js': "export { x } from './mid.js';\n",
			'dist/mid.js': "import './register.js';\nexport const x = 1;\n",
			'dist/register.js': 'globalThis.registered = true;\n'
		});
		try {
			const problems = uncoveredChains(dir, ['dist/index.js', 'dist/register.js'], [join(dir, 'dist/index.js')]);
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('unprotected link: dist/mid.js');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('is satisfied once every link on the chain is listed', () => {
		const dir = attachingPackage();
		try {
			expect(uncoveredChains(dir, ['dist/index.js', 'dist/api.js'], [join(dir, 'dist/index.js')])).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

/**
 * A package's JSDoc must not tell you to import its own exports from elsewhere.
 *
 * `media`'s `audio-player` and `voice-input` barrels, and `chat`'s
 * `streaming-chat` barrel, each carried an `@example` importing that package's
 * own components from `@composable-svelte/code`. Wrong package entirely — and
 * unlike a mistake in a markdown file, this one **ships**: the comment is copied
 * verbatim into `dist/*.js` and `dist/*.d.ts`, so a consumer hovering the symbol
 * in their editor is told to install the wrong dependency.
 *
 * Nothing read it. Both documentation guards walk markdown; a JSDoc example is
 * invisible to them, which is how one survived long enough for the register to
 * record it and then miscount which files it was in.
 *
 * Cross-package examples are fine and common — `media` importing `createStore`
 * from `core` is correct. What is never right is naming a symbol the package
 * itself exports and sourcing it from a sibling.
 */
describe('JSDoc examples name the right package', () => {
	const packagesDir = join(repoRoot, 'packages');

	const offenders = listDirs(packagesDir).flatMap((pkg) => {
		const exported = existsSync(join(packagesDir, pkg, 'dist', 'index.d.ts'))
			? readFileSync(join(packagesDir, pkg, 'dist', 'index.d.ts'), 'utf8')
			: '';

		return walkFiles(join(packagesDir, pkg, 'src'), {
			skip: ['node_modules', 'dist', '.svelte-kit', '.git', 'plans', 'worktrees'],
			keep: (n) => n.endsWith('.ts') || n.endsWith('.svelte')
		}).files.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			const out: string[] = [];

			// A JSDoc import block: ` *   Name,` lines closed by ` * } from '…';`
			for (const m of source.matchAll(
				/^\s*\*\s*import\s*\{([\s\S]*?)\}\s*from\s*'(@composable-svelte\/[\w-]+)[^']*';/gm
			)) {
				const from = m[2]!.split('/')[1]!;
				if (from === pkg) continue;

				const names = m[1]!
					.split(/[,\n]/)
					.map((n) => n.replace(/^\s*\*?\s*/, '').trim())
					.filter(Boolean);

				const own = names.filter((n) => new RegExp(`\\b${n}\\b`).test(exported));
				if (own.length > 0) {
					out.push(`${relative(repoRoot, file)} sources ${own.join(', ')} from @composable-svelte/${from}`);
				}
			}

			return out;
		});
	});

	it('no package sources its own exports from a sibling', () => {
		expect(
			offenders,
			'this comment is copied into dist/*.js and dist/*.d.ts, so it ships:\n' +
				offenders.join('\n')
		).toEqual([]);
	});
});
