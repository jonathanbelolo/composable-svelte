import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  build: { rollupOptions: { input: { app: 'index.html', realDevice: 'real-device.html' } } },
  optimizeDeps: { exclude: ['@composable-svelte/core', '@composable-svelte/media'] },
  ssr: { noExternal: ['@composable-svelte/core', '@composable-svelte/media'] },
  test: {
    include: ['tests/**/*.test.ts'],
    browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true }
  }
});
