import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@composable-svelte/core': resolve(__dirname, '../../packages/core/src/lib'),
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
        {
          browser: 'chromium',
          // This is a desktop layout — modals and sheets overflow the default
          // mobile-sized viewport, and Playwright refuses to click an element
          // it cannot bring into view, so every flow test timed out.
          viewport: { width: 1280, height: 900 }
        }
      ],
      headless: true
    },
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}']
  }
});
