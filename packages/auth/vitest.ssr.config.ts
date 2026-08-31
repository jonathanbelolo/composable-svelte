import { defineConfig, type Plugin } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';

/**
 * Compile `.svelte` for the SERVER, in a node environment.
 *
 * `@sveltejs/vite-plugin-svelte` cannot be used here: under Vite 6 it makes
 * every node-environment run fail in `vite:import-analysis` with
 * `filename.replace is not a function`. `packages/core/vitest.node.config.ts`
 * documents the same problem and solves it the same way — compile directly and
 * skip the plugin.
 *
 * `generate: 'server'` is the whole point. Browser mode never exercises this
 * path, which is how a regression that emptied server HTML of video embeds got
 * shipped and then cleared as harmless.
 */
function svelteServerComponents(): Plugin {
	return {
		name: 'svelte-server-components',
		enforce: 'pre',
		transform(code, id) {
			const file = id.split('?')[0]!;
			if (!file.endsWith('.svelte')) return null;
			const compiled = compile(code, { filename: file, generate: 'server' });
			return { code: compiled.js.code, map: compiled.js.map };
		}
	};
}

/**
 * …and the rune *modules* (`store.svelte.ts`) they depend on.
 *
 * `createStore` lives in one. Without this the component compiles for the
 * server and then dies on the first `$state` it reaches, which reads like a
 * component defect and is not — the same shape `packages/core/vitest.node.config.ts`
 * solves for its own node suites.
 */
function svelteRuneModules(): Plugin {
	return {
		name: 'svelte-rune-modules',
		// After esbuild, so the TypeScript is gone — `compileModule` parses JS only.
		enforce: 'post',
		transform(code, id) {
			const file = id.split('?')[0]!;
			if (!/\.svelte\.(ts|js)$/.test(file)) return null;
			const compiled = compileModule(code, { filename: file, generate: 'server' });
			return { code: compiled.js.code, map: compiled.js.map };
		}
	};
}

export default defineConfig({
	plugins: [svelteServerComponents(), svelteRuneModules()],
	// Deliberately NOT `conditions: ['browser']` — the server build is the subject.
	test: {
		environment: 'node',
		include: ['tests/ssr/**/*.{test,spec}.ts'],
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true'
	}
});
