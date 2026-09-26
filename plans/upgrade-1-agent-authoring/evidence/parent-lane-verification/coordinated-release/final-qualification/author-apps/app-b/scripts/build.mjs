import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

await build({
  configFile: false,
  plugins: [svelte()],
  build: {
    emptyOutDir: false
  }
});
