import { defineConfig, type Plugin } from 'vitest/config';
import { compile } from 'svelte/compiler';

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

export default defineConfig({
	plugins: [svelteServerComponents()],
	// Deliberately NOT `conditions: ['browser']` — the server build is the subject.
	test: {
		environment: 'node',
		include: ['tests/ssr/**/*.{test,spec}.ts'],
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true'
	}
});
