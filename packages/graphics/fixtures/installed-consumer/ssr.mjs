import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const server = await createServer({
  configFile: false,
  plugins: [svelte({ configFile: false })],
  ssr: { noExternal: ['@composable-svelte/core', '@composable-svelte/graphics'] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error'
});
try {
  const [{ default: App }, { render }] = await Promise.all([
    server.ssrLoadModule('/src/App.svelte'), server.ssrLoadModule('svelte/server')
  ]);
  const result = render(App);
  if (!result.body.includes('scene-container') || !result.body.includes('scene-canvas')) {
    throw new Error('SSR omitted graphics scene markup');
  }
  console.log(`SSR rendered ${result.body.length} bytes including graphics scene`);
} finally {
  await server.close();
}
