import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*-animation.test.ts', // Exclude browser animation tests
      '**/*.browser.test.ts', // Exclude browser-mode tests (need Playwright)
      '**/*.visual.test.ts', // Exclude visual regression tests (need Playwright)
      '**/navigation-components/**/*.test.ts', // Exclude browser component tests
      '**/lib/actions/focusTrap.test.ts' // Exclude browser focus management tests
    ],
    server: {
      deps: {
        // Process @composable-svelte/core through Vite pipeline so .svelte
        // component re-exports in its barrel are handled by the svelte plugin
        inline: ['@composable-svelte/core']
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/tests/**',
        'examples/'
      ]
    }
  },
  resolve: {
    alias: {
      '$lib': '/packages/core/src'
    }
  }
});
