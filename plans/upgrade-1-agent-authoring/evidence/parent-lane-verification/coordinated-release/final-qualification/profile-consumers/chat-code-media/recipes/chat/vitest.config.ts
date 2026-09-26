import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser', 'module', 'import', 'default'] },
  optimizeDeps: {
    exclude: ['@composable-svelte/core', '@composable-svelte/chat'],
    include: ['isomorphic-dompurify']
  },
  ssr: { noExternal: ['@composable-svelte/core', '@composable-svelte/chat'] },
  test: {
    include: ['recipes/managed/managed.test.ts'],
    browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true }
  }
});
