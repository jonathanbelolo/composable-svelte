import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser', 'module', 'import', 'default']
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
});
