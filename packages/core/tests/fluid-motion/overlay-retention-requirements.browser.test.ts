/**
 * Main's overlay-lifetime resting-reaction requirements not yet met (22:40Z): nested unwind to the surviving layer's
 * contribution, reduced motion reaching the full declared resting pose (scale), and same-node channel independence.
 * These probes state the required behaviour exactly; see overlay-implementation-report.md for status.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OverlayApp from './overlay-fixtures/OverlayApp.svelte';
import { overlayDefinition, overlayHooks } from './overlay-fixtures/OverlayModel.js';
import { defineChoreography, type OverlayMotionHandle } from '../../src/lib/application/motion-public.js';
import type { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';

const cleanups: (() => void)[] = [];
beforeEach(() => { overlayHooks.withPlans = true; overlayHooks.catalog = true; overlayHooks.completions = { present: 0, dismiss: 0 }; });
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); overlayHooks.withPlans = false; overlayHooks.catalog = false; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };
const status = () => overlayHooks.state!().presentation.status;
function setup() {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(OverlayApp, { target, props: { definition: overlayDefinition() as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync();
  return overlayHooks.host as RouteHost;
}
const catalog = () => document.querySelector<HTMLElement>('[data-catalog]')!;
const opacityOf = () => Number(getComputedStyle(catalog()).opacity);
const scaleOf = () => Number((getComputedStyle(catalog()).scale || '1').split(' ')[0]) || 1;
async function toIdle() { overlayHooks.dispatch!({ type: 'close' }); flushSync(); await until(() => status() === 'idle'); flushSync(); await frame(); }

it('nested unwind: closing the child restores the PARENT layer\'s resting reaction (0.6), not the baseline', async () => {
  setup(); await frame(); await toIdle();
  const parent = overlayHooks.handle as OverlayMotionHandle, child = overlayHooks.childHandle as OverlayMotionHandle;
  parent.transition(defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to: 0.6 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await until(() => status() === 'presented'); for (let i = 0; i < 12; i++) await frame();
  child.transition(defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 0.6, to: 0.3 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'openChild' }); flushSync(); });
  await until(() => overlayHooks.state!().child.status === 'presented'); for (let i = 0; i < 12; i++) await frame();
  expect(opacityOf()).toBeCloseTo(0.3, 2);
  // Child-only close (the parent stays presented): the page unwinds to the PARENT's resting contribution.
  child.transition(defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: child.select('content'), side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to: 0 } }] }), () => { overlayHooks.dispatch!({ type: 'closeChild' }); flushSync(); });
  await until(() => overlayHooks.state!().child.status === 'idle'); for (let i = 0; i < 12; i++) await frame();
  expect(status()).toBe('presented');
  expect(opacityOf()).toBeCloseTo(0.6, 2);
});

it('reduced motion reaches the full declared resting POSE (scale), not only the dim', async () => {
  const host = setup(); await frame(); await toIdle();
  (host as unknown as { reduced: () => boolean }).reduced = () => true;
  const parent = overlayHooks.handle as OverlayMotionHandle;
  parent.transition(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0.6 }, scale: { from: 1, to: 0.95 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  expect(opacityOf()).toBeCloseTo(0.6, 3);
  expect(scaleOf()).toBeCloseTo(0.95, 3);
});

it('same-node channel independence: a later run animating only opacity keeps the retained resting scale', async () => {
  setup(); await frame(); await toIdle();
  const parent = overlayHooks.handle as OverlayMotionHandle, child = overlayHooks.childHandle as OverlayMotionHandle;
  parent.transition(defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to: 0.6 }, scale: { from: 1, to: 0.95 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await until(() => status() === 'presented'); for (let i = 0; i < 12; i++) await frame();
  expect(scaleOf()).toBeCloseTo(0.95, 2);
  child.transition(defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 0.6, to: 0.3 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'openChild' }); flushSync(); });
  for (let i = 0; i < 20; i++) await frame();
  expect(opacityOf()).toBeCloseTo(0.3, 2);
  expect(scaleOf()).toBeCloseTo(0.95, 2);
});

const rest = (to: number, extra: Record<string, unknown> = {}) => defineChoreography({ cueMs: 0, durationMs: 150, tracks: [{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 150, easing: 'linear', opacity: { from: 1, to }, lifetime: 'overlay', ...extra } as never] });
const back = (extra: Record<string, unknown> = {}) => defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
  { participant: 'catalog', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 }, ...extra } as never,
  { participant: (overlayHooks.handle as OverlayMotionHandle).select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
] });

it('displayed transform adoption: the close continues the retained SCALE from its displayed factor (not the declared from)', async () => {
  setup(); await frame(); await toIdle();
  const parent = overlayHooks.handle as OverlayMotionHandle;
  parent.transition(rest(0.6, { scale: { from: 1, to: 0.95 } }), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await until(() => status() === 'presented'); for (let i = 0; i < 12; i++) await frame();
  expect(scaleOf()).toBeCloseTo(0.95, 2);
  parent.transition(back({ scale: { from: 0.5, to: 1 } }), () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  await Promise.resolve(); await frame();
  expect(Math.abs(scaleOf() - 0.95)).toBeLessThan(0.02); // continues from the displayed factor, no jump to 0.5
  expect(await until(() => status() === 'idle')).toBe(true); await frame(); await frame();
  expect(scaleOf()).toBe(1); expect(opacityOf()).toBe(1);
});

it('reduced motion with a SCOPED selector and slide: a child open applies the declared resting pose to the parent modal content at once; closing the child restores it', async () => {
  const host = setup(); await frame();
  (host as unknown as { reduced: () => boolean }).reduced = () => true;
  const parent = overlayHooks.handle as OverlayMotionHandle, child = overlayHooks.childHandle as OverlayMotionHandle;
  const content = document.querySelector<HTMLElement>('[data-modal-content]')!;
  child.transition(defineChoreography({ cueMs: 0, durationMs: 200, tracks: [{ participant: parent.select('content'), side: 'outgoing', startMs: 0, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0.5 }, slide: { dx: 12, dy: 0 }, lifetime: 'overlay' }] }), () => { overlayHooks.dispatch!({ type: 'openChild' }); flushSync(); });
  expect(Number(getComputedStyle(content).opacity)).toBeCloseTo(0.5, 3);
  expect(getComputedStyle(content).translate.split(' ')[0]).toBe('12px');
  await until(() => overlayHooks.state!().child.status === 'presented', 10);
  overlayHooks.dispatch!({ type: 'closeChild' }); flushSync();
  await until(() => overlayHooks.state!().child.status === 'idle', 10); await frame();
  expect(Number(getComputedStyle(content).opacity)).toBe(1);
  expect(['none', '0px', '']).toContain(getComputedStyle(content).translate.split(' ')[0]);
});

it('removal: the reacting region is removed while resting — no stale write, the close proceeds, balanced cleanup', async () => {
  setup(); await frame(); await toIdle();
  const parent = overlayHooks.handle as OverlayMotionHandle;
  parent.transition(rest(0.6), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await until(() => status() === 'presented'); for (let i = 0; i < 12; i++) await frame();
  const removed = catalog();
  overlayHooks.dispatch!({ type: 'hideCatalog' }); flushSync();
  expect(removed.isConnected).toBe(false);
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  expect(await until(() => status() === 'idle')).toBe(true); await frame(); await frame();
  const { liveChoreographyLeases } = await import('../../src/lib/application/renderer/target-registry.js');
  expect(liveChoreographyLeases()).toBe(0);
});

it('rapid reopen: reopening during the close continues from the displayed page value and rests again at the declared value', async () => {
  setup(); await frame(); await toIdle();
  const parent = overlayHooks.handle as OverlayMotionHandle;
  parent.transition(rest(0.6), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await until(() => status() === 'presented'); for (let i = 0; i < 12; i++) await frame();
  parent.transition(back(), () => { overlayHooks.dispatch!({ type: 'close' }); flushSync(); });
  for (let i = 0; i < 6; i++) await frame();
  const mid = opacityOf();
  expect(mid).toBeGreaterThan(0.6); expect(mid).toBeLessThan(1);
  parent.transition(rest(0.6), () => { overlayHooks.dispatch!({ type: 'open' }); flushSync(); });
  await Promise.resolve();
  expect(Math.abs(opacityOf() - mid)).toBeLessThan(0.08); // no jump
  await until(() => status() === 'presented'); for (let i = 0; i < 16; i++) await frame();
  expect(opacityOf()).toBeCloseTo(0.6, 2);
});
