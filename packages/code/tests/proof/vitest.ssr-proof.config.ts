import { defineConfig, type Plugin } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';

/**
 * B1 proof — server render of the managed command-queue probe.
 *
 * Lane-local config, run explicitly:
 *   pnpm exec vitest run --config tests/proof/vitest.ssr-proof.config.ts
 * It is outside the package's default browser `include` (the file is named
 * `*.ssr-proof.ts`), so the shipped `test` script is unchanged.
 *
 * Same approach as packages/chat/vitest.ssr.config.ts: compile Svelte for the
 * server directly (vite-plugin-svelte fails in node-environment runs). Rune
 * modules (`*.svelte.js`, e.g. core's store) are compiled with compileModule.
 */
function svelteServer(): Plugin {
	return {
		name: 'b1-proof-svelte-server',
		enforce: 'pre',
		transform(code, id) {
			const file = id.split('?')[0]!;
			if (file.endsWith('.svelte')) {
				const compiled = compile(code, { filename: file, generate: 'server' });
				return { code: compiled.js.code, map: compiled.js.map };
			}
			if (file.endsWith('.svelte.js')) {
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
		root: new URL('../..', import.meta.url).pathname,
		environment: 'node',
		include: ['tests/proof/ssr/**/*.ssr-proof.ts']
	}
});
