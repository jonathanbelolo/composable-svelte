import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],

  // ============================================================================
  // Test Configuration
  // ============================================================================
  test: {
    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],

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
      entry: resolve(__dirname, 'src/lib/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      // Externalize peer dependencies
      external: (id) => {
        return (
          id === 'svelte' ||
          id.startsWith('svelte/') ||
          id === '@composable-svelte/core' ||
          id.startsWith('@composable-svelte/core/')
        );
      },
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  }
});
