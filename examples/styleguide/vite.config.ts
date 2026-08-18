import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      // No alias for @composable-svelte/core: it resolves through the workspace
      // link and the package's own `exports` map, so anything missing from the
      // public surface fails the build here instead of hiding behind a path
      // that reaches straight into dist.
      '@composable-svelte/code': resolve(__dirname, '../../packages/code/dist')
    }
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launch: {
          headless: true,
          args: ['--headless=new']
        }
      }),
      instances: [
        { browser: 'chromium' }
      ],
      headless: true
    },
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}']
  }
});
