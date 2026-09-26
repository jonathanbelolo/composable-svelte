import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
let server: ViteDevServer; let Fixture: import('svelte').Component; let render: typeof import('svelte/server').render;
beforeAll(async () => {
 server = await createServer({ configFile: false, logLevel: 'silent', plugins: [svelte({ configFile: false })], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
 ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/AlertRegistration.svelte'));
 ({ render } = await server.ssrLoadModule('svelte/server'));
});
afterAll(async () => { await server?.close(); });
it('server-rendered dialog renders its actual children without recursive snippet shadowing', () => {
 expect(typeof window).toBe('undefined'); const html = render(Fixture).body;
 expect(html).toContain('Confirm operation'); expect(html).toContain('Operation details');
 expect(html).toContain('aria-label="Fallback"');
 for (const id of [...html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)].map(match => match[1]!)) {
  expect(html).toContain('id="' + id + '"');
 }
});
