/**
 * Report gap 2: a REAL managed PresentationView (deferred dismissal) inside an ApplicationHost. Escape and an outside
 * pointer go through the dismissal coordinator to `view.dismiss()`; the reducer's accepted `dismissing` is claimed by
 * the default close plan (cause-independent), completes once through the component callback, and clears the child.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ManagedOverlayApp from './overlay-fixtures/ManagedOverlayApp.svelte';
import { managedHooks } from './overlay-fixtures/ManagedOverlayHooks.js';
import { overlayDefinition } from './overlay-fixtures/OverlayModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const cleanups: (() => void)[] = [];
beforeEach(() => { managedHooks.completions = { present: 0, dismiss: 0 }; });
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };
const opacity = (selector: string) => Number(getComputedStyle(document.querySelector(selector)!).opacity);

function setup() {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(ManagedOverlayApp, { target, props: { definition: overlayDefinition() as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync();
}

async function expectChoreographedClose() {
  flushSync();
  expect(managedHooks.status!()).toBe('dismissing');
  for (let i = 0; i < 6; i++) await frame();
  const mid = opacity('[data-managed-content]');
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  expect(await until(() => managedHooks.status!() === 'idle')).toBe(true);
  flushSync(); await frame();
  expect(managedHooks.child!()).toBeNull();
  expect(document.querySelector('[data-managed-content]')).toBeNull();
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
}

it('Escape on a managed modal: the accepted dismissal is choreographed by the default close plan; completion once', async () => {
  setup(); await frame();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await expectChoreographedClose();
  expect(managedHooks.completions).toEqual({ present: 0, dismiss: 1 });
  // Reopen (default open plan), then an outside pointer dismisses the new epoch.
  managedHooks.open!(); flushSync();
  expect(await until(() => managedHooks.status!() === 'presented')).toBe(true);
  expect(managedHooks.completions).toEqual({ present: 1, dismiss: 1 });
  flushSync(); await frame();
  document.querySelector<HTMLElement>('[data-outside]')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
  await until(() => managedHooks.status!() !== 'presented', 10);
  await expectChoreographedClose();
  expect(managedHooks.completions).toEqual({ present: 1, dismiss: 2 });
});
