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
  // Svelte 5 resolves to its server build under Vitest unless the browser
  // condition is forced, and `mount()` throws there. Scoped to test runs so the
  // library build below keeps its normal resolution.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : {},
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: []
  }
});
