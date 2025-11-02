import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
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
    include: ['packages/**/*.browser.test.ts'],
    globals: true
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, './packages/core/src')
    }
  }
});
