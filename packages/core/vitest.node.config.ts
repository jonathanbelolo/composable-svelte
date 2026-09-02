import { defineConfig, type Plugin } from 'vitest/config';
import { compileModule } from 'svelte/compiler';

/**
 * Compile Svelte rune modules (`*.svelte.ts` / `*.svelte.js`) for Node tests.
 *
 * `@sveltejs/vite-plugin-svelte` cannot be used here: under Vite 6 it makes
 * every node-environment run fail in `vite:import-analysis` with
 * `filename.replace is not a function`, even for suites that touch no Svelte
 * code at all. This does the one thing these tests actually need — turn
 * `$state` and friends in `store.svelte.ts` into real JavaScript.
 */
function svelteRuneModules(): Plugin {
  return {
    name: 'svelte-rune-modules',
    // Runs after Vite's esbuild transform, so the TypeScript is already gone —
    // `compileModule` parses JavaScript only.
    enforce: 'post',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.svelte\.(ts|js)$/.test(file)) return null;
      const compiled = compileModule(code, { filename: file, generate: 'server' });
      return { code: compiled.js.code, map: compiled.js.map };
    }
  };
}

/**
 * Node-environment tests.
 *
 * A few suites read from disk — the SSG generator, and the theming contract
 * tests that parse the shipped stylesheets. Browser mode cannot do that, so
 * they are excluded from `vite.config.ts` and run here.
 */
export default defineConfig({
  plugins: [svelteRuneModules()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/ssr/ssg.test.ts',
      'tests/ssr/animated-initial-state.test.ts',
      'tests/ssr/content-initial-state.test.ts',
      'tests/ssr/middleware.test.ts',
      'tests/ssr/entry-graph.test.ts',
      'tests/repo/check-coverage.test.ts',
      'tests/repo/component-coverage.test.ts',
      'tests/repo/typecheck-coverage.test.ts',
      'tests/repo/side-effects.test.ts',
      'tests/repo/animation-policy.test.ts',
      'tests/repo/dist-freshness.test.ts',
      'tests/repo/peer-ranges.test.ts',
      'tests/repo/published-files.test.ts',
      'tests/repo/export-surface.test.ts',
      'tests/repo/doc-examples.test.ts',
      'tests/repo/walk.test.ts',
      'tests/repo/guard-integrity.test.ts',
      'tests/repo/intentionally-unused.test.ts',
      'tests/repo/doc-typecheck.test.ts',
      'tests/repo/front-door.test.ts',
			'tests/repo/demo-headings.test.ts',
      'tests/repo/flat-barrel.test.ts',
      'tests/repo/skill-examples.test.ts',
			'tests/repo/optional-props.test.ts',
			'tests/repo/satellite-theming.test.ts',
			'tests/repo/changelog-shape.test.ts',
      'tests/styles/**/*.test.ts',
      'tests/i18n/ssr.test.ts'
    ],
    silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true'
  }
});
