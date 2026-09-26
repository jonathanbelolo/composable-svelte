import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Compile the real framework entry and Svelte modules for Node's test runner.
export default defineConfig({
  plugins: [svelte()],
  build: {
    ssr: 'tests/contracts.test.ts', outDir: 'dist/tests', target: 'node20',
    rollupOptions: { output: { entryFileNames: 'contracts.test.js' } }
  },
  ssr: { noExternal: ['@composable-svelte/core'], external: ['isomorphic-dompurify'] }
});
