import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    svelte(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.svelte.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts']
    })
  ],

  // ============================================================================
  // Browser Mode Configuration (Vitest 4)
  // ============================================================================
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' }
      ],
      headless: true,
    },

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: [
      // Node-environment tests: they read files from disk, which browser mode
      // cannot do. Run by vitest.node.config.ts instead.
      'tests/ssr/ssg.test.ts',
      'tests/ssr/animated-initial-state.test.ts',
      'tests/ssr/content-initial-state.test.ts',
      'tests/styles/**',
      // Reaches isomorphic-dompurify, which needs its Node (jsdom) build.
      'tests/ssr/middleware.test.ts',
      // Walks built dist from disk; browser mode cannot read files.
      'tests/ssr/entry-graph.test.ts',
      // Reads every workspace's package.json from disk; same reason.
      'tests/repo/check-coverage.test.ts',
      'tests/repo/component-coverage.test.ts',
      // Shells out to `tsc --showConfig` per workspace; same reason.
      'tests/repo/typecheck-coverage.test.ts',
      // Reads every package's dist from disk; same reason.
      'tests/repo/side-effects.test.ts',
      'tests/repo/animation-policy.test.ts',
      'tests/repo/dist-freshness.test.ts',
      'tests/repo/peer-ranges.test.ts',
      'tests/repo/published-files.test.ts',
      'tests/repo/export-surface.test.ts',
      'tests/repo/doc-examples.test.ts',
      // Walks every package's src from disk; same reason.
      'tests/repo/optional-props.test.ts',
			'tests/repo/satellite-theming.test.ts',
      // Walk the tree and read the configs from disk; same reason.
      'tests/repo/walk.test.ts',
      'tests/repo/guard-integrity.test.ts',
      'tests/repo/intentionally-unused.test.ts',
      'tests/repo/doc-typecheck.test.ts',
      'tests/repo/front-door.test.ts',
			'tests/repo/demo-headings.test.ts',
      'tests/repo/flat-barrel.test.ts',
      'tests/repo/skill-examples.test.ts',
      // Needs the Cookie request header, which the browser Request API refuses
      // to expose; runs under vitest.node.config.ts instead.
      'tests/i18n/ssr.test.ts'
    ],

    // Suppress console output during tests (for CI/prepublish)
    silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true',

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

  // ============================================================================
  // Build Configuration
  // ============================================================================
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      // Externalize all Svelte imports (peer dependency)
      // This ensures Svelte is not bundled, preventing duplicate runtime issues
      external: (id) => {
        return id === 'svelte' || id.startsWith('svelte/');
      },
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src')
    }
  }
});
