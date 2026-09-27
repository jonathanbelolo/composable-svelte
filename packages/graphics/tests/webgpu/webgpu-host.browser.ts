/**
 * Real-Host WebGPU witness: an application (public core + graphics APIs) with a root-owned scene rendered by a
 * WebGPU `<Scene>` inside a leaving participant. The staged route commits at 200 ms through the real coordinator;
 * the leaving model's copy (graphics provider, retained renderer) lingers in place until 700 ms. Composited
 * screenshots of that copy, timestamped at capture, are compared against a turntable-off control. Business commit,
 * history and both resource ledgers (core Host + graphics provider) are asserted. Core internals are test-only.
 */
import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { mount, unmount, tick } from 'svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import { getApplicationInternal } from '../../../core/dist/application/instance.svelte.js';
import { routeHostFor } from '../../../core/dist/application/renderer/choreography/route-host.js';
import { graphicsRepresentationResources } from '../../src/lib/representation/visual-provider.js';
import HostApp from './host/HostApp.svelte';
import { turntable, type HostAction, type HostState } from './host/model.js';

const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const waitFor = async (predicate: () => boolean, timeout = 8000) => { const start = performance.now(); while (!predicate()) { if (performance.now() - start > timeout) throw new Error('timed out'); await frame(); } };
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop(); });

type HostView = { diagnostics: Array<{ type: string; t?: number }>; resources(): Record<string, number | boolean>; visualResources?(): Record<string, number> };
async function launch() {
  const oldURL = location.href;
  history.replaceState(null, '', '/');
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [], pushes: string[] = [];
  const push = history.pushState.bind(history);
  history.pushState = (data, unused, next) => { pushes.push(String(next)); push(data, unused, next); };
  let app!: ApplicationInstance<HostState, HostAction>;
  const component = mount(HostApp, { target, props: { url: '/', dependencies: { trace }, onApp: (value: ApplicationInstance<HostState, HostAction>) => { app = value; } } });
  cleanups.push(async () => { await unmount(component); target.remove(); history.pushState = push; history.replaceState(null, '', oldURL); });
  await tick();
  const host = () => routeHostFor(getApplicationInternal(app as never).staged!) as unknown as HostView;
  await waitFor(() => { const canvas = target.querySelector('canvas'); return !!canvas && canvas.width > 0 && app.store.state.scene?.renderer.activeRenderer === 'webgpu'; });
  for (let i = 0; i < 10; i++) await frame();
  return { app, target, trace, pushes, host, runTime: () => Math.round(host().diagnostics.filter(event => event.type === 'frame').at(-1)?.t ?? -1) };
}
async function shot(rect: number[], onCapture: () => void) {
  const base64 = await page.screenshot({ save: false });
  onCapture();
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
  const scale = bitmap.width / innerWidth;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const [x, y, w, h] = rect.map(value => Math.round(value * scale));
  return context.getImageData(x!, y!, w!, h!).data;
}
function changed(a: Uint8ClampedArray, b: Uint8ClampedArray) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 30) n++; return Math.round((n / (a.length / 4)) * 1000) / 1000; }
function red(a: Uint8ClampedArray) { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i]! > 120 && a[i + 1]! < 80 && a[i + 2]! < 80) n++; return Math.round((n / (a.length / 4)) * 1000) / 1000; }

async function leaving(turning: boolean) {
  const f = await launch();
  if (turning) {
    f.app.store.dispatch({ type: 'scene', action: { type: 'presented', action: { type: 'startAnimation', animation: turntable } } });
    await waitFor(() => f.app.store.state.scene?.animations.some(entry => entry.id === 'turntable' && entry.startTime !== null) ?? false);
    for (let i = 0; i < 10; i++) await frame();
  }
  const source = f.target.querySelector('[data-model]')!.getBoundingClientRect();
  const rect = [source.x, source.y, source.width, source.height];
  (f.target.querySelector('[data-open]') as HTMLElement).click();
  // Commit observed (the gallery page retired and its model is represented): run time ≈ cue (200 ms) + elapsed.
  await waitFor(() => location.pathname === '/detail' && !f.target.querySelector('[data-model]') && !!document.querySelector('[data-route-representation="model"]'));
  const committedAt = performance.now();
  const cue = (f.host().diagnostics.find(event => event.type === 'cue')?.t ?? 200);
  const at = () => Math.round(cue + performance.now() - committedAt);
  await frame();
  let t1 = -1, t2 = -1;
  const a = await shot(rect, () => { t1 = at(); });
  const b = await shot(rect, () => { t2 = at(); });
  const run = { turning, runMs: [t1, t2], change: changed(a, b), redShareFirst: red(a), representation: document.querySelector('[data-route-representation="model"]') !== null };
  await waitFor(() => !document.querySelector('[data-route-representation]') && !f.host().resources().running);
  const ledgers = { core: f.host().resources(), engine: f.host().visualResources?.() ?? {}, graphics: graphicsRepresentationResources() };
  return { ...run, trace: [...f.trace], pushes: [...f.pushes], page: f.app.store.state.page?.type, ledgers };
}

it('real Host: route commits; the leaving WebGPU model copy keeps turning after retirement; everything is released', async () => {
  const control = await leaving(false);
  await cleanups.splice(0).reverse().reduce((p, stop) => p.then(() => stop()), Promise.resolve());
  const turning = await leaving(true);
  console.info('WEBGPU host', JSON.stringify({ control, turning }));
  for (const run of [control, turning]) {
    expect(run.trace).toEqual(['navigate']);
    expect(run.pushes).toEqual(['/detail']);
    expect(run.page).toBe('detail');
    expect(run.runMs[0]!).toBeGreaterThan(200); // after the commit retired the gallery
    expect(run.runMs[1]!).toBeLessThan(700); // before the declared fade
    expect(run.redShareFirst).toBeGreaterThan(0.03); // the copy shows the WebGPU-rendered model
    expect(run.ledgers.core).toEqual({ frames: 0, timers: 0, observers: 0, leases: 0, plane: false, representations: 0, running: false });
    expect(Object.values(run.ledgers.engine).every(value => value === 0)).toBe(true);
    expect(run.ledgers.graphics).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
  }
  expect(turning.change).toBeGreaterThan(control.change * 3 + 0.01);
});
