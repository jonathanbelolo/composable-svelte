import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

let server: ViteDevServer;
let Fixture: import('svelte').Component<{
  state?: 'collapsed' | 'expanded';
  showTitle?: boolean;
  channel?: string;
  mixedPolicy?: boolean;
  invalidState?: boolean;
}>;
let render: typeof import('svelte/server').render;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte({ configFile: false })],
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/MotionGroupSSR.svelte'));
  ({ render } = await server.ssrLoadModule('svelte/server'));
});

afterAll(async () => {
  await server?.close();
});

describe('public motion group SSR', () => {
  it('renders the complete stable projection without an ApplicationHost', () => {
    const collapsed = render(Fixture, { props: { state: 'collapsed' } }).body;
    const expanded = render(Fixture, { props: { state: 'expanded' } }).body;

    expect(collapsed).toContain('data-testid="surface"');
    expect(collapsed).toContain('data-testid="title"');
    expect(collapsed).toContain('style="opacity:0.5"');
    expect(collapsed).toContain('style="opacity:0;width:0px"');

    expect(expanded).toContain('data-testid="surface"');
    expect(expanded).toContain('data-testid="title"');
    expect(expanded).toContain('style="opacity:1"');
    expect(expanded).toContain('style="opacity:1;width:120px"');
  });

  it('supports conditional target omission while handle map remains complete', () => {
    const omitted = render(Fixture, { props: { state: 'collapsed', showTitle: false } }).body;

    expect(omitted).toContain('data-testid="surface"');
    expect(omitted).toContain('style="opacity:0.5"');
    expect(omitted).not.toContain('data-testid="title"');
    expect(omitted).toContain('data-title-style="opacity:0;width:0px"');
  });

  it('renders without target acquisition, resource records, or ambient timers', async () => {
    const { TargetRegistry } = await server.ssrLoadModule(
      '/src/lib/application/renderer/target-registry.ts',
    ) as {
      TargetRegistry: { prototype: { bind: (...args: unknown[]) => unknown } };
    };
    const { ResourceScope } = await server.ssrLoadModule(
      '/src/lib/execution/resources.ts',
    ) as {
      ResourceScope: { prototype: { createRecord: (...args: unknown[]) => unknown } };
    };

    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const record = vi.spyOn(ResourceScope.prototype, 'createRecord');
    const schedule = vi.spyOn(globalThis, 'setTimeout');

    try {
      bind.mockClear();
      record.mockClear();
      schedule.mockClear();

      const output = render(Fixture, { props: { state: 'collapsed' } }).body;
      expect(output).toContain('style="opacity:0.5"');
      expect(bind).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      bind.mockRestore();
      record.mockRestore();
      schedule.mockRestore();
    }
  });

  it('rejects a 129-code-unit channel during pure creation and accepts 128', () => {
    expect(() =>
      render(Fixture, { props: { channel: 'x'.repeat(129) } }).body,
    ).toThrow('Motion binding channel exceeds 128 characters');

    const accepted = render(Fixture, { props: { channel: 'x'.repeat(128) } }).body;
    expect(accepted).toContain('style="opacity:0.5"');
  });

  it('rejects mixed declared policy before attachment authority is needed', () => {
    expect(() =>
      render(Fixture, { props: { mixedPolicy: true } }).body,
    ).toThrow(/^Conflicting motion binding policies/);
  });

  it('rejects invalid initial state during pure creation', () => {
    expect(() =>
      render(Fixture, { props: { invalidState: true } }).body,
    ).toThrow('Unknown motion state invalid');
  });
});
