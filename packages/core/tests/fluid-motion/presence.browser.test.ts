/** S2/S3 core seams through the public assembly (core-media-seam-interface.md). */
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PresenceApp from './presence-fixtures/PresenceApp.svelte';
import Outside from './presence-fixtures/Outside.svelte';
import NestedApp from './presence-fixtures/NestedApp.svelte';
import { hooks, presenceDefinition } from './presence-fixtures/PresenceModel.js';
import { defineChoreography, type RepresentationProvider } from '../../src/lib/application/motion-public.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
function setup(app: typeof PresenceApp = PresenceApp, settle = false) {
  const log = { represented: 0, retiredConnected: [] as boolean[], disposed: 0, rendererDisposed: 0 };
  const probe: RepresentationProvider = {
    name: 'probe',
    represent(source) {
      if (!(source as Element).matches?.('canvas[data-live]')) return undefined;
      if (settle) return { declined: 'mediaMoveUnavailable', settle: true };
      log.represented++;
      return { node: document.createElement('div'), continuity: 'retained', retire: () => { log.retiredConnected.push(source.isConnected); return { dispose: () => { log.rendererDisposed++; } }; }, dispose: () => { log.disposed++; } };
    }
  };
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(app, { target, props: { definition: presenceDefinition([probe]) as never } });
  let unmounted = false;
  const destroy = () => { if (unmounted) return; unmounted = true; unmount(component); target.remove(); };
  cleanups.push(destroy);
  flushSync();
  return { log, probe, target, destroy };
}
const outgoing = () => defineChoreography({ cueMs: 0, durationMs: 600, tracks: [{ participant: 'embed', side: 'outgoing', startMs: 300, durationMs: 200, opacity: { from: 1, to: 0 } }] });

it('S3: the configured provider is found inside the Host; outside a Host the lookup is undefined', () => {
  const { probe } = setup();
  expect(hooks.lookup).toBe(probe);
  const outside = document.createElement('div'); document.body.append(outside);
  const component = mount(Outside, { target: outside }); flushSync();
  cleanups.push(() => { unmount(component); outside.remove(); });
  expect(hooks.lookupOutside).toBeNull();
});
it('S2: an established removal hands off while the source is still connected; the representation continues', async () => {
  const { log, target } = setup();
  await frame();
  const source = target.querySelector('canvas[data-live]')!;
  hooks.transition!(outgoing(), { type: 'hide' });
  flushSync();
  expect(log.retiredConnected).toEqual([true]); // retired before Svelte removed it
  expect(source.isConnected).toBe(false); // then the block was destroyed
  expect(document.querySelector('[data-route-representation="embed"]')).not.toBeNull();
});
it('S2: a no-op commit and a throwing commit never retire or revoke anything; a retained participant is untouched', async () => {
  const { log, target } = setup();
  await frame();
  const source = target.querySelector('canvas[data-live]')!;
  hooks.transition!(outgoing(), { type: 'noop' }); flushSync();
  expect(log.retiredConnected).toEqual([]);
  expect(source.isConnected).toBe(true);
  expect(() => { hooks.transition!(outgoing(), { type: 'boom' }); flushSync(); }).toThrow('commit failed');
  expect(log.retiredConnected).toEqual([]);
  expect(source.isConnected).toBe(true);
  expect(target.querySelector('[data-kept]')!.isConnected).toBe(true);
});
it('S2: Host destruction mid-run disposes the transferred renderer exactly once', async () => {
  const { log, destroy } = setup();
  await frame();
  hooks.transition!(outgoing(), { type: 'hide' }); flushSync();
  expect(log.retiredConnected).toEqual([true]);
  destroy(); flushSync();
  expect(log.rendererDisposed).toBe(1);
  expect(log.disposed).toBe(0);
});
it('S2: supersession of the handing-off run releases the transferred renderer exactly once; no second retirement', async () => {
  const { log } = setup();
  await frame();
  hooks.transition!(outgoing(), { type: 'hide' }); flushSync();
  expect(log.retiredConnected).toEqual([true]);
  // A later within-page transition in the same scope supersedes the running one.
  hooks.transition!(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'kept', side: 'shared', startMs: 0, durationMs: 200 }] }), { type: 'noop' }); flushSync();
  await frame();
  expect(log.retiredConnected).toEqual([true]);
  expect(log.rendererDisposed).toBe(1);
  expect(log.disposed).toBe(0);
});
it('S2: an ancestor boundary removal establishes retirement for members of nested boundaries (handed off while connected, once)', async () => {
  const { log, target } = setup(NestedApp as typeof PresenceApp);
  await frame();
  const source = target.querySelector('canvas[data-live]')!;
  hooks.transition!(outgoing(), { type: 'hide' }); flushSync();
  expect(log.retiredConnected).toEqual([true]);
  expect(source.isConnected).toBe(false);
});
it('S2: nested boundaries keep no-op and throwing commits free of retirement', async () => {
  const { log, target } = setup(NestedApp as typeof PresenceApp);
  await frame();
  hooks.transition!(outgoing(), { type: 'noop' }); flushSync();
  expect(() => { hooks.transition!(outgoing(), { type: 'boom' }); flushSync(); }).toThrow('commit failed');
  expect(log.retiredConnected).toEqual([]);
  expect(target.querySelector('canvas[data-live]')!.isConnected).toBe(true);
});
it('S4: within-page Presence removal with an unavailable live transfer settles (no blank box, nothing retired or disposed); no-op/throw untouched', async () => {
  const { log, target } = setup(PresenceApp, true);
  await frame();
  const source = target.querySelector('canvas[data-live]')!;
  hooks.transition!(outgoing(), { type: 'noop' }); flushSync();
  expect(() => { hooks.transition!(outgoing(), { type: 'boom' }); flushSync(); }).toThrow('commit failed');
  expect(source.isConnected).toBe(true);
  hooks.transition!(outgoing(), { type: 'hide' }); flushSync();
  expect(document.querySelector('[data-route-representation="embed"]')).toBeNull();
  expect(source.isConnected).toBe(false);
  expect(log).toMatchObject({ represented: 0, retiredConnected: [], disposed: 0, rendererDisposed: 0 });
});
