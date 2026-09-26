import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: { exclude: ['@composable-svelte/core', '@composable-svelte/code', '@xyflow/svelte'] },
  ssr: { noExternal: ['@composable-svelte/core', '@composable-svelte/code'] },
  test: {
    include: ['recipes/managed/managed.test.ts'],
    browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true }
  }
});
