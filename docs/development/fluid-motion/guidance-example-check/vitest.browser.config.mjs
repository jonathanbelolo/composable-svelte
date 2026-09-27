// Real Chromium run of the example app through the public package (client-compiled Svelte).
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  // Never pre-bundle the packages under test: Vite's dependency cache is not keyed on their dist contents, so a
  // cached bundle could silently run an older core or graphics build.
  optimizeDeps: { exclude: ['@composable-svelte/core', '@composable-svelte/graphics'] },
  test: {
    include: ['tests/**/*.browser.test.ts'],
    browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true }
  }
});
