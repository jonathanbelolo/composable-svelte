/**
 * Overlay instance scope through the public assembly (implementation-interface §1, amended 20:58Z): a page-
 * initialised useParticipant() action used inside a Modal children snippet binds to the MODAL INSTANCE scope
 * (resolved at attach by DOM containment), so the same key in page and modal never collides; each open is a new
 * instance (epoch).
 */
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OverlayApp from './overlay-fixtures/OverlayApp.svelte';
import { overlayDefinition, overlayHooks } from './overlay-fixtures/OverlayModel.js';
import { overlayHandleState } from '../../src/lib/application/renderer/choreography/overlay-motion.js';
import type { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

it('a page-initialised participant used inside a Modal snippet registers in the modal instance scope; reopening is a new epoch', async () => {
  const target = document.createElement('div'); document.body.append(target);
  const definition = overlayDefinition();
  const component = mount(OverlayApp, { target, props: { definition: definition as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync(); await frame();
  const host = overlayHooks.host as RouteHost;
  const state = overlayHandleState(overlayHooks.handle)!;
  expect(host).toBeDefined();
  const first = state.current!;
  expect(first).toBeDefined();
  const inPage = host.find('hero', overlayHooks.pageOwner as object);
  const inModal = host.find('hero', first.owner);
  expect(inPage.map(entry => entry.node.hasAttribute('data-page-hero'))).toEqual([true]);
  expect(inModal.map(entry => entry.node.hasAttribute('data-modal-hero'))).toEqual([true]);
  // Close and reopen through the real store: a new instance (epoch); the old scope no longer matches anything.
  overlayHooks.dispatch!({ type: 'close' }); flushSync();
  for (let i = 0; i < 120 && overlayHooks.state!().presentation.status !== 'idle'; i++) await frame();
  flushSync(); await frame();
  expect(overlayHooks.state!().presentation.status).toBe('idle');
  expect(state.current).toBeUndefined();
  expect(host.find('hero', first.owner)).toEqual([]);
  overlayHooks.dispatch!({ type: 'open' }); flushSync(); await frame(); await Promise.resolve();
  for (let i = 0; i < 120 && overlayHooks.state!().presentation.status !== 'presented'; i++) await frame();
  const second = state.current!;
  expect(second).toBeDefined();
  expect(second.owner).not.toBe(first.owner);
  expect(host.find('hero', first.owner)).toEqual([]);
  expect(host.find('hero', second.owner).map(entry => entry.node.hasAttribute('data-modal-hero'))).toEqual([true]);
  expect(host.find('hero', overlayHooks.pageOwner as object).map(entry => entry.node.hasAttribute('data-page-hero'))).toEqual([true]);
});
