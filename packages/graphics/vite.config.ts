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
      external: (id) => {
        return (
          id === 'svelte' ||
          id.startsWith('svelte/') ||
          id === '@composable-svelte/core' ||
          id.startsWith('@composable-svelte/core/') ||
          id === '@babylonjs/core' ||
          id.startsWith('@babylonjs/core/') ||
          id === '@babylonjs/loaders' ||
          id.startsWith('@babylonjs/loaders/')
        );
      },
      output: {
        preserveModules: false
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: []
  }
});
