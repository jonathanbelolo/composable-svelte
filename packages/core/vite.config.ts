import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  // Package artifacts are produced exclusively by `pnpm build` (svelte-package).
  // This configuration serves the browser test runner.
  plugins: [svelte()],

  // ============================================================================
  // Browser Mode Configuration (Vitest 4)
  // ============================================================================
  test: {
    // The console guard (tests/helpers/console.ts): undeclared console.error / warn
    // output fails the test that produced it.
    setupFiles: ['./tests/setup.ts'],

    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' }
      ],
      headless: true,
    },

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}', 'tests/**/*.test.svelte.ts'],
    exclude: [
      'tests/fluid-motion/channels*.test.ts',
      'tests/fluid-motion/teststore*.test.ts',
      'tests/fluid-motion/render-ssr.test.ts',
      // Lifecycle unit/SSR suites belong to the Node runner, never browser dependency scanning.
      'tests/motion-binding-policy.test.ts',
      'tests/motion-group-lifecycle.test.ts',
      'tests/motion-public-lifecycle.test.ts',
      'tests/motion-public-lifecycle-planning.test.ts',
      'tests/ssr/motion-public-lifecycle.test.ts',
      'tests/ssr/motion-group.test.ts',
      'tests/ssr/document-focus.test.ts',
      'tests/transform-mix.test.ts',
      'tests/motion-playback-plan.test.ts',
      'tests/pure-motion.test.ts',
      'tests/motion-arbitration.test.ts',
      'tests/motion-run.test.ts',
      'tests/motion-capability.test.ts',
      'tests/motion-playback.test.ts',
      'tests/motion-playback-execution.test.ts',
      'tests/motion-playback-reentrancy.test.ts',
      'tests/application-basic.test.ts',
      'tests/application-routing.test.ts',
      'tests/ssr/application-routing.test.ts',
      'tests/ssr/application-basic.test.ts',
      'tests/ssr/application-owner.test.ts',
      'tests/ssr/application-scoping.test.ts',
      'tests/ssr/feature-views.test.ts',
      'tests/ssr/presentation-placement.test.ts',
      'tests/repo/mutation-report.test.ts',
      'tests/theme-reactivity.test.ts',
      'tests/styles/theme-reactivity.test.ts',
      // Node-environment tests: they read files from disk, which browser mode
      // cannot do. Run by vitest.node.config.ts instead.
      'tests/reduced-motion-source.test.ts',
      'tests/test-store-cleanup-hooks.test.ts',
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
      'tests/styles/**',
      // Reaches isomorphic-dompurify, which needs its Node (jsdom) build.
      'tests/ssr/middleware.test.ts',
      'tests/ssr/sanitize-data-uri.test.ts',
      'tests/ssr/sanitize-peer-equivalence.test.ts',
      'tests/ssr/sanitize-return-modes.test.ts',
      // Drives a real Fastify instance; Node only.
      'tests/ssr/middleware-fastify.test.ts',
      // Walks built dist from disk; browser mode cannot read files.
      'tests/ssr/entry-graph.test.ts',
      'tests/ssr/utils-node.test.ts',
      // Reads every workspace's package.json from disk; same reason.
      'tests/repo/check-coverage.test.ts',
      'tests/repo/component-coverage.test.ts',
      // Shells out to `tsc --showConfig` per workspace; same reason.
      'tests/repo/typecheck-coverage.test.ts',
      // Reads every package's dist from disk; same reason.
      'tests/repo/side-effects.test.ts',
      'tests/repo/animation-policy.test.ts',
      'tests/repo/dist-freshness.test.ts',
      'tests/repo/rune-class-field-output.test.ts',
      'tests/repo/peer-ranges.test.ts',
      'tests/repo/published-files.test.ts',
      'tests/repo/export-surface.test.ts',
      'tests/repo/doc-examples.test.ts',
      // Walks every package's src from disk; same reason.
      'tests/repo/optional-props.test.ts',
			'tests/repo/satellite-theming.test.ts',
			'tests/repo/changelog-shape.test.ts',
      // Walk the tree and read the configs from disk; same reason.
      'tests/repo/walk.test.ts',
      'tests/repo/guard-integrity.test.ts',
      'tests/repo/intentionally-unused.test.ts',
      'tests/repo/doc-typecheck.test.ts',
      'tests/repo/front-door.test.ts',
			'tests/repo/demo-headings.test.ts',
      'tests/repo/flat-barrel.test.ts',
      'tests/repo/presentation-public-surface.test.ts',
      'tests/repo/skill-examples.test.ts',
      // Spawns a child Node process; same reason.
      'tests/repo/dist-import.test.ts',
      // Runs esbuild against dist; same reason.
      'tests/repo/bundle-probe.test.ts',
      // Needs the Cookie request header, which the browser Request API refuses
      // to expose; runs under vitest.node.config.ts instead.
      'tests/i18n/ssr.test.ts'
    ],

    // Only prepublish silences output. CI used to as well, which hid every
    // swallowed-error log the console guard now exists to surface.
    silent: process.env.SILENT_TESTS === 'true',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
      ]
    }
  },

  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src')
    }
  }
});
