/**
 * Completion witnesses: per-corner radius and inset clip channels, qualified content options, managed
 * custom drivers, shared recapture with a moving ancestor, route focus, within-page choreography, and
 * zero owned visual resources after cancellation/supersession/Host destruction/repeated runs.
 */
import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { mount, unmount, tick } from 'svelte';
import VisualApp from './visual-fixtures/VisualApp.svelte';
import { localToggles, policy, requesters, type VisualIntent, type VisualState, type VisualAction } from './visual-fixtures/VisualModel.js';
import { getApplicationInternal } from '../../src/lib/application/instance.svelte.js';
import { routeHostFor, type RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { defineChoreography, defineVisualDriver, type ChoreographyPlan } from '../../src/lib/application/motion-public.js';
import type { RunDiagnostic } from '../../src/lib/application/renderer/choreography/run.js';
import type { ApplicationInstance, StagedRouteRequester } from '../../src/lib/application/index.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop(); requesters.length = 0; localToggles.length = 0; policy.allow = true; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const wait = async (predicate: () => boolean, timeout = 3000) => { const start = performance.now(); while (!predicate()) { if (performance.now() - start > timeout) throw new Error('timed out'); await frame(); } };

function setup(url = '/') {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [];
  let app!: ApplicationInstance<VisualState, VisualAction>;
  const component = mount(VisualApp, { target, props: { url, dependencies: { trace }, onApp: value => { app = value; } } });
  let destroyed = false;
  const destroy = async () => { if (destroyed) return; destroyed = true; await unmount(component); target.remove(); };
  cleanups.push(async () => { await destroy(); history.replaceState(oldState, '', oldURL); });
  const staged = () => getApplicationInternal(app).staged!;
  return {
    target, trace, staged, destroy, host: () => routeHostFor(staged())!,
    requester: (where: string): StagedRouteRequester<VisualIntent> => [...requesters].reverse().find(entry => entry.where === where)!.requester,
    diagnostics: <T extends RunDiagnostic['type']>(type: T, host?: RouteHost) => (host ?? routeHostFor(staged())!).diagnostics.filter((event): event is Extract<RunDiagnostic, { type: T }> => event.type === type)
  };
}
const ready = async () => { await tick(); await frame(); await frame(); };
const zero = (host: RouteHost) => expect(host.resources()).toEqual({ frames: 0, timers: 0, observers: 0, leases: 0, plane: false, representations: 0, running: false });
const plan = (tracks: ChoreographyPlan['tracks'], cueMs = 250, durationMs = 700) => defineChoreography({ cueMs, durationMs, tracks });

it('per-corner radius and inset clip channels animate through waypoints to their targets, then release', async () => {
  const f = setup();
  await ready();
  f.requester('home').request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 700, easing: 'linear', radius: { from: 0, to: [4, 8, 16, 32] }, clip: { from: [0, 0, 0, 0], to: [2, 4, 6, 8] }, path: [{ atMs: 250, pose: { relativeTo: 'source', dy: -20 }, radius: [30, 0, 30, 0], clip: [10, 10, 10, 10] }] }]) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 230 && event.t < 260));
  const mid = f.diagnostics('frame').filter(event => event.participant === 'hero').reduce((best, event) => Math.abs(event.t - 250) < Math.abs(best.t - 250) ? event : best);
  expect(mid.radius![0]).toBeGreaterThan(20);
  expect(mid.radius![1]).toBeLessThan(10);
  expect(mid.clip![0]).toBeGreaterThan(6);
  const rep = document.querySelector<HTMLElement>('[data-route-representation="hero"]')!;
  expect(rep.style.clipPath).toContain('inset(');
  expect(rep.style.clipPath).toContain('round');
  await wait(() => f.diagnostics('settled').length > 0);
  const last = f.diagnostics('frame').filter(event => event.participant === 'hero').at(-1)!;
  expect(last.radius!.map(value => Math.round(value))).toEqual([4, 8, 16, 32]);
  expect(last.clip!.map(value => Math.round(value))).toEqual([2, 4, 6, 8]);
  zero(f.host());
});

it('content options are qualified before playback: scale for images, text falls back, reflow bounded, clipReveal via a real clip lease', async () => {
  const f = setup();
  await ready();
  f.requester('home').request({ to: '/detail' }, { motion: plan([
    { participant: 'logo', side: 'shared', startMs: 0, durationMs: 600, content: 'scale' },
    { participant: 'hero', side: 'shared', startMs: 0, durationMs: 600, content: 'scale' }
  ]) });
  await wait(() => f.diagnostics('content').length >= 2);
  expect(f.diagnostics('content')).toContainEqual(expect.objectContaining({ participant: 'logo', requested: 'scale', applied: 'scale' }));
  expect(f.diagnostics('content')).toContainEqual(expect.objectContaining({ participant: 'hero', requested: 'scale', applied: 'crossfade', reason: 'textBearing' }));
  const logo = document.querySelector<HTMLElement>('[data-route-representation="logo"]')!;
  expect(logo.querySelector('img')).not.toBeNull();
  expect(logo.style.width).toBe('40px');
  await wait(() => /scale\((?!1, 1\))/.test(logo.style.transform) && f.trace.length === 1);
  await wait(() => f.diagnostics('settled').length > 0);
  zero(f.host());
  await f.destroy();

  const g = setup();
  await ready();
  g.requester('home').request({ to: '/card' }, { motion: plan([{ participant: 'card', side: 'shared', startMs: 0, durationMs: 700, content: 'clipReveal' }, { participant: 'hero', side: 'shared', startMs: 0, durationMs: 400, content: 'reflow' }], 200) });
  await wait(() => g.diagnostics('content').length >= 2);
  expect(g.diagnostics('content')).toContainEqual(expect.objectContaining({ participant: 'hero', applied: 'reflow' }));
  await wait(() => !!g.target.querySelector<HTMLElement>('[data-card-expanded]')?.style.clipPath);
  const expanded = g.target.querySelector<HTMLElement>('[data-card-expanded]')!;
  expect(expanded.style.clipPath).toContain('inset(');
  expect(expanded.style.opacity).not.toBe('0');
  await wait(() => g.diagnostics('settled').length > 0);
  expect(expanded.style.clipPath).toBe('');
  zero(g.host());
});

it('managed custom drivers: pose continuation into the measured destination, failure isolation, no-continuation snap, disposal', async () => {
  const disposed: string[] = [];
  defineVisualDriver({ name: 'wave', continuation: 'pose', sample: ({ progress, from }) => ({ x: from[0] + 60 * Math.sin(progress * Math.PI), y: from[1] - 40 * progress }), dispose: () => { disposed.push('wave'); } });
  defineVisualDriver({ name: 'broken', continuation: 'pose', sample: ({ progress }) => { if (progress > 0.1) throw new Error('driver bug'); return {}; } });
  defineVisualDriver({ name: 'snap', continuation: 'none', sample: ({ from }) => ({ x: from[0] + 10 }) });
  const unknown = defineChoreography({ cueMs: 100, durationMs: 300, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 300, driver: 'nope' }] });
  expect(unknown.diagnostics).toContain('driverUnknown:hero:nope->planned');

  const f = setup();
  await ready();
  f.requester('home').request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 700, driver: 'wave' }, { participant: 'card', side: 'shared', startMs: 0, durationMs: 700, driver: 'broken' }, { participant: 'logo', side: 'shared', startMs: 0, durationMs: 700, driver: 'snap' }]) });
  await wait(() => f.diagnostics('settled').length > 0);
  const events = f.diagnostics('driver');
  expect(events).toContainEqual(expect.objectContaining({ participant: 'hero', event: 'continued' }));
  expect(events).toContainEqual(expect.objectContaining({ participant: 'card', event: 'failed' }));
  expect(events).toContainEqual(expect.objectContaining({ participant: 'logo', event: 'noContinuation' }));
  expect(disposed).toEqual(['wave']);
  // The driven hero actually left the planned (hold) path before the destination took over.
  const early = f.diagnostics('frame').filter(event => event.participant === 'hero' && event.t > 50 && event.t < 200);
  const source = f.diagnostics('frame').find(event => event.participant === 'hero')!;
  expect(Math.max(...early.map(event => Math.abs(event.x - source.x)))).toBeGreaterThan(10);
  expect(f.trace).toEqual(['go:/detail']);
  zero(f.host());
});

it('shared recapture on content mutation and a moving ancestor before the cue: same wrapper, followed offset, continuous retarget', async () => {
  const f = setup();
  await ready();
  const hero = f.target.querySelector<HTMLElement>('[data-hero]')!;
  const main = f.target.querySelector<HTMLElement>('[data-page="home"]')!;
  f.requester('home').request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 700, easing: 'linear' }], 300) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 60));
  const rep = document.querySelector<HTMLElement>('[data-route-representation="hero"]')!;
  const before = hero.getBoundingClientRect().x;
  hero.textContent = 'Hero mutated';
  main.style.marginLeft = '30px';
  await wait(() => f.diagnostics('recapture').some(event => event.participant === 'hero'));
  expect(f.diagnostics('recapture').find(event => event.participant === 'hero')!.outcome).toBe('captured');
  expect(document.querySelector('[data-route-representation="hero"]')).toBe(rep);
  expect(rep.textContent).toContain('Hero mutated');
  expect((rep.firstElementChild as HTMLElement).style.opacity).toBe('1');
  expect(hero.getBoundingClientRect().x - before).toBeCloseTo(30, 0);
  await wait(() => f.diagnostics('retarget').some(event => event.cause === 'destination'));
  const retarget = f.diagnostics('retarget').find(event => event.cause === 'destination')!;
  const atRetarget = f.diagnostics('frame').find(event => event.participant === 'hero' && event.t === retarget.t)!;
  expect(atRetarget.x).toBeCloseTo(retarget.from[0], 6);
  expect(retarget.from[0]).toBeGreaterThan(before + 20);
  await wait(() => f.diagnostics('settled').length > 0);
  zero(f.host());
});

it('route focus at the semantic route boundary: destination heading focused with preventScroll and announced; keyboard continues in the new page', async () => {
  const f = setup();
  await ready();
  const initialActive = document.activeElement;
  window.scrollTo(0, 25);
  f.requester('home').request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 400 }], 100, 400) });
  await wait(() => f.trace.length === 1);
  await tick(); await frame();
  const title = f.target.querySelector<HTMLElement>('[data-route-title]')!;
  expect(document.activeElement).toBe(title);
  expect(initialActive).not.toBe(title);
  expect(document.querySelector('[data-composable-route-announcer]')?.textContent).toBe('Details');
  expect(document.querySelector('[data-composable-route-announcer]')?.getAttribute('aria-live')).toBe('polite');
  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(f.target.querySelector('[data-detail-action]'));
  window.scrollTo(0, 0);
  await wait(() => f.diagnostics('settled').length > 0);
});

it('within-page choreography: business state commits immediately; decoration bridges; rapid collapse continues from the displayed pose; zero resources', async () => {
  const f = setup();
  await ready();
  const toggle = localToggles.at(-1)!;
  const local = f.target.querySelector<HTMLElement>('[data-local]')!;
  const expand = plan([{ participant: 'local', side: 'shared', startMs: 0, durationMs: 600, easing: 'ease-in-out', radius: { from: 4, to: 20 }, path: [{ atMs: 200, pose: { relativeTo: 'viewport', x: 0.1, y: 0.1, width: 0.4, height: 0.3 } }] }], 0, 600);
  toggle.toggle(expand);
  // Immediate: the application state and its real interactive expanded content exist without any route commit.
  expect(toggle.expanded()).toBe(true);
  await tick();
  expect(f.target.querySelector('[data-local-collapse]')).not.toBeNull();
  expect(f.trace).toEqual([]);
  // Decorative bridge in the plane (distinguishable from the real, visibly painted control).
  expect(document.querySelector('[data-route-representation="local"]')).not.toBeNull();
  expect(Number(getComputedStyle(local).opacity)).toBe(1);
  await wait(() => f.diagnostics('retarget').some(event => event.participant === 'local' && event.cause === 'destination'));
  await wait(() => f.diagnostics('frame').filter(event => event.participant === 'local').length > 8);
  toggle.toggle(plan([{ participant: 'local', side: 'shared', startMs: 0, durationMs: 400 }], 0, 400));
  expect(toggle.expanded()).toBe(false);
  await wait(() => f.diagnostics('retarget').some(event => event.participant === 'local' && event.cause === 'successor'));
  const successor = f.diagnostics('retarget').find(event => event.cause === 'successor')!;
  expect(Math.abs(successor.velocity[2]) + Math.abs(successor.velocity[0])).toBeGreaterThan(0);
  await wait(() => f.diagnostics('settled').filter(event => event.reason === 'completed').length >= 1);
  expect(f.diagnostics('settled').map(event => event.reason)).toEqual(['superseded', 'completed']);
  expect(f.target.querySelector('[data-local-collapse]')).toBeNull();
  zero(f.host());
});

it('zero owned visual resources after veto return, supersession, repeated runs and Host destruction mid-run', async () => {
  const f = setup();
  await ready();
  const host = f.host();
  const home = f.requester('home');
  home.request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 700 }, { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 500 }]) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 80));
  home.request({ to: '/card' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 500 }, { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 400 }], 300, 500) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 60 && event.transaction === 2));
  policy.allow = false;
  await wait(() => f.diagnostics('settled').length >= 2);
  expect(f.diagnostics('settled').map(event => event.reason)).toEqual(['superseded', 'returned']);
  zero(host);
  policy.allow = true;
  for (let i = 0; i < 3; i++) {
    const toggle = localToggles.at(-1)!;
    toggle.toggle(plan([{ participant: 'local', side: 'shared', startMs: 0, durationMs: 150 }], 0, 150));
    await wait(() => !host.resources().running);
    zero(host);
  }
  home.request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 700 }, { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 500 }]) });
  await wait(() => host.resources().observers > 0 && host.resources().leases > 0);
  await f.destroy();
  zero(host);
});

import LocalApp from './visual-fixtures/LocalApp.svelte';
import { panelToggles, type LocalState, type LocalAction } from './visual-fixtures/LocalModel.js';
import { liveObservers } from '../../src/lib/application/renderer/choreography/run.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';
it('within-page choreography in a plain (non-routed, non-staged) application: explicit dispatch commits immediately; the layout is bridged', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  let app!: ApplicationInstance<LocalState, LocalAction>;
  const component = mount(LocalApp, { target, props: { onApp: value => { app = value; } } });
  cleanups.push(async () => { await unmount(component); target.remove(); panelToggles.length = 0; });
  await ready();
  const panel = target.querySelector<HTMLElement>('[data-panel-local]')!;
  const widths: number[] = [];
  let watching = true;
  const watch = () => { if (!watching) return; const rep = document.querySelector<HTMLElement>('[data-route-representation="panel"]'); if (rep) widths.push(Number.parseFloat(rep.style.width)); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  panelToggles.at(-1)!.toggle(plan([{ participant: 'panel', side: 'shared', startMs: 0, durationMs: 400, easing: 'linear', path: [{ atMs: 150, pose: { relativeTo: 'source', dw: 60 } }] }], 0, 400));
  expect(app.store.state.open).toBe(true);
  await wait(() => widths.length > 3 && !document.querySelector('[data-composable-route-plane]'));
  watching = false;
  await tick();
  expect(panel.getBoundingClientRect().width).toBe(360);
  // Intermediate frames between the old (120) and new (360) layouts; the real node's paint restored.
  expect(widths.some(width => width > 125 && width < 355)).toBe(true);
  expect(panel.style.opacity).toBe('');
  expect(liveObservers()).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('incoming text slides and fades in while the shared element is still moving (design example), through the public route assembly', async () => {
  const f = setup();
  await ready();
  const samples: { translate: string; opacity: number; heroMoving: boolean }[] = [];
  let watching = true;
  const watch = () => {
    if (!watching) return;
    const intro = f.target.querySelector<HTMLElement>('[data-intro]');
    if (intro) samples.push({ translate: intro.style.translate, opacity: Number(getComputedStyle(intro).opacity), heroMoving: !!document.querySelector('[data-route-representation="hero"]') });
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  f.requester('home').request({ to: '/detail' }, { motion: plan([
    { participant: 'hero', side: 'shared', startMs: 0, durationMs: 800, easing: 'ease-in-out' },
    { participant: 'intro', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 }, slide: { dy: 24 } }
  ], 250, 800) });
  await wait(() => f.diagnostics('settled').length > 0);
  watching = false;
  const moving = samples.filter(sample => sample.heroMoving && sample.translate);
  expect(moving.length).toBeGreaterThan(2);
  const offsets = moving.map(sample => Number.parseFloat(sample.translate.split(' ')[1] ?? '0'));
  expect(Math.max(...offsets)).toBeGreaterThan(8);
  expect(Math.min(...offsets)).toBeLessThan(Math.max(...offsets));
  expect(moving.some(sample => sample.opacity > 0.05 && sample.opacity < 0.95)).toBe(true);
  const intro = f.target.querySelector<HTMLElement>('[data-intro]')!;
  expect(intro.style.translate).toBe('');
  zero(f.host());
});

it('F1 (public assembly): an outgoing surface containing a native Save button stays painted until the commit, then its copy fades', async () => {
  const f = setup();
  await ready();
  const form = f.target.querySelector<HTMLElement>('[data-form]')!;
  const save = f.target.querySelector<HTMLButtonElement>('[data-save]')!;
  const seen: number[] = [];
  let watching = true;
  const watch = () => { if (!watching) return; if (form.isConnected) seen.push(Number(getComputedStyle(form).opacity)); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  f.requester('home').request({ to: '/detail' }, { motion: plan([{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 600 }, { participant: 'form', side: 'outgoing', startMs: 0, durationMs: 100, easing: 'linear', opacity: { from: 1, to: 0 } }], 400, 600) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 150));
  save.focus({ focusVisible: true } as FocusOptions);
  await wait(() => f.diagnostics('reveal').some(event => event.participant === 'form'));
  watching = false;
  // Before the commit (after the declared 100 ms fade), the real surface and its live control stayed at stable paint.
  expect(seen.length).toBeGreaterThan(5);
  for (const value of seen) expect(value).toBe(1);
  const reveal = f.diagnostics('reveal').find(event => event.participant === 'form')!;
  expect(reveal.opacity).toBe(1);
  expect(reveal.t).toBeGreaterThan(300);
  await wait(() => f.diagnostics('settled').length > 0);
  zero(f.host());
});
