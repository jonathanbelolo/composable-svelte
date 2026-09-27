/** Node SSR: staged route render structure is server-stable, starts no browser/business work, and the
 * hydration fixture is current. Regenerate with UPDATE_FLUID_RENDER_SSR_FIXTURE=1. */
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';
let server: ViteDevServer; let App: import('svelte').Component<Record<string, unknown>>; let render: typeof import('svelte/server').render;
beforeAll(async () => {
  server = await createServer({ configFile: false, logLevel: 'silent', plugins: [svelte({ configFile: false })], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ default: App } = await server.ssrLoadModule('/tests/fluid-motion/render-fixtures/RenderApp.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
});
afterAll(async () => { await server?.close(); });
it('staged route SSR renders the route outlet and Host boundary structure without browser or business work', () => {
  const trace: string[] = [], events: string[] = [];
  const html = render(App, { props: { url: '/fragile', dependencies: { trace, events }, onApp: () => {} } }).body;
  expect(trace).toEqual([]);
  expect(events).toEqual([]);
  expect(html).toContain('data-page="/fragile"');
  expect(html).not.toContain('data-composable-route-plane');
  const fixture = 'tests/fluid-motion/render-fixtures/render-ssr.html';
  if (process.env.UPDATE_FLUID_RENDER_SSR_FIXTURE === '1') writeFileSync(fixture, html);
  else expect(readFileSync(fixture, 'utf8')).toBe(html);
});
