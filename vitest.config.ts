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
      '**/navigation-components/**/*.test.ts', // Exclude browser component tests
      '**/lib/actions/focusTrap.test.ts' // Exclude browser focus management tests
    ],
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
