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
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    environment: 'node',
    include: [
      'tests/fluid-motion/channels*.test.ts',
      'tests/fluid-motion/teststore*.test.ts',
      'tests/fluid-motion/render-ssr.test.ts',
      'tests/ssr/motion-public-lifecycle.test.ts',
      'tests/ssr/motion-group.test.ts',
      'tests/motion-binding-policy.test.ts',
      'tests/motion-public-lifecycle.test.ts',
      'tests/motion-public-lifecycle-planning.test.ts',
      'tests/motion-group-lifecycle.test.ts',
      'tests/transform-mix.test.ts',
      'tests/reduced-motion-source.test.ts',
      'tests/motion-playback-plan.test.ts',
      'tests/pure-motion.test.ts',
      'tests/motion-arbitration.test.ts',
      'tests/motion-run.test.ts',
      'tests/motion-capability.test.ts',
      'tests/motion-playback.test.ts',
      'tests/motion-playback-execution.test.ts',
      'tests/motion-playback-reentrancy.test.ts',
      'tests/placement-coalescing.test.ts',
      'tests/application-basic.test.ts',
      'tests/application-routing.test.ts',
      'tests/ssr/application-routing.test.ts',
      'tests/ssr/document-focus.test.ts',
      'tests/ssr/application-basic.test.ts',
      'tests/ssr/application-owner.test.ts',
      'tests/ssr/application-scoping.test.ts',
      'tests/ssr/feature-views.test.ts',
      'tests/ssr/presentation-placement.test.ts',
      'tests/theme-reactivity.test.ts',
      'tests/styles/theme-reactivity.test.ts',
      'tests/execution-identity.test.ts',
      'tests/test-store-cleanup-hooks.test.ts',
      'tests/wait-for-state-helper.test.ts',
      'tests/ssr/effect-deferral.test.ts',
      'tests/ssr/ssg.test.ts',
      'tests/ssr/ssg-fs.test.ts',
      'tests/ssr/render.test.ts',
      'tests/ssr/serializer.test.ts',
      'tests/ssr/animated-initial-state.test.ts',
      'tests/ssr/content-initial-state.test.ts',
      'tests/ssr/disclosure-identities.test.ts',
      'tests/ssr/command-group-identities.test.ts',
      'tests/ssr/alert-registration.test.ts',
      'tests/ssr/dismissal-authority.test.ts',
      'tests/ssr/alert-composition.test.ts',
      'tests/ssr/tabs-identities.test.ts',
      'tests/ssr/host0b.test.ts',
      'tests/startup-initial.test.ts',
      'tests/startup-decision.test.ts',
      'tests/ssr/startup-decision.test.ts',
      'tests/ssr/startup-initial.test.ts',
      'tests/ssr/routing-managed.test.ts',
      'tests/ssr/root-route.test.ts',
      'tests/ssr/input-initial-value.test.ts',
      'tests/ssr/execution-managed.test.ts',
      'tests/ssr/middleware.test.ts',
      'tests/ssr/sanitize-data-uri.test.ts',
      'tests/ssr/sanitize-peer-equivalence.test.ts',
      'tests/ssr/sanitize-return-modes.test.ts',
      'tests/ssr/middleware-fastify.test.ts',
      'tests/ssr/entry-graph.test.ts',
      'tests/ssr/utils-node.test.ts',
      'tests/repo/mutation-report.test.ts',
      'tests/repo/check-coverage.test.ts',
      'tests/repo/component-coverage.test.ts',
      'tests/repo/typecheck-coverage.test.ts',
      'tests/repo/side-effects.test.ts',
      'tests/repo/animation-policy.test.ts',
      'tests/repo/dist-freshness.test.ts',
      'tests/repo/rune-class-field-output.test.ts',
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
      'tests/repo/presentation-public-surface.test.ts',
      'tests/repo/skill-examples.test.ts',
      'tests/repo/dist-import.test.ts',
      'tests/repo/bundle-probe.test.ts',
			'tests/repo/optional-props.test.ts',
			'tests/repo/satellite-theming.test.ts',
			'tests/repo/changelog-shape.test.ts',
      'tests/styles/**/*.test.ts',
      'tests/i18n/ssr.test.ts',
      // The console guard's own positive controls; browser mode collects it by glob.
      'tests/setup.test.ts'
    ],
    silent: process.env.SILENT_TESTS === 'true'
  }
});
