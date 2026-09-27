/**
 * Staged-route SSR/hydration witness: the managed route outlet and Host boundary structure is
 * identical on server and client (no hydration mismatch), server nodes are adopted, no business turn
 * or initialization is replayed beyond the single browser activation, and the owned route boundary
 * works after hydration. Fixture generated from RenderApp via Vite SSR (see render-report.md).
 */
import { afterEach, expect, it } from 'vitest';
import { hydrate, unmount, tick, flushSync } from 'svelte';
import RenderApp from './render-fixtures/RenderApp.svelte';
import serverHTML from './render-fixtures/render-ssr.html?raw';
import { failures, pageSlot, viewEvents, type Root, type RootAction, type Page, type PageAction } from './render-fixtures/RenderModel.js';
import { bindManagedProjection } from '../../src/lib/execution/store-access.js';
import type { ApplicationInstance, ChildView } from '../../src/lib/application/index.js';

afterEach(() => { failures.conditional = false; viewEvents.length = 0; });

it('staged route markup hydrates without mismatch, adopts server nodes and replays nothing', async () => {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', '/fragile');
  const target = document.createElement('div');
  target.innerHTML = serverHTML;
  document.body.append(target);
  const serverPage = target.querySelector('[data-page="/fragile"]');
  const serverPanel = target.querySelector('[data-panel]');
  expect(serverPage).not.toBeNull();
  const trace: string[] = [], events: string[] = [];
  let app!: ApplicationInstance<Root, RootAction>;
  const component = hydrate(RenderApp, { target, props: { url: '/fragile', dependencies: { trace, events }, onApp: value => { app = value; } } });
  try {
    flushSync(); await tick(); await new Promise(resolve => setTimeout(resolve, 0));
    // The console guard fails this test on any hydration_mismatch warning.
    expect(target.querySelector('[data-page="/fragile"]')).toBe(serverPage);
    expect(target.querySelector('[data-panel]')).toBe(serverPanel);
    expect(trace).toEqual([]);
    expect(events).toEqual(['init:/fragile']);
    // The owned route boundary exists after hydration.
    failures.conditional = true;
    (bindManagedProjection(app.store, pageSlot) as ChildView<Page, PageAction>).dispatch({ type: 'arm' });
    flushSync(); await tick(); await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
    expect(target.querySelector('[data-summary]')?.textContent).toBe('conditional mount failure');
    expect(target.querySelector('[data-shell]')).not.toBeNull();
  } finally {
    await unmount(component);
    target.remove();
    history.replaceState(oldState, '', oldURL);
  }
});
