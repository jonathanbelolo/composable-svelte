import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@composable-svelte/core': resolve(__dirname, '../../packages/core/src/lib'),
      '@composable-svelte/graphics': resolve(__dirname, '../../packages/graphics/src'),
      '$lib': resolve(__dirname, '../../packages/core/src/lib')
    }
  },
  server: {
    port: 5175
  }
});
