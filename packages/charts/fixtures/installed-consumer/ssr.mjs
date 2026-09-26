import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const server = await createServer({
  configFile: false,
  plugins: [svelte({ configFile: false })],
  ssr: { noExternal: ['@composable-svelte/charts', '@composable-svelte/core'] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error'
});
try {
  const [{ default: App }, { render }] = await Promise.all([
    server.ssrLoadModule('/src/App.svelte'),
    server.ssrLoadModule('svelte/server')
  ]);
  const result = render(App);
  if (!result.body.includes('chart-container') || !result.body.includes('role="application"')) {
    throw new Error(`SSR output missing expected chart container or role: ${result.body}`);
  }
  console.log(`SSR rendered ${result.body.length} bytes including charts content`);
} finally {
  await server.close();
}
