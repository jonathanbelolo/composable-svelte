import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';

let server: ViteDevServer;
let Fixture: import('svelte').Component<{ state: 'off' | 'on' }>;
let BrowserFixture: import('svelte').Component;
let render: typeof import('svelte/server').render;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte({ configFile: false })],
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/MotionPublicSSR.svelte'));
  ({ default: BrowserFixture } = await server.ssrLoadModule('/tests/fixtures/MotionPublicBrowser.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
});

afterAll(async () => {
  await server?.close();
});

describe('public motion lifecycle SSR', () => {
  it('renders the complete stable projection without an ApplicationHost', () => {
    const off = render(Fixture, { props: { state: 'off' } }).body;
    const on = render(Fixture, { props: { state: 'on' } }).body;

    expect(off).toContain('href="/motion"');
    expect(off).toContain('data-motion-state="off"');
    expect(off).toContain('style="opacity:0;width:10px"');
    expect(off).toMatch(/<a[^>]*>[\s\S]*motion[\s\S]*<\/a>/);
    expect(on).toContain('data-motion-state="on"');
    expect(on).toContain('style="opacity:1;width:24px"');
  });

  it('keeps the checked hydration fixture byte-identical to real server output', () => {
    const html = render(BrowserFixture).body;
    const path = 'tests/fixtures/motion-public-browser-ssr.html';
    if (process.env.UPDATE_MOTION_PUBLIC_SSR_FIXTURE === '1') writeFileSync(path, html);
    else expect(readFileSync(path, 'utf8')).toBe(html);
  });

  it('renders without target acquisition, resource records, or ambient timers', async () => {
    const { TargetRegistry } = await server.ssrLoadModule('/src/lib/application/renderer/target-registry.ts') as {
      TargetRegistry: { prototype: { bind: (...args: unknown[]) => unknown } };
    };
    const { ResourceScope } = await server.ssrLoadModule('/src/lib/execution/resources.ts') as {
      ResourceScope: { prototype: { createRecord: (...args: unknown[]) => unknown } };
    };
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const record = vi.spyOn(ResourceScope.prototype, 'createRecord');
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    try {
      bind.mockClear(); record.mockClear(); schedule.mockClear();
      expect(render(Fixture, { props: { state: 'off' } }).body).toContain('style="opacity:0;width:10px"');
      expect(bind).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      bind.mockRestore(); record.mockRestore(); schedule.mockRestore();
    }
  });
});
