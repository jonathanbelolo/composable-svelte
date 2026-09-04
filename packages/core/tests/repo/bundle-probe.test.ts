/**
 * What survives a real bundler.
 *
 * `side-effects.test.ts` is the structural stand-in; this is the experiment
 * it stands in for. A consumer that imports `Effect` from the root is bundled
 * with esbuild — tree-shaking on, `sideEffects` honoured through the real
 * `@composable-svelte/core` resolution from a workspace that links it — and
 * the output is read for the import-time registrations the library relies
 * on. `Effect.api` was `undefined` in every bundled consumer for as long as
 * only the structural guard existed (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, P1).
 *
 * Asserted on the output text, not by evaluating it: the bundle imports
 * `svelte` and ships an uncompiled `$state` rune, so a `vm` run would need
 * half a Svelte runtime stubbed and would test the stubs.
 */

import { describe, it, expect } from 'vitest';
import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
/** A workspace that depends on core, so bare `@composable-svelte/core` resolves through its real exports map. */
const resolveDir = join(repoRoot, 'examples', 'counter');

/** The root entry reaches components; only JS survival matters here. */
const svelteStub: esbuild.Plugin = {
	name: 'svelte-stub',
	setup(build) {
		build.onLoad({ filter: /\.svelte$/ }, () => ({ contents: 'export default {};', loader: 'js' }));
	}
};

async function bundle(contents: string): Promise<string> {
	const result = await esbuild.build({
		stdin: { contents, resolveDir, loader: 'js' },
		bundle: true,
		format: 'esm',
		platform: 'browser',
		treeShaking: true,
		write: false,
		minifyIdentifiers: false,
		logLevel: 'silent',
		external: ['svelte', 'svelte/*', 'motion', 'clsx', 'tailwind-merge', 'zod', 'intl-messageformat', 'path-to-regexp', 'isomorphic-dompurify'],
		plugins: [svelteStub]
	});
	return result.outputFiles[0]!.text;
}

// esbuild suffixes colliding top-level names (`Effect2`), hence the `\d*`.
const ATTACHES_API = /\bEffect\d*\.api\s*=/;
const ATTACHES_WEBSOCKET = /\bEffect\d*\.websocket\s*=/;

const consumer = `import { Effect, createStore } from '@composable-svelte/core';
export const store = createStore({ initialState: 0, reducer: (s) => [s, Effect.none()] });`;

describe('a bundled consumer of the root entry', { timeout: 120_000 }, () => {
		it('resolves core through a workspace that links it', () => {
			expect(existsSync(join(resolveDir, 'node_modules', '@composable-svelte', 'core', 'package.json'))).toBe(true);
		});

		it('keeps the Effect.websocket registration', async () => {
			expect(ATTACHES_WEBSOCKET.test(await bundle(consumer))).toBe(true);
		});

		it('keeps the Effect.api registration', async () => {
			// dist/api/effect-api.js was reached only through a binding re-export
			// out of modules sideEffects did not list, so the unused re-export was
			// dropped before the assignment ran and Effect.api was undefined in
			// every bundled consumer (AUDIT-2026-09-03-FINDINGS P1). Removing
			// dist/api/effect-api.js from sideEffects turns this red again.
			expect(ATTACHES_API.test(await bundle(consumer))).toBe(true);
		});

		it('keeps the registration when the api binding itself is imported, so the probe can see it', async () => {
			// The positive control: the same module, retained for a different
			// reason, and the pattern above finds the assignment.
			const out = await bundle(`import { api } from '@composable-svelte/core';\nexport const e = api;`);
			expect(ATTACHES_API.test(out)).toBe(true);
		});
});
