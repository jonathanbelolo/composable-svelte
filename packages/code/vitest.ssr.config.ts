import { defineConfig, type Plugin } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';

/**
 * Server render, in a node environment: `pnpm test` runs this after the
 * browser suite.
 *
 * Same approach as packages/chat/vitest.ssr.config.ts: compile Svelte for the
 * server directly, because `@sveltejs/vite-plugin-svelte` fails node-environment
 * runs under Vite 6. Rune modules (`*.svelte.js`, e.g. core's store and
 * xyflow's) go through `compileModule`.
 *
 * `generate: 'server'` is the subject: browser mode never exercises it.
 */
function svelteServer(): Plugin {
	return {
		name: 'code-svelte-server',
		enforce: 'pre',
		transform(code, id) {
			const file = id.split('?')[0]!;
			if (file.endsWith('.svelte')) {
				const compiled = compile(code, { filename: file, generate: 'server' });
				return { code: compiled.js.code, map: compiled.js.map };
			}
			if (file.endsWith('.svelte.js') || file.endsWith('.svelte.ts')) {
				const compiled = compileModule(code, { filename: file, generate: 'server' });
				return { code: compiled.js.code, map: compiled.js.map };
			}
			return null;
		}
	};
}

export default defineConfig({
	plugins: [svelteServer()],
	test: {
		environment: 'node',
		include: ['tests/ssr/**/*.{test,spec}.ts'],
		// Through Vite, not Node: @xyflow/svelte ships `.svelte` files and
		// extensionless directory imports that Node's ESM loader rejects.
		server: { deps: { inline: [/@xyflow\/svelte/] } },
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true'
	}
});
