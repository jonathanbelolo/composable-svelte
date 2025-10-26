import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: ['svelte', 'svelte/internal'],
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src')
    }
  }
});
