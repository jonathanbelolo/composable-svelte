// Chromium, Firefox and WebKit through the public package (client-compiled Svelte).
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  // Never pre-bundle the package under test: Vite's dependency cache is not keyed on its dist contents.
  // Core's own dependencies are pre-bundled up front. Otherwise Vite discovers them mid-run ("new dependencies
  // optimized … reloading"), and the reload left WebKit with mixed Svelte module instances (lifecycle_outside_component),
  // see evidence/*lifecycle-failure.log.
  optimizeDeps: {
    exclude: ['@composable-svelte/core'],
    include: ['@composable-svelte/core > esm-env', '@composable-svelte/core > motion', '@composable-svelte/core > tailwind-merge', '@composable-svelte/core > tabbable', 'svelte/server']
  },
  test: {
    include: ['tests/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
      headless: true,
      viewport: { width: 800, height: 600 }
    }
  }
});
