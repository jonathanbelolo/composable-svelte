/**
 * The package root must never reach an optional peer.
 *
 * `mapbox-gl` is an optional peer: most consumers do not install it. If any
 * module reachable from `src/lib/index.ts` imports it, then
 * `import { Map } from '@composable-svelte/maps'` throws for all of them —
 * a package that fails at load for the majority to serve a minority.
 *
 * This is not hypothetical. `chat` shipped exactly this defect, statically
 * importing its own optional peer, and it is recorded as an S2 in
 * `plans/hardening/README.md` — the class of finding that "breaks a consumer at
 * install or build time". The separation here is enforced by the `exports` map
 * and by this test, rather than by remembering.
 *
 * Verified against a packed tarball as well, during the change that introduced
 * `MapboxAdapter`: 12 modules were reachable from the barrel, `mapbox-gl` was
 * not among them, and the same walk found it from the `/mapbox` entry. This is
 * the cheap, always-on version of that.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// `process.cwd()`, not `import.meta.url`: this package's vitest runs under
// jsdom, where `import.meta.url` is an http URL and `fileURLToPath` rejects it.
// Vitest runs from the package root.
const srcRoot = join(process.cwd(), 'src/lib');

/** Every specifier a module imports, `.svelte` files included. */
function importsOf(file: string): string[] {
	const source = readFileSync(file, 'utf8');
	return [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g)]
		.map((m) => m[1] ?? m[2])
		.filter((s): s is string => Boolean(s));
}

/** Resolve a relative specifier the way the build will. */
function resolveLocal(from: string, spec: string): string | null {
	const base = resolve(dirname(from), spec.replace(/\.js$/, ''));
	for (const candidate of [base, `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')]) {
		if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
	}
	return null;
}

/** Walk the module graph from an entry, collecting bare specifiers seen. */
function reachableFrom(entry: string): { modules: Set<string>; bare: Set<string> } {
	const modules = new Set<string>();
	const bare = new Set<string>();

	const walk = (file: string) => {
		if (modules.has(file) || !existsSync(file)) return;
		modules.add(file);

		for (const spec of importsOf(file)) {
			if (!spec.startsWith('.')) {
				bare.add(spec);
				continue;
			}
			const next = resolveLocal(file, spec);
			if (next) walk(next);
		}
	};

	walk(entry);
	return { modules, bare };
}

const OPTIONAL_PEERS = ['mapbox-gl'];

describe('the package root is free of optional peers', () => {
	const root = reachableFrom(join(srcRoot, 'index.ts'));

	it('reaches a real module graph, so the arm below is not vacuous', () => {
		// A resolver that silently returned nothing would make every isolation
		// claim trivially true. The barrel reaches the components and the
		// reducer, so this floor is comfortably above what a broken walk gives.
		expect(root.modules.size).toBeGreaterThan(8);
	});

	it.each(OPTIONAL_PEERS)('does not import %s', (peer) => {
		const offenders = [...root.bare].filter((spec) => spec === peer || spec.startsWith(`${peer}/`));
		expect(
			offenders,
			`the package root imports the optional peer "${peer}" — every consumer without it fails at load`
		).toEqual([]);
	});

	it('does reach maplibre-gl, which is a real dependency', () => {
		// The control for the arm above: the walk finds a bare specifier when
		// there is one to find, so "no mapbox-gl" means absence rather than
		// blindness.
		expect([...root.bare].some((s) => s.startsWith('maplibre-gl'))).toBe(true);
	});
});

describe('the mapbox entry point is where the peer lives', () => {
	const entry = reachableFrom(join(srcRoot, 'mapbox/index.ts'));

	it('imports mapbox-gl', () => {
		// If this fails, the adapter has stopped using the SDK and the whole
		// separation is pointless — or the entry point moved and the test above
		// is now guarding nothing.
		expect([...entry.bare].some((s) => s.startsWith('mapbox-gl'))).toBe(true);
	});

	it('shares the layer translation rather than copying it', () => {
		expect([...entry.modules].some((m) => m.endsWith('layer-spec.ts'))).toBe(true);
	});
});
