import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({ plugins: [svelte()], ssr: { noExternal: ['@composable-svelte/core'] }, test: {
  include: ['tests/**/*.test.ts'], browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] }
} });
