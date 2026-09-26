import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { writeFileSync } from 'node:fs';
let server: ViteDevServer;
let Fixture: import('svelte').Component;
let render: typeof import('svelte/server').render;
let createModel: typeof import('../fixtures/StartupInitialModel.js').createStartupModel;
beforeAll(async () => {
  server = await createServer({ configFile: false, logLevel: 'silent', plugins: [svelte({ configFile: false })], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/StartupInitialHost.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
  ({ createStartupModel: createModel } = await server.ssrLoadModule('/tests/fixtures/StartupInitialModel.ts'));
});
afterAll(async () => { await server?.close(); });
it.each([true, false])('SSR loaded=%s retains stable markup without activation and retires request resources', loaded => {
  const events: string[] = []; const model = createModel(events, loaded);
  try {
    const html = render(Fixture, { props: { model } }).body;
    expect(html).toContain('server'); expect(events).toEqual(['plan']); expect(model.store.history).toEqual([]);
    expect(model.store._runtime!.resourceScope.size).toBe(loaded ? 2 : 3);
    writeFileSync(`tests/fixtures/startup-initial-${loaded ? 'loaded' : 'empty'}-ssr.html`, html);
  } finally { model.store.destroy(); }
  expect(model.store._runtime!.resourceScope.size).toBe(0); expect(events).toEqual(['plan']);
});
it('failed server child render releases attachment and request owner cleanup retires all pending work', () => {
  const events: string[] = []; const model = createModel(events);
  try {
    expect(() => render(Fixture, { props: { model, fail: true } }).body).toThrow('startup child render failed');
    expect(events).toEqual(['plan']); expect(model.store._runtime!.resourceScope.size).toBe(2);
    expect(() => render(Fixture, { props: { model } })).not.toThrow(); expect(events).toEqual(['plan']);
  } finally { model.store.destroy(); }
  expect(model.store._runtime!.resourceScope.size).toBe(0);
});
