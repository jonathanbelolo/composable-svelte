import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

let server: ViteDevServer;
let Fixture: import('svelte').Component;
let render: typeof import('svelte/server').render;
// Tooling startup diagnostics are separate from render-time console assertions.
beforeAll(async () => {
  server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});
  ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/CollapsibleHydration.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
});
afterAll(async () => { await server?.close(); });

it('renders stable linked disclosure IDs across independent SSR requests', async () => {
    const first=render(Fixture).body;const second=render(Fixture).body;
    expect(first).toBe(second);
    const ids=[...first.matchAll(/ id="([^"]+)"/g)].map(match=>match[1]);
    expect(ids).toHaveLength(4);expect(new Set(ids).size).toBe(4);
});
