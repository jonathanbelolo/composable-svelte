import { defineConfig, type Plugin } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';
import { resolve } from 'path';

/**
 * Compile `.svelte` for the SERVER, in a node environment.
 *
 * Browser mode never runs the server build. `@sveltejs/vite-plugin-svelte`
 * fails in node environments under Vite 6 (see chat's and core's node
 * configs), so compile directly with `generate: 'server'`.
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

/** Rune modules (`*.svelte.js`), such as core's store, compiled for the server too. */
function svelteServerRuneModules(): Plugin {
	return {
		name: 'svelte-server-rune-modules',
		// After esbuild, so TypeScript is gone: `compileModule` parses JavaScript.
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
	plugins: [svelteServerComponents(), svelteServerRuneModules()],
	resolve: {
		// As in vitest.config.ts: the recipes import the package by name.
		alias: [{ find: /^@composable-svelte\/media$/, replacement: resolve(__dirname, 'src/lib/index.ts') }]
	},
	test: {
		environment: 'node',
		include: ['tests/ssr/**/*.{test,spec}.ts'],
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true'
	}
});
