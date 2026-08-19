/**
 * No client-reachable entry point may reach server-only code.
 *
 * This is the defect that kept recurring: `ssr/index.ts` re-exported HTML
 * sanitisation next to `hydrateStore`, and the root entry re-exports through
 * that barrel — so every consumer of `@composable-svelte/core`, browser apps
 * included, pulled isomorphic-dompurify and therefore jsdom into their module
 * graph. Rollup tree-shook it back out, but only after parsing it, and jsdom
 * ships CommonJS not every bundler can parse. Nothing caught it: no test
 * asserted the `/ssr` surface, and no test crossed the package boundary into a
 * real module graph.
 *
 * The walk runs over built `dist/`, not `src/`, and that is load-bearing.
 * TypeScript has already erased type-only edges there, which is exactly why
 * `/ssr`'s `export type { … } from './ssg.js'` must not count as reaching
 * `fs/promises`. A source-level walk would have to re-implement that erasure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const pkgDir = fileURLToPath(new URL('../../', import.meta.url));
const distDir = join(pkgDir, 'dist');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

/**
 * Entries that are allowed to reach server-only code, because that is what they
 * are for. Anything not listed here is treated as client-reachable.
 */
const SERVER_ONLY_ENTRIES = new Set(['./ssr/ssg', './ssr/middleware', './tailwind-preset']);

/** Packages and builtins that must never appear in a client-reachable graph. */
const FORBIDDEN = [
	'isomorphic-dompurify',
	'jsdom',
	'dompurify',
	'fastify',
	'fs',
	'fs/promises',
	'path',
	'url',
	'os',
	'crypto',
	'http',
	'https',
	'stream',
	'zlib',
	'child_process',
	'worker_threads'
];

const isForbidden = (spec: string) =>
	spec.startsWith('node:') || FORBIDDEN.includes(spec) || FORBIDDEN.includes(spec.split('/')[0]!);

/** Static `import`/`export … from` specifiers, plus dynamic `import()`. */
function specifiersOf(source: string): string[] {
	const out: string[] = [];
	const patterns = [
		/(?:^|\n)\s*import\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
		/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
		/(?:^|\n)\s*export\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
	];
	for (const re of patterns) {
		for (const m of source.matchAll(re)) out.push(m[1]!);
	}
	return out;
}

/** `.svelte` files are not JS; pull specifiers out of their script blocks. */
function readModule(file: string): string {
	const source = readFileSync(file, 'utf8');
	if (!file.endsWith('.svelte')) return source;
	return [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join('\n');
}

/** Resolve a relative specifier against dist, tolerating extension rewrites. */
function resolveRelative(fromFile: string, spec: string): string | null {
	const base = resolve(dirname(fromFile), spec);
	const candidates = [
		base,
		base.replace(/\.js$/, '.svelte'),
		`${base}.js`,
		join(base, 'index.js')
	];
	for (const c of candidates) {
		if (existsSync(c) && statSync(c).isFile()) return c;
	}
	return null;
}

/** Walk an entry's graph; return every bare specifier it can reach. */
function bareSpecifiersFrom(entry: string): Map<string, string> {
	const found = new Map<string, string>(); // specifier -> first file that imports it
	const seen = new Set<string>();
	const queue = [entry];

	while (queue.length) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);

		for (const spec of specifiersOf(readModule(file))) {
			if (spec.startsWith('.')) {
				const next = resolveRelative(file, spec);
				if (next) queue.push(next);
				continue;
			}
			if (!found.has(spec)) found.set(spec, file);
		}
	}
	return found;
}

/** The JS entry file for a subpath, or null for CSS/asset entries. */
function entryFile(target: unknown): string | null {
	if (typeof target === 'string') return target.endsWith('.js') ? join(pkgDir, target) : null;
	if (target && typeof target === 'object') {
		const t = target as Record<string, string>;
		const file = t.default ?? t.node ?? t.svelte;
		return file?.endsWith('.js') ? join(pkgDir, file) : null;
	}
	return null;
}

describe('package entry graphs', () => {
	it('has a built dist to inspect', () => {
		expect(
			existsSync(distDir),
			'dist/ is missing — run `pnpm --filter @composable-svelte/core build` first'
		).toBe(true);
	});

	const subpaths = Object.entries(pkg.exports as Record<string, unknown>)
		.map(([subpath, target]) => [subpath, entryFile(target)] as const)
		.filter((pair): pair is readonly [string, string] => pair[1] !== null);

	it('found the entry points', () => {
		expect(subpaths.length).toBeGreaterThan(15);
	});

	const clientEntries = subpaths.filter(([subpath]) => !SERVER_ONLY_ENTRIES.has(subpath));

	it.each(clientEntries)('%s reaches no server-only code', (subpath, file) => {
		expect(existsSync(file), `${subpath}: ${file} does not exist`).toBe(true);

		const reached = bareSpecifiersFrom(file);
		const violations = [...reached]
			.filter(([spec]) => isForbidden(spec))
			.map(([spec, via]) => `${spec} (via ${via.replace(pkgDir, '')})`);

		expect(violations, `${subpath} must stay client-safe`).toEqual([]);
	});

	it('the server-only entries are the ones that actually need to be', () => {
		// If a listed entry stops reaching server-only code, the allowlist entry
		// is stale and should be removed rather than left as dead permission.
		const ssg = bareSpecifiersFrom(join(pkgDir, 'dist/ssr/ssg.js'));
		expect([...ssg.keys()].some(isForbidden)).toBe(true);

		const middleware = bareSpecifiersFrom(join(pkgDir, 'dist/ssr/middleware/index.js'));
		expect([...middleware.keys()]).toContain('isomorphic-dompurify');

		const preset = bareSpecifiersFrom(join(pkgDir, 'dist/tailwind-preset.js'));
		expect([...preset.keys()].some(isForbidden)).toBe(true);
	});
});
