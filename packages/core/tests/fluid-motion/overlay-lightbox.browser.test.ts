/**
 * Report gap 4: ImageLightbox with `motion={useOverlayMotion(...)}` inside an ApplicationHost. Open and close (Escape)
 * are claimed by the default plans — no built-in animation (no Web Animation on the viewer), completion once each
 * through the reducer's presentation events, nothing left behind.
 */
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LightboxApp from './overlay-fixtures/LightboxApp.svelte';
import { lightboxHooks } from './overlay-fixtures/LightboxHooks.js';
import { overlayDefinition } from './overlay-fixtures/OverlayModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };

it('ImageLightbox open and Escape close are choreographed by the default plans; no built-in animation; completion once each', async () => {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(LightboxApp, { target, props: { definition: overlayDefinition() as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync(); await frame();
  const store = lightboxHooks.store!;
  const status = () => store.state.lightbox.presentation.status;
  store.dispatch({ type: 'openLightbox', index: 0 }); flushSync();
  expect(status()).toBe('presenting');
  const viewer = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(viewer()).not.toBeNull();
  expect(viewer().getAnimations().length).toBe(0);
  for (let i = 0; i < 6; i++) await frame();
  const entering = Number(getComputedStyle(viewer()).opacity);
  expect(entering).toBeGreaterThan(0); expect(entering).toBeLessThan(1);
  expect(await until(() => status() === 'presented')).toBe(true);
  flushSync(); await frame();
  expect(Number(getComputedStyle(viewer()).opacity)).toBe(1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  viewer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flushSync();
  expect(status()).toBe('dismissing');
  expect(viewer().getAnimations().length).toBe(0);
  for (let i = 0; i < 6; i++) await frame();
  const leaving = Number(getComputedStyle(viewer()).opacity);
  expect(leaving).toBeGreaterThan(0); expect(leaving).toBeLessThan(1);
  expect(await until(() => status() === 'idle')).toBe(true);
  flushSync(); await frame();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});
