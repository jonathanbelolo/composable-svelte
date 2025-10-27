import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@composable-svelte/core': resolve(__dirname, '../../packages/core/src'),
      '$lib': resolve(__dirname, '../../packages/core/src/lib')
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
