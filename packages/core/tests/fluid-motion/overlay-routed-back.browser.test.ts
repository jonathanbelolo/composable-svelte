/**
 * Browser Back as the ACTUAL accepted cause: a routed modal (`/modal`) is dismissed by `history.back()` through the
 * application's managed history (popstate → routing request → accepted `navigate`). The committed `dismissing` is
 * claimed by the default close plan (pre-render checkpoint), completes once, and history stays coherent (no echo push).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RoutedModalApp from './overlay-fixtures/RoutedModalApp.svelte';
import { routedDefinition, routedHooks } from './overlay-fixtures/RoutedModalModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };

it('Browser Back dismisses the routed modal: default close plan choreographs the accepted dismissal; completion once; URL and history coherent', async () => {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', '/page'); cleanups.push(() => history.replaceState(oldState, '', oldURL));
  routedHooks.completions = { present: 0, dismiss: 0 };
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(RoutedModalApp, { target, props: { definition: routedDefinition() as never, url: '/page' } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync(); await frame();
  const store = routedHooks.store!;
  store.dispatch({ type: 'navigate', url: '/modal' }); flushSync();
  expect(await until(() => store.state.presentation.status === 'presented')).toBe(true);
  expect(location.pathname).toBe('/modal');
  const length = history.length;
  const push = vi.spyOn(history, 'pushState');
  const back = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
  history.back(); await back;
  expect(await until(() => store.state.presentation.status === 'dismissing', 30)).toBe(true);
  for (let i = 0; i < 6; i++) await frame();
  const mid = Number(getComputedStyle(document.querySelector('[data-routed-content]')!).opacity);
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1); // choreographed (claimed), not a spring or a snap
  expect(await until(() => store.state.presentation.status === 'idle')).toBe(true);
  flushSync(); await frame();
  expect(routedHooks.completions.dismiss).toBe(1);
  expect(location.pathname).toBe('/page');
  expect(history.length).toBe(length);
  expect(push).not.toHaveBeenCalled(); // Back is not echoed as a new entry
  expect(document.querySelector('[data-routed-content]')).toBeNull();
  expect(liveChoreographyLeases()).toBe(0);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
});
