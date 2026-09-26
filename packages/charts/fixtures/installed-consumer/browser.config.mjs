import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['src/installed.browser.test.ts'],
    browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true }
  }
});
