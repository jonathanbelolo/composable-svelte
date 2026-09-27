/**
 * S1 Gate-1 browser witnesses: staged route with a mid-timeline commit cue through the real public
 * assembly (defineApplication staging, ApplicationRoot/Host, FeatureViews/FeatureOutlet, useStagedRoute,
 * useParticipant, defineChoreography). Frames are sampled with requestAnimationFrame.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick, flushSync } from 'svelte';
import { reactiveProps } from './slice-fixtures/props.svelte.js';
import SliceApp from './slice-fixtures/SliceApp.svelte';
import { choreography, requesters, type SliceState, type SliceAction, type Intent } from './slice-fixtures/SliceModel.js';
import { getApplicationInternal } from '../../src/lib/application/instance.svelte.js';
import { routeHostFor } from '../../src/lib/application/renderer/choreography/route-host.js';
import type { ApplicationInstance, StagedRouteRequester } from '../../src/lib/application/index.js';
import type { ProtocolEvent } from '../../src/lib/routing/staged/types.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop(); vi.restoreAllMocks(); requesters.length = 0; });
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

function setup(url = '/') {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [];
  let app!: ApplicationInstance<SliceState, SliceAction>;
  const props = reactiveProps({ url, dependencies: { trace }, onApp: (value: ApplicationInstance<SliceState, SliceAction>) => { app = value; }, hostVisible: true as boolean });
  const component = mount(SliceApp, { target, props });
  let destroyed = false;
  const destroy = async () => { if (destroyed) return; destroyed = true; await unmount(component); target.remove(); };
  cleanups.push(async () => { await destroy(); history.replaceState(oldState, '', oldURL); });
  const staged = () => getApplicationInternal(app).staged!;
  const events: ProtocolEvent[] = [];
  return {
    target, trace, props, destroy, get app() { return app; }, staged, events,
    listen() { const stop = staged().coordinator.subscribe(event => events.push(event)); cleanups.push(stop); },
    requester(where: string): StagedRouteRequester<Intent> { return [...requesters].reverse().find(entry => entry.where === where)!.requester; }
  };
}

interface FrameRecord {
  readonly time: number;
  readonly homeBodyConnected: boolean;
  readonly bodyRepOpacity: number | undefined;
  readonly heroRep: DOMRect | undefined;
  readonly accessibleHeroes: number;
  readonly planeSafe: boolean;
  readonly detailHeroOpacity: string | undefined;
}
function recordFrames(target: HTMLElement) {
  const frames: FrameRecord[] = [];
  let active = true;
  let homeBody: Element | null = target.querySelector('[data-body]');
  const loop = (time: number) => {
    if (!active) return;
    homeBody ??= target.querySelector('[data-body]');
    const plane = document.querySelector('[data-composable-route-plane]');
    const bodyRep = plane?.querySelector<HTMLElement>('[data-route-representation="body"]');
    const heroRep = plane?.querySelector<HTMLElement>('[data-route-representation="hero"]');
    const accessibleHeroes = [...document.querySelectorAll('[data-hero]')].filter(node => !node.closest('[aria-hidden="true"]')).length;
    const planeSafe = !plane || (plane.hasAttribute('inert') && plane.getAttribute('aria-hidden') === 'true' && !plane.querySelector('[id],a,button,input,select,textarea,[tabindex]'));
    frames.push({
      time, homeBodyConnected: !!homeBody?.isConnected,
      bodyRepOpacity: bodyRep ? Number(getComputedStyle(bodyRep).opacity) : undefined,
      heroRep: heroRep?.getBoundingClientRect(), accessibleHeroes, planeSafe,
      detailHeroOpacity: target.querySelector<HTMLElement>('[data-hero="detail"]')?.style.opacity
    });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { frames, stop: () => { active = false; } };
}

it('shared participant crosses a mid-timeline route commit; outgoing content hands off in the removal frame; incoming enters', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const push = vi.spyOn(history, 'pushState');
  expect(f.requester('home').source).toBe('feature');
  expect(f.requester('shell').source).toBe('root');
  const homeBody = f.target.querySelector('[data-body]')!;
  // Synchronous witness of the removal flush: runs before the next paint.
  const atRemoval: { bodyRepOpacity: number | undefined }[] = [];
  const observer = new MutationObserver(() => {
    if (!homeBody.isConnected && atRemoval.length === 0) {
      const rep = document.querySelector<HTMLElement>('[data-route-representation="body"]');
      atRemoval.push({ bodyRepOpacity: rep ? Number(rep.style.opacity) : undefined });
    }
  });
  observer.observe(f.target, { childList: true, subtree: true });
  cleanups.push(() => observer.disconnect());
  const recorder = recordFrames(f.target);
  cleanups.push(recorder.stop);

  const handle = f.requester('home').request({ to: '/detail' }, { motion: choreography });
  expect(handle.status).toEqual({ type: 'admitted', transaction: expect.any(Number) });
  expect(f.trace).toEqual([]);
  await frame(); await frame();
  // Before the cue: the outgoing page is genuinely current; no commit action reduced.
  expect(f.trace).toEqual([]);
  expect(f.target.querySelector('[data-page="home"]')).not.toBeNull();
  await vi.waitFor(() => expect(f.trace).toEqual(['go:/detail']), { timeout: 2000 });
  await tick();
  // Exactly one commit, one push, accepted with a written history result.
  const terminal = f.events.find(event => event.kind === 'terminal');
  expect(terminal).toMatchObject({ kind: 'terminal', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/detail', history: 'written' } });
  expect(f.events.map(event => event.kind)).toEqual(['request', 'admitted', 'terminal']);
  expect(push).toHaveBeenCalledOnce();
  expect(location.pathname).toBe('/detail');
  // The real destination hero is in the header; the source page is gone.
  expect(f.target.querySelector('header [data-hero="detail"]')).not.toBeNull();
  expect(f.target.querySelector('[data-page="home"]')).toBeNull();

  const host = routeHostFor(f.staged())!;
  await vi.waitFor(() => expect(host.diagnostics.some(event => event.type === 'settled')).toBe(true), { timeout: 3000 });
  recorder.stop();
  const cue = host.diagnostics.find(event => event.type === 'cue');
  expect(cue && cue.type === 'cue' && cue.t).toBeGreaterThanOrEqual(choreography.cueMs);
  // Value handoff: the reveal uses the actual current track value (linear 1 -> 0 over 500 ms).
  const reveal = host.diagnostics.find(event => event.type === 'reveal');
  expect(reveal?.type).toBe('reveal');
  if (reveal?.type !== 'reveal') throw new Error('no reveal');
  expect(reveal.opacity).toBeCloseTo(Math.max(0, 1 - reveal.t / 500), 6);
  expect(reveal.opacity).toBeGreaterThan(0);
  expect(reveal.opacity).toBeLessThan(1);
  // Same flush: when the real outgoing node leaves the DOM, the representation is already revealed.
  expect(atRemoval).toHaveLength(1);
  expect(atRemoval[0]!.bodyRepOpacity).toBeCloseTo(reveal.opacity, 6);
  // Every sampled frame: one accessible hero, a safe decorative plane, and never a painted gap or double.
  for (const record of recorder.frames) {
    expect(record.accessibleHeroes).toBe(1);
    expect(record.planeSafe).toBe(true);
    if (record.homeBodyConnected) expect(record.bodyRepOpacity ?? 0).toBe(0);
  }
  const removalFrames = recorder.frames.filter(record => !record.homeBodyConnected && record.bodyRepOpacity !== undefined);
  expect(removalFrames.length).toBeGreaterThan(0);
  expect(removalFrames[0]!.bodyRepOpacity).toBeGreaterThan(0);
  // Continuity of the shared representation: no frame-to-frame jump beyond a bounded step.
  const heroPositions = recorder.frames.flatMap(record => record.heroRep ? [record.heroRep] : []);
  expect(heroPositions.length).toBeGreaterThan(5);
  const steps = heroPositions.slice(1).map((rect, index) => Math.hypot(rect.x - heroPositions[index]!.x, rect.y - heroPositions[index]!.y));
  const maxStep = Math.max(...steps);
  expect(maxStep).toBeLessThan(80);
  const retargetEvent = host.diagnostics.find(event => event.type === 'retarget');
  expect(retargetEvent?.type).toBe('retarget');
  // Cleanup: plane removed, destination paint and incoming styles restored.
  const settled = host.diagnostics.find(event => event.type === 'settled');
  expect(settled).toMatchObject({ reason: 'completed' });
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
  expect(f.target.querySelector<HTMLElement>('[data-hero="detail"]')!.style.opacity).toBe('');
  expect(f.target.querySelector<HTMLElement>('[data-intro]')!.style.opacity).toBe('');
  // Destination paint was suppressed during flight (noninteractive destination exposed at settlement).
  expect(recorder.frames.some(record => record.detailHeroOpacity === '0')).toBe(true);
});

it('a newer request supersedes the pending transaction with zero commit actions for it', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const home = f.requester('home');
  const first = home.request({ to: '/detail' }, { motion: choreography });
  await frame(); await frame();
  const second = home.request({ to: '/about' }, { motion: choreography });
  expect(first.status).toMatchObject({ type: 'admitted' });
  expect(second.status).toMatchObject({ type: 'admitted' });
  const firstTx = (first.status as { transaction: number }).transaction;
  expect(f.staged().coordinator.status.transaction(firstTx as never)).toMatchObject({ phase: 'terminal', outcome: { type: 'superseded', attempted: 0 } });
  await vi.waitFor(() => expect(f.trace).toEqual(['go:/about']), { timeout: 2000 });
  expect(location.pathname).toBe('/about');
  const host = routeHostFor(f.staged())!;
  expect(host.diagnostics.filter(event => event.type === 'settled').map(event => event.type === 'settled' && event.reason)[0]).toBe('superseded');
});

it('reduced motion uses the next-turn cue: same protocol trace, no decorative plane', async () => {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation(query => query.includes('reduce') ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : original(query));
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const handle = f.requester('home').request({ to: '/detail' }, { motion: choreography });
  expect(handle.status).toMatchObject({ type: 'admitted' });
  expect(f.trace).toEqual(['go:/detail']);
  expect(f.events.map(event => event.kind)).toEqual(['request', 'admitted', 'terminal']);
  await tick();
  expect(f.target.querySelector('header [data-hero="detail"]')).not.toBeNull();
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
});

it('a retained feature requester is stale after its owner retires; root shell requester stays root-owned', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const home = f.requester('home');
  const shell = f.requester('shell');
  shell.request({ to: '/about' });
  expect(f.trace).toEqual(['go:/about']);
  await tick();
  const stale = home.request({ to: '/detail' });
  expect(stale.status).toEqual({ type: 'stale', reason: 'ownerRetired' });
  expect(f.trace).toEqual(['go:/about']);
  const unchanged = shell.request({ to: '/about' });
  expect(unchanged.status).toEqual({ type: 'unchanged' });
});

it('refused and immediate-degraded outcomes are classified by exact URL', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const shell = f.requester('shell');
  const refused = shell.request({ to: '/blocked' });
  expect(refused.status).toMatchObject({ type: 'admitted' });
  const tx = (refused.status as { transaction: number }).transaction;
  expect(f.staged().coordinator.status.transaction(tx as never)).toMatchObject({ phase: 'terminal', outcome: { type: 'refused', attempted: 1, domainCommitted: true, url: '/', history: 'unchanged' } });
});

it('destroying the root mid-run cancels with rootDestroyed and releases every decoration', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const handle = f.requester('home').request({ to: '/detail' }, { motion: choreography });
  await frame(); await frame();
  const tx = (handle.status as { transaction: number }).transaction;
  const coordinator = f.staged().coordinator;
  await f.destroy();
  expect(coordinator.status.transaction(tx as never)).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'rootDestroyed' } });
  expect(f.trace).toEqual([]);
  await frame(); await frame();
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
});

it('Host-only detach cancels the pending transaction with detached; later requests degrade to one immediate turn', async () => {
  const f = setup('/');
  await tick(); await frame();
  f.listen();
  const handle = f.requester('shell').request({ to: '/detail' }, { motion: choreography });
  await frame(); await frame();
  const tx = (handle.status as { transaction: number }).transaction;
  f.props.hostVisible = false;
  flushSync();
  expect(f.staged().coordinator.status.transaction(tx as never)).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'detached', attempted: 0 } });
  expect(f.trace).toEqual([]);
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
  // The root stays live; staging is unavailable, so a fresh root request degrades to today's immediate path.
  const later = f.requester('shell').request({ to: '/about' });
  expect(later.status).toMatchObject({ type: 'degraded', reason: 'noBinding', outcome: { type: 'committed', route: 'accepted', attempted: 1 } });
  expect(f.trace).toEqual(['go:/about']);
});
