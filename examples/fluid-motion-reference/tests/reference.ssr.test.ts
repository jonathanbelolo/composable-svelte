/**
 * SSR: each route renders server-stable markup with one accessible page heading, no route plane and no
 * business work. The home markup is the hydration fixture (regenerate with UPDATE_REFERENCE_SSR_FIXTURE=1).
 * Uses a Vite SSR server with the Svelte plugin, the repository's existing SSR test method.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/ssr-home.html', import.meta.url));
let server: ViteDevServer;
let App: import('svelte').Component<Record<string, unknown>>;
let render: typeof import('svelte/server').render;

beforeAll(async () => {
  server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [svelte({ configFile: false })], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ default: App } = await server.ssrLoadModule('/src/App.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
});
afterAll(async () => { await server?.close(); });

const html = (url: string, trace: string[]) => render(App, { props: { url, dependencies: { trace } } }).body;

it.each([
  ['/', 'data-page="home"', 'Horizon Retrospective 2026'],
  ['/dossier', 'data-page="detail"', 'Horizon Retrospective 2026'],
  ['/study', 'data-page="study"', 'Pavilion of Light &amp; Atmosphere']
])('%s renders stable semantic markup without browser or business work', (url, page, heading) => {
  const trace: string[] = [];
  const first = html(url, trace);
  expect(html(url, trace)).toBe(first);
  expect(trace).toEqual([]);
  expect(first).toContain(page);
  expect(first).not.toContain('data-composable-route-plane');
  expect(first).not.toContain('data-route-representation');
  expect(first.match(/<h1[\s>]/g)).toHaveLength(1);
  expect(first).toMatch(new RegExp(`<h1[^>]*>${heading}</h1>`));
  if (url === '/dossier') expect(first).toMatch(/<header class="hero-header-compact[^"]*">[\s\S]*data-hero/);
  if (url === '/') {
    expect(first).toMatch(/<main[^>]*data-page="home"[\s\S]*data-hero/);
    if (process.env.UPDATE_REFERENCE_SSR_FIXTURE === '1') writeFileSync(fixture, first);
    else expect(readFileSync(fixture, 'utf8')).toBe(first);
  }
});
