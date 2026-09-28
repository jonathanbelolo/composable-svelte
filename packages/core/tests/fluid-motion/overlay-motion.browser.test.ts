/**
 * Overlay orchestration through the public assembly (fluid-overlays implementation-interface §1–§2): a real
 * ApplicationHost, reducer-owned PresentationState, ModalPrimitive with `motion={useOverlayMotion(...)}`.
 * Claimed transitions skip the spring; completion is delivered exactly once per current obligation; a refused
 * close claims nothing; a reopen during dismissal cancels the old obligation without dispatch.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OverlayApp from './overlay-fixtures/OverlayApp.svelte';
import { overlayDefinition, overlayHooks } from './overlay-fixtures/OverlayModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';
import type { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';

const cleanups: (() => void)[] = [];
beforeEach(() => { overlayHooks.withPlans = true; overlayHooks.completions = { present: 0, dismiss: 0 }; });
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); overlayHooks.withPlans = false; overlayHooks.twoHeroes = false; overlayHooks.media = false; overlayHooks.conditional = false; overlayHooks.catalog = false; overlayHooks.noHero = false; overlayHooks.local = false; overlayHooks.video = false; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };
const status = () => overlayHooks.state!().presentation.status;
const opacity = (selector: string) => Number(getComputedStyle(document.querySelector(selector)!).opacity);

function setup() {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(OverlayApp, { target, props: { definition: overlayDefinition() as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync();
  return overlayHooks.host as unknown as Omit<RouteHost, "diagnostics"> & { diagnostics: { type: string; reason?: string; participant?: string; skipped?: string[] }[] };
}

it('close then open are choreographed live on one timeline; completion exactly once each; no spring, copies or leases left', async () => {
  const host = setup(); await frame();
  // Close: the live dismissing shell is driven (no copy), and completes once.
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(status()).toBe('dismissing');
  await frame(); await frame(); await frame(); await frame(); await frame(); await frame();
  const mid = opacity('[data-modal-content]');
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  expect(document.querySelector('[data-route-representation="content"]')?.getAttribute('style') ?? '').not.toMatch(/opacity: ?1/);
  expect(await until(() => status() === 'idle')).toBe(true);
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 1 });
  flushSync(); await frame();
  expect(document.querySelector('[data-modal-content]')).toBeNull();
  // Open: incoming roles fade/scale in, the page card flies to the modal hero, completion once.
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  expect(status()).toBe('presenting');
  await frame(); await frame(); await frame(); await frame(); await frame(); await frame();
  const entering = opacity('[data-modal-content]');
  expect(entering).toBeGreaterThan(0); expect(entering).toBeLessThan(1);
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  // C3: the flight into the modal renders in the modal layer's own slot (above its backdrop), not in the page plane.
  expect(flight!.closest('[data-composable-overlay-slot]')).not.toBeNull();
  expect(flight!.closest('[data-composable-overlay-layer]')?.contains(document.querySelector('[data-modal-content]'))).toBe(true);
  expect(await until(() => status() === 'presented')).toBe(true);
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 1 });
  flushSync(); await frame(); await frame();
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(opacity('[data-modal-backdrop]')).toBe(1);
  expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
  expect(host.diagnostics.some(event => event.type === 'unsupported' && event.reason === 'topLayer')).toBe(false);
});

it('a refused close claims and completes nothing; a reopen during dismissal cancels the old obligation without dispatch', async () => {
  setup(); await frame();
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: true });
  overlayHooks.dispatch!({ type: 'close' }); flushSync(); await frame(); await frame();
  expect(status()).toBe('presented');
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 0 });
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: false });
  overlayHooks.dispatch!({ type: 'close' }); flushSync(); await frame(); await frame(); await frame();
  expect(status()).toBe('dismissing');
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  expect(status()).toBe('presenting');
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 }); // the superseded dismissal never completes
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(liveChoreographyLeases()).toBe(0);
});

it('reduced motion: a claimed close completes immediately, exactly once, with no run or leases', async () => {
  const host = setup(); await frame();
  (host as unknown as { reduced: () => boolean }).reduced = () => true;
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(await until(() => status() === 'idle', 10)).toBe(true);
  await frame();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 1 });
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
});

it('Host destroyed mid-dismissal: the obligation is cancelled (never dispatched into the destroyed owner); leases and copies are released', async () => {
  setup(); await frame();
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  await frame(); await frame(); await frame();
  expect(status()).toBe('dismissing');
  for (const cleanup of cleanups.splice(0).reverse()) cleanup(); // unmount the application (Host disposal)
  await frame(); await frame(); await Promise.resolve();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 0 });
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('W-C3: during choreographed open/close the primitive keeps focus, inertness and scroll-lock authority (visuals only are claimed)', async () => {
  setup(); await frame();
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(await until(() => status() === 'idle')).toBe(true);
  flushSync(); await frame();
  expect(document.body.style.overflowY).toBe(''); // lock released with the last overlay
  const opener = document.createElement('button'); opener.textContent = 'opener'; document.body.append(opener); cleanups.push(() => opener.remove());
  opener.focus();
  overlayHooks.dispatch!({ type: 'open' }); flushSync(); await frame(); await frame(); await frame();
  expect(status()).toBe('presenting');
  // Mid-open: the modal owns focus and the document scroll lock, exactly as with the spring path.
  expect(document.querySelector('[data-modal-content]')!.contains(document.activeElement)).toBe(true);
  expect(document.body.style.overflowY).toBe('hidden');
  expect(await until(() => status() === 'presented')).toBe(true);
  overlayHooks.dispatch!({ type: 'close' }); flushSync(); await frame(); await frame(); await frame();
  expect(status()).toBe('dismissing');
  // Mid-close: the exit shell is inert (focus returned) but still holds the scroll lock until completion.
  expect(document.querySelector('[data-modal-content]')!.contains(document.activeElement)).toBe(false);
  expect(document.body.style.overflowY).toBe('hidden');
  expect(await until(() => status() === 'idle')).toBe(true);
  flushSync(); await frame();
  expect(document.body.style.overflowY).toBe('');
  expect(overlayHooks.completions.present).toBe(1);
});

it('C2 explicit entry: transition() prepares BEFORE the commit — a page source the commit removes is still captured and exits as a copy', async () => {
  const host = setup(); await frame();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const card = document.querySelector<HTMLElement>('[data-card]')!;
  const before = card.getBoundingClientRect();
  const plan = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: 'card', side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] });
  // One business commit: the card leaves the page and the modal closes (flushed inside the commit).
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  expect(document.querySelector('[data-card]')).toBeNull();
  expect(status()).toBe('dismissing');
  await frame(); await frame(); await frame();
  // The removed card was captured before the commit: its copy exits at the pre-commit geometry.
  const copy = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(copy).not.toBeNull();
  const rect = copy!.getBoundingClientRect();
  expect(Math.abs(rect.width - before.width)).toBeLessThan(1.5);
  expect(Math.abs(rect.left - before.left)).toBeLessThan(1.5);
  const mid = opacity('[data-modal-content]');
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  expect(await until(() => status() === 'idle')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 1 });
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
  expect(host.diagnostics.some(event => event.reason?.startsWith('overlayFailed'))).toBe(false);
});

it('C2 epoch: a pending explicit plan applies only to its own epoch; a stale one is discarded (nothing acquired) and the default plan runs', async () => {
  const host = setup(); await frame();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const { claimOverlayTransition } = await import('../../src/lib/application/renderer/choreography/overlay-motion.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const requests: { explicit: boolean; prepared?: unknown }[] = [];
  const original = host.overlayTransition.bind(host);
  (host as unknown as { overlayTransition: typeof original }).overlayTransition = request => { requests.push({ explicit: request.explicit, prepared: request.prepared }); return original(request); };
  const plan = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: handle.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0.5 } }
  ] });
  // Stale: the plan was recorded for the bound instance, but a different instance (another epoch) claims.
  handle.transition(plan, () => {});
  expect(liveChoreographyLeases()).toBe(0); // captured before the commit, but nothing acquired before acceptance
  const stranger = { owner: {}, backdrop: undefined, content: undefined };
  const claim = claimOverlayTransition(handle, 'dismiss', stranger, () => {});
  expect(requests.at(-1)).toEqual({ explicit: false, prepared: undefined });
  claim?.cancel('test');
  expect(liveChoreographyLeases()).toBe(0); // the stale prepared run was discarded, restoring in this task
  expect(opacity('[data-modal-content]')).toBe(1);
  // Unclaimed (refused): discarded after the flush.
  handle.transition(plan, () => {});
  await Promise.resolve(); await frame();
  expect(liveChoreographyLeases()).toBe(0);
  expect(opacity('[data-modal-content]')).toBe(1);
  // Same epoch: the prepared run is the one claimed.
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  expect(status()).toBe('dismissing');
  expect(requests.at(-1)?.explicit).toBe(true);
  expect(requests.at(-1)?.prepared).toBeTruthy();
  expect(await until(() => status() === 'idle')).toBe(true);
  await frame();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 1 });
  expect(liveChoreographyLeases()).toBe(0);
});

const closeToIdle = async () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); expect(await until(() => status() === 'idle')).toBe(true); flushSync(); await frame(); overlayHooks.completions = { present: 0, dismiss: 0 }; };

it('C5: a REFUSED explicit transition overlapping a running open leaves that run progressing untouched (same copy, leases, tracks, obligation)', async () => {
  setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  for (let i = 0; i < 8; i++) await frame(); // the card → hero flight and the content fade are mid-run
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  const content = document.querySelector<HTMLElement>('[data-modal-content]')!;
  const leases = liveChoreographyLeases();
  const copies = document.querySelectorAll('[data-route-representation]').length;
  const before = Number(content.style.opacity);
  expect(before).toBeGreaterThan(0); expect(before).toBeLessThan(1);
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: true });
  // An overlapping explicit close (same content/backdrop + the card), refused by the reducer's guard.
  const overlapping = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: handle.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('hero'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] });
  handle.transition(overlapping, () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  expect(status()).toBe('presenting');
  // Same task, before paint: nothing yielded, restored or re-written.
  expect(flight!.isConnected).toBe(true);
  expect(document.querySelectorAll('[data-route-representation]').length).toBe(copies);
  expect(liveChoreographyLeases()).toBe(leases);
  expect(Number(content.style.opacity)).toBe(before);
  await Promise.resolve(); await frame(); await frame();
  expect(flight!.isConnected).toBe(true);
  expect(Number(content.style.opacity)).toBeGreaterThan(before); // the earlier run keeps progressing
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('C2 explicit open: the shared source is captured before the commit removes it; the flight departs from its pre-commit geometry', async () => {
  const host = setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const before = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
  const plan = defineChoreography({ cueMs: 0, durationMs: 400, tracks: [
    { participant: 'card', side: 'shared', from: 'card', to: handle.select('hero'), startMs: 0, durationMs: 400, easing: 'linear' },
    { participant: handle.select('content'), side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] });
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(document.querySelector('[data-card]')).toBeNull();
  expect(status()).toBe('presenting');
  await Promise.resolve();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  const start = flight!.getBoundingClientRect();
  expect(Math.abs(start.left - before.left)).toBeLessThan(2);
  expect(Math.abs(start.width - before.width)).toBeLessThan(2);
  expect(host.diagnostics.some(event => event.reason === 'card:missingSource' || (event as { skipped?: string[] }).skipped?.includes('card:missingSource'))).toBe(false);
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('destination-phase ambiguity is decided before any destination is suppressed (no acquire-then-rollback)', async () => {
  const host = setup(); await frame();
  await closeToIdle();
  overlayHooks.twoHeroes = true;
  const writes: string[] = [];
  const observer = new MutationObserver(records => { for (const record of records) { const node = record.target as HTMLElement; if (node.matches?.('[data-modal-hero], [data-modal-hero2]') && node.style.opacity !== '') writes.push(node.style.opacity); } });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  cleanups.push(() => observer.disconnect());
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  await Promise.resolve(); await frame(); await frame();
  observer.takeRecords().forEach(record => { const node = record.target as HTMLElement; if (node.matches?.('[data-modal-hero], [data-modal-hero2]') && node.style.opacity !== '') writes.push(node.style.opacity); });
  expect(document.querySelector('[data-modal-hero2]')).not.toBeNull();
  expect(host.diagnostics.some(event => event.participant === 'card' && event.reason === 'destinationAmbiguous')).toBe(true);
  expect(writes).toEqual([]); // neither candidate was ever suppressed or written
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('U2 nested combined dismissal: one parent plan staggers the live child and the parent on one timeline; the child joins (no spring), both complete once; authority stays with the primitives', async () => {
  setup(); await frame();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const child = overlayHooks.childHandle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  overlayHooks.dispatch!({ type: 'openChild' }); flushSync();
  expect(await until(() => overlayHooks.state!().child.status === 'presented')).toBe(true);
  flushSync(); await frame(); await frame();
  const combined = defineChoreography({ cueMs: 0, durationMs: 400, tracks: [
    { participant: child.select('content'), side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: child.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('content'), side: 'outgoing', startMs: 200, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('backdrop'), side: 'outgoing', startMs: 200, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] });
  handle.transition(combined, () => { overlayHooks.dispatch!({ type: 'closeAll' }); flushSync(); });
  expect(status()).toBe('dismissing');
  expect(overlayHooks.state!().child.status).toBe('dismissing');
  const childContent = document.querySelector<HTMLElement>('[data-child-content]')!;
  expect(childContent.getAnimations().length).toBe(0); // the child joined the run: no spring (single writer)
  await until(() => opacity('[data-child-content]') < 0.6, 30);
  // Stagger: the child is leaving while the parent has not started.
  expect(opacity('[data-child-content]')).toBeLessThan(0.6);
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(document.body.style.overflowY).toBe('hidden'); // scroll-lock authority unchanged during the overlap
  expect(document.querySelectorAll('[data-modal-content] *').length).toBeGreaterThan(0);
  expect(await until(() => opacity('[data-modal-content]') < 1 && opacity('[data-modal-content]') > 0, 40)).toBe(true);
  expect(await until(() => status() === 'idle')).toBe(true);
  await frame(); await frame(); flushSync();
  expect(overlayHooks.completions.dismiss).toBe(1);
  expect(overlayHooks.completions.childDismiss).toBe(1);
  expect(overlayHooks.state!().child.status).toBe('idle');
  expect(document.querySelector('[data-child-content]')).toBeNull();
  expect(document.body.style.overflowY).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('C2 default phase (Main disposition): one accepted action removes the page card AND opens the modal — the DEFAULT open plan captured the card before the destructive render; the flight departs from its pre-render geometry into the modal layer', async () => {
  const host = setup(); await frame();
  await closeToIdle();
  const before = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
  overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'open' }); flushSync();
  expect(document.querySelector('[data-card]')).toBeNull();
  expect(status()).toBe('presenting');
  await Promise.resolve();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  const start = flight!.getBoundingClientRect();
  expect(Math.abs(start.left - before.left)).toBeLessThan(2); expect(Math.abs(start.width - before.width)).toBeLessThan(2);
  expect(host.diagnostics.some(event => event.type === 'prepared' && (event.skipped ?? []).includes('card:missingSource'))).toBe(false);
  await frame(); await frame(); await frame();
  expect(flight!.closest('[data-composable-overlay-layer]')?.contains(document.querySelector('[data-modal-content]'))).toBe(true); // cross-owner: page source → modal layer
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(opacity('[data-modal-content]')).toBe(1);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('C3 portable media: a live canvas flight is re-homed into the modal layer (with or without moveBefore) and keeps its content; a cross-origin frame copy carries no live browsing context; other tracks run', async () => {
  overlayHooks.media = true;
  const host = setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const frameCard = document.querySelector<HTMLIFrameElement>('[data-frame-card]')!;
  expect(await until(() => frameCard.contentDocument === null)).toBe(true); // loaded: an opaque (cross-origin) document
  const plan = defineChoreography({ cueMs: 0, durationMs: 400, tracks: [
    { participant: 'canvasCard', side: 'shared', from: 'canvasCard', to: handle.select('hero'), startMs: 0, durationMs: 400, easing: 'linear' },
    { participant: 'frameCard', side: 'shared', from: 'frameCard', to: handle.select('hero'), startMs: 0, durationMs: 400, easing: 'linear' },
    { participant: handle.select('content'), side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] });
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await Promise.resolve(); await frame(); await frame();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="canvasCard"]');
  expect(flight).not.toBeNull();
  // Portable: re-homed into the modal layer's slot on every engine (moveBefore is optional).
  expect(flight!.closest('[data-composable-overlay-layer]')?.contains(document.querySelector('[data-modal-content]'))).toBe(true);
  const underlay = flight!.querySelector('canvas')!;
  expect(Array.from(underlay.getContext('2d')!.getImageData(1, 1, 1, 1).data.slice(0, 3))).toEqual([255, 0, 0]); // content kept across the move
  expect(host.diagnostics.some(event => event.reason?.startsWith('layerUnreachable') || event.reason?.includes('liveMedia'))).toBe(false);
  // A cross-origin frame's copy holds no live browsing context (reported unrepresented): nothing reloadable is re-inserted.
  const frameCopy = document.querySelector<HTMLElement>('[data-route-representation="frameCard"]');
  expect(frameCopy?.querySelector('iframe') ?? null).toBeNull();
  expect(host.diagnostics.some(event => event.participant === 'frameCard' && event.reason === 'crossOriginFrame')).toBe(true);
  const entering = opacity('[data-modal-content]');
  expect(entering).toBeGreaterThan(0); expect(entering).toBeLessThan(1); // other tracks keep running
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
  const { liveMediaResources } = await import('../../src/lib/application/renderer/representation/builtins.js');
  expect(liveMediaResources()).toBe(0);
});

it('C2 default phase, CONDITIONAL overlay component: the Modal mounts in the same render that removes the card; the page-created handle\'s presentation probe captures the card before that render', async () => {
  overlayHooks.conditional = true;
  const host = setup(); await frame();
  await closeToIdle();
  expect(document.querySelector('[data-modal-content]')).toBeNull();
  const before = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
  overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'open' }); flushSync();
  expect(document.querySelector('[data-card]')).toBeNull();
  await Promise.resolve();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  expect(Math.abs(flight!.getBoundingClientRect().left - before.left)).toBeLessThan(2);
  expect(host.diagnostics.some(event => event.type === 'prepared' && (event.skipped ?? []).includes('card:missingSource'))).toBe(false);
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('C2 default phase: a REFUSED close (guard) prepares nothing at the checkpoint and leaves a running open untouched', async () => {
  setup(); await frame();
  await closeToIdle();
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  for (let i = 0; i < 6; i++) await frame();
  const content = document.querySelector<HTMLElement>('[data-modal-content]')!;
  const before = Number(content.style.opacity), leases = liveChoreographyLeases();
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: true });
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(status()).toBe('presenting');
  expect(liveChoreographyLeases()).toBe(leases);
  expect(Number(content.style.opacity)).toBe(before);
  await frame(); await frame();
  expect(Number(content.style.opacity)).toBeGreaterThan(before);
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(liveChoreographyLeases()).toBe(0);
});

it('persistent page reaction: a still-mounted catalog WITH focusable controls follows its declared dim under the opening modal; DOM kept; focus stays with the modal coordinator', async () => {
  overlayHooks.catalog = true;
  const host = setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const catalog = document.querySelector<HTMLElement>('[data-catalog]')!;
  const plan = defineChoreography({ cueMs: 0, durationMs: 400, tracks: [
    { participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: handle.select('content'), side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] });
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  for (let i = 0; i < 8; i++) await frame();
  const mid = Number(getComputedStyle(catalog).opacity);
  expect(mid).toBeLessThan(0.95); expect(mid).toBeGreaterThan(0); // really reacts along its declared curve (no floor)
  expect(catalog.isConnected).toBe(true); expect(catalog.inert).toBe(false);
  expect(document.querySelector<HTMLElement>('[data-route-representation="catalog"]')?.style.opacity ?? '0').toBe('0'); // the live region paints, its standby copy stays unrevealed
  // Visible focus on a page control during the reaction restores its paint (never an invisible focus target).
  const button = document.querySelector<HTMLButtonElement>('[data-catalog-button]')!;
  await userFocusVisible(button);
  await frame(); await frame();
  // Either the modal's focus authority keeps focus inside it, or a focused page region is pinned to stable paint.
  const pinned = host.diagnostics.some(event => event.type === 'focusPinned' && event.participant === 'catalog');
  expect(!catalog.contains(document.activeElement) || pinned).toBe(true);
  // (Lifetime: the reaction ends with its run — the page returns to stable at settle; retention while presented is
  // an open contract question, see the implementation report.)
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame();
  expect(Number(getComputedStyle(catalog).opacity)).toBe(1);
  expect(liveChoreographyLeases()).toBe(0);
});
async function userFocusVisible(node: HTMLElement) { const { userEvent } = await import('vitest/browser'); if (!node.matches(':focus-visible')) { document.body.focus(); await userEvent.keyboard('{Tab}'); node.focus(); } }

it('R-11: a refused explicit transition\'s discarded preparation settles "unclaimed" — never reported as superseding motion; no frames, no paint', async () => {
  const host = setup(); await frame();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: true }); flushSync();
  const from = host.diagnostics.length;
  const plan = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: handle.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }] });
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  await Promise.resolve(); await frame(); await frame();
  const events = host.diagnostics.slice(from) as { type: string; reason?: string }[];
  expect(events.filter(event => event.type === 'settled').map(event => event.reason)).toEqual(['unclaimed']);
  expect(events.some(event => event.type === 'frame' || event.type === 'prepared')).toBe(false);
  expect(document.querySelector<HTMLElement>('[data-modal-content]')!.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
});

const openRemovingCard = async () => {
  const before = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
  overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'open' }); flushSync();
  await Promise.resolve();
  return before;
};

it('conditional declaration: repeated epochs, refusal and replacement — each accepted open captures the removed card pre-render; a refused close prepares nothing; a rapid reversal continues the displayed paint', async () => {
  overlayHooks.conditional = true;
  const host = setup(); await frame();
  await closeToIdle();
  for (const epoch of [1, 2]) {
    if (epoch === 2) { overlayHooks.dispatch!({ type: 'showCard' }); flushSync(); await frame(); }
    const before = await openRemovingCard();
    const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
    expect(flight, `epoch ${epoch}`).not.toBeNull();
    expect(Math.abs(flight!.getBoundingClientRect().left - before.left)).toBeLessThan(2);
    expect(await until(() => status() === 'presented')).toBe(true);
    await frame(); await frame();
    // Refusal: a guarded close commits nothing — nothing prepared, nothing acquired.
    const settledBefore = host.diagnostics.filter(event => event.type === 'settled').length;
    overlayHooks.dispatch!({ type: 'refuseClose', refuse: true }); overlayHooks.dispatch!({ type: 'close' }); flushSync(); await frame();
    expect(status()).toBe('presented');
    expect(host.diagnostics.filter(event => event.type === 'settled').length).toBe(settledBefore);
    expect(liveChoreographyLeases()).toBe(0);
    overlayHooks.dispatch!({ type: 'refuseClose', refuse: false });
    await closeToIdle();
    expect(document.querySelector('[data-modal-content]')).toBeNull(); // conditional: unmounted between epochs
  }
  // Replacement: open then an immediate accepted close continues from the displayed paint (no reset jump).
  overlayHooks.dispatch!({ type: 'open' }); flushSync();
  for (let i = 0; i < 6; i++) await frame();
  const shown = opacity('[data-modal-content]');
  overlayHooks.dispatch!({ type: 'close' }); flushSync(); await Promise.resolve();
  expect(Math.abs(opacity('[data-modal-content]') - shown)).toBeLessThan(0.1);
  expect(await until(() => status() === 'idle')).toBe(true);
  await frame(); await frame();
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('conditional declaration: absent destination settles the flight honestly with balanced cleanup; owner (Host) disposal mid-flight cancels the obligation and releases everything', async () => {
  overlayHooks.conditional = true; overlayHooks.noHero = true;
  setup(); await frame();
  await closeToIdle();
  await openRemovingCard();
  expect(await until(() => status() === 'presented')).toBe(true);
  await frame(); await frame(); await frame();
  expect(overlayHooks.completions).toEqual({ present: 1, dismiss: 0 });
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  // Disposal mid-flight (a new epoch).
  await closeToIdle();
  overlayHooks.dispatch!({ type: 'showCard' }); flushSync(); await frame();
  overlayHooks.noHero = false;
  await openRemovingCard();
  await frame(); await frame();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  await frame(); await frame(); await Promise.resolve();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 0 });
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('C2 bindable/prop-only update (no store commit): one Svelte update removes the page card and presents the modal — the Host pre-effect captured the card before the destructive render', async () => {
  overlayHooks.local = true;
  const host = setup(); await frame();
  // The always-mounted Modal follows page-local state; start idle.
  overlayHooks.setLocal!('idle', false); flushSync(); await frame(); await frame();
  const before = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
  overlayHooks.setLocal!('presenting', true); flushSync();
  expect(document.querySelector('[data-card]')).toBeNull();
  await Promise.resolve();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  expect(Math.abs(flight!.getBoundingClientRect().left - before.left)).toBeLessThan(2);
  expect(host.diagnostics.some(event => event.type === 'prepared' && (event.skipped ?? []).includes('card:missingSource'))).toBe(false);
  await until(() => liveChoreographyLeases() === 0, 150);
  expect(host.diagnostics.some(event => event.type === 'settled' && (event as { reason?: string }).reason === 'completed')).toBe(true);
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('source-owner disposal: the conditional overlay owner is unmounted mid-dismissal by an external accepted change — its obligation is cancelled (never dispatched), resources released, page intact', async () => {
  overlayHooks.conditional = true;
  setup(); await frame();
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  await frame(); await frame(); await frame();
  expect(status()).toBe('dismissing');
  // An external accepted change retires the presentation (owner disposed) before the choreographed close completes.
  overlayHooks.dispatch!({ type: 'dismissalCompleted' }); flushSync();
  expect(document.querySelector('[data-modal-content]')).toBeNull();
  for (let i = 0; i < 40; i++) await frame();
  expect(overlayHooks.completions).toEqual({ present: 0, dismiss: 0 }); // the retired owner's obligation never fires
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(document.querySelector('[data-card]')).not.toBeNull();
});

it('overlay-lifetime resting reaction: the page dim is HELD past its duration while presented (open completes without waiting), survives a refused close, and the accepted close continues from the displayed value to baseline; balanced cleanup', async () => {
  overlayHooks.catalog = true;
  setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const catalog = document.querySelector<HTMLElement>('[data-catalog]')!;
  const shown = () => Number(getComputedStyle(catalog).opacity);
  const open = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0.6 }, lifetime: 'overlay' },
    { participant: handle.select('content'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] });
  handle.transition(open, () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(await until(() => status() === 'presented')).toBe(true);
  expect(overlayHooks.completions.present).toBe(1); // open completion does not wait for the hold
  for (let i = 0; i < 30; i++) await frame();
  expect(shown()).toBeCloseTo(0.6, 2); // held past the track's duration: no snap back at settle
  // Refused close: the resting state is preserved.
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: true }); overlayHooks.dispatch!({ type: 'close' }); flushSync(); await frame(); await frame();
  expect(shown()).toBeCloseTo(0.6, 2);
  overlayHooks.dispatch!({ type: 'refuseClose', refuse: false }); flushSync();
  // Accepted close whose plan restores the page: continues from the displayed resting value.
  const close = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: 'catalog', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } },
    { participant: handle.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] });
  handle.transition(close, () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  await Promise.resolve();
  expect(Math.abs(shown() - 0.6)).toBeLessThan(0.08); // no jump to the track's declared from
  for (let i = 0; i < 6; i++) await frame();
  expect(shown()).toBeGreaterThan(0.6); expect(shown()).toBeLessThan(1);
  expect(await until(() => status() === 'idle')).toBe(true);
  await frame(); await frame();
  expect(shown()).toBe(1);
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});

it('overlay-lifetime resting reaction: Host destruction while presented restores the page and leaves no leases', async () => {
  overlayHooks.catalog = true;
  setup(); await frame();
  await closeToIdle();
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const catalog = document.querySelector<HTMLElement>('[data-catalog]')!;
  handle.transition(defineChoreography({ cueMs: 0, durationMs: 200, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0.5 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(await until(() => status() === 'presented')).toBe(true);
  for (let i = 0; i < 10; i++) await frame();
  expect(Number(getComputedStyle(catalog).opacity)).toBeCloseTo(0.5, 2);
  expect(liveChoreographyLeases()).toBeGreaterThan(0);
  const survivor = catalog; // unmount the application (Host destroyed)
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  await frame();
  expect(survivor.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
});

it('overlay-lifetime resting reaction under reduced motion: the open reaches the same resting state immediately (no animation), the close releases it immediately; balanced', async () => {
  overlayHooks.catalog = true;
  const host = setup(); await frame();
  await closeToIdle();
  (host as unknown as { reduced: () => boolean }).reduced = () => true;
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const catalog = document.querySelector<HTMLElement>('[data-catalog]')!;
  handle.transition(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0.6 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(Number(getComputedStyle(catalog).opacity)).toBeCloseTo(0.6, 3); // immediately, not an unfinished animation
  expect(await until(() => status() === 'presented', 10)).toBe(true);
  await frame(); await frame();
  expect(Number(getComputedStyle(catalog).opacity)).toBeCloseTo(0.6, 3);
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(await until(() => status() === 'idle', 10)).toBe(true);
  expect(catalog.style.opacity).toBe('');
  await frame();
  expect(liveChoreographyLeases()).toBe(0);
});

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function mseInto(video: HTMLVideoElement) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d')!; let h = 0;
  const timer = setInterval(() => { h = (h + 23) % 360; g.fillStyle = `hsl(${h} 90% 50%)`; g.fillRect(0, 0, 64, 36); }, 30);
  cleanups.push(() => clearInterval(timer));
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type }); const chunks: Blob[] = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start(); await sleep(1500); rec.stop(); await new Promise(r => { rec.onstop = r; });
  const ms = new MediaSource(); video.src = URL.createObjectURL(ms);
  await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
  const sb = ms.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb.appendBuffer(await new Blob(chunks, { type }).arrayBuffer());
  await new Promise(r => sb.addEventListener('updateend', r, { once: true })); ms.endOfStream();
}

it('C3 live MSE video across layers: the removed card\'s playing MediaSource video flies into the modal layer (moveBefore or re-insertion) without pausing; currentTime keeps advancing', async () => {
  overlayHooks.video = true;
  const host = setup(); await frame();
  await closeToIdle();
  const video = document.querySelector<HTMLVideoElement>('[data-video-card]')!;
  await mseInto(video); video.loop = true; await video.play(); await sleep(200);
  const { defineChoreography } = await import('../../src/lib/application/motion-public.js');
  const handle = overlayHooks.handle as import('../../src/lib/application/motion-public.js').OverlayMotionHandle;
  const plan = defineChoreography({ cueMs: 0, durationMs: 1200, tracks: [
    { participant: 'videoCard', side: 'shared', from: 'videoCard', to: handle.select('hero'), startMs: 0, durationMs: 1200, easing: 'linear' },
    { participant: handle.select('content'), side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] });
  handle.transition(plan, () => { overlayHooks.dispatch!({ type: 'hideCard' }); overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(document.querySelector('[data-video-card]')).toBeNull();
  await Promise.resolve(); await frame(); await frame();
  const flight = document.querySelector<HTMLElement>('[data-route-representation="videoCard"]');
  expect(flight).not.toBeNull();
  expect(flight!.closest('[data-composable-overlay-layer]')?.contains(document.querySelector('[data-modal-content]'))).toBe(true); // re-homed
  // MSE: the built-in provider resumes the detached real element (muted) and mirrors it into the copy's canvas.
  await sleep(200);
  expect(video.paused, `the detached MSE element stopped (moveBefore: ${'moveBefore' in Element.prototype})`).toBe(false);
  const t0 = video.currentTime;
  const mirror = [...flight!.querySelectorAll<HTMLCanvasElement>('canvas')].find(canvas => getComputedStyle(canvas).visibility !== 'hidden');
  expect(mirror).toBeTruthy();
  const sample = () => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d')!; g.drawImage(mirror!, 0, 0, 4, 4); return Array.from(g.getImageData(1, 1, 1, 1).data).join(','); };
  const before = sample(); await sleep(400);
  expect(video.paused).toBe(false);
  expect(video.currentTime).toBeGreaterThan(t0); // playback continues across the re-home
  expect(sample()).not.toBe(before); // the re-homed copy keeps showing live frames
  expect(host.diagnostics.some(event => event.reason?.startsWith('layerUnreachable'))).toBe(false);
  expect(await until(() => status() === 'presented')).toBe(true);
});
