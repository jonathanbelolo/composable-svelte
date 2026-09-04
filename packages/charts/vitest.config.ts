import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts']
    }
  },
  resolve: {
    // Svelte 5 resolves to its server build under Vitest unless the browser
    // condition is forced, and `mount()` throws there. Component tests need it.
    // Same line maps carries for the same reason.
    conditions: ['browser'],
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  }
});
