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
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Bare `import 'x';` — no bindings, so it is kept only for its side effect. */
const BARE_IMPORT = /^[ \t]*import[ \t]+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const full = join(dir, e.name);
		if (e.isDirectory()) return walk(full);
		return /\.(js|svelte)$/.test(e.name) ? [full] : [];
	});
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

function resolveFrom(fromFile: string, spec: string): string | null {
	const base = join(fromFile, '..', spec);
	for (const c of [base, `${base}.js`, join(base, 'index.js'), base.replace(/\.js$/, '.svelte')]) {
		if (existsSync(c) && statSync(c).isFile()) return c;
	}
	return null;
}

const packages = readdirSync(packagesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'package.json')))
	.map((e) => e.name);

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

	it.each(packages)('%s declares every bare import it relies on', (name) => {
		const pkgDir = join(packagesDir, name);
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
		const { sideEffects } = pkg;

		const problems: string[] = [];
		const seen = new Set<string>();

		// Walk down from every entry, carrying the path. When a module with a bare
		// import is reached, every module on that path must be covered — any
		// side-effect-free link in the chain can delete the edge above it.
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

			if (bare.length > 0) {
				const gap = chain.find((m) => !covered(sideEffects, relative(pkgDir, m)));
				if (gap) {
					problems.push(
						`${relative(pkgDir, file)} (bare: ${bare.join(', ')}) — ` +
							`unprotected link: ${relative(pkgDir, gap)}`
					);
				}
			}

			for (const spec of relativeDeps(source)) {
				const next = resolveFrom(file, spec);
				if (next) visit(next, chain);
			}
		};

		for (const entry of entryFiles(pkgDir, pkg)) {
			if (existsSync(entry)) visit(entry, []);
		}

		expect(
			problems,
			`${name}: a bare side-effect import is reachable only through a module ` +
				`marked side-effect-free, so a bundler may drop the edge before it ever ` +
				`consults the target's flag. Every module on the chain from the entry ` +
				`must be listed in "sideEffects", not only the one holding the import.`
		).toEqual([]);
	});
});
