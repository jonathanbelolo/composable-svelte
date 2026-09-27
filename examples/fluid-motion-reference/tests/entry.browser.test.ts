/**
 * Direct-load witness for the real client entry (src/main.ts): the document URL, not a default,
 * decides the initial page and the routed binding's URL.
 */
import '../src/styles.css';
import { afterEach, expect, it } from 'vitest';
import { unmount, tick } from 'svelte';
import { frame } from './support/observe.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0)) await stop(); });

async function load(url: string) {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  target.id = 'app';
  document.body.append(target);
  // Every page ever mounted (including one replaced before the next frame) and every history write.
  const mounted: string[] = [];
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      for (const page of [node, ...node.querySelectorAll('[data-page]')]) if (page.hasAttribute('data-page')) mounted.push(page.getAttribute('data-page')!);
    }
  });
  observer.observe(target, { subtree: true, childList: true });
  const writes: string[] = [];
  // Unbound originals, restored exactly (own-property overrides removed), so runs never stack wrappers.
  const push = History.prototype.pushState, replace = History.prototype.replaceState;
  history.pushState = (data, unused, next) => { writes.push(`push:${String(next)}`); push.call(history, data, unused, next); };
  history.replaceState = (data, unused, next) => { writes.push(`replace:${String(next)}`); replace.call(history, data, unused, next); };
  // Each import is a fresh evaluation of the real entry module.
  const { default: app } = await import(/* @vite-ignore */ `../src/main.ts?load=${encodeURIComponent(url)}`);
  await tick(); await frame(); await frame();
  observer.takeRecords().length; observer.disconnect();
  delete (history as { pushState?: unknown }).pushState;
  delete (history as { replaceState?: unknown }).replaceState;
  cleanups.push(async () => { if (app) await unmount(app); target.remove(); replace.call(history, oldState, '', oldURL); });
  return { target, mounted, writes };
}

it.each([
  ['/dossier', 'detail', '/dossier'],
  ['/study', 'study', '/study'],
  ['/', 'home', '/'],
  ['/nowhere', 'home', '/']
])('direct load of %s renders only the %s page, initialized from the document URL', async (url, page, canonical) => {
  const { target, mounted, writes } = await load(url);
  expect(target.querySelectorAll('[data-page]')).toHaveLength(1);
  expect(target.querySelector('[data-page]')!.getAttribute('data-page')).toBe(page);
  expect(location.pathname).toBe(canonical);
  // Initialized from the document URL: no other page mounted first, no corrective history entry.
  expect(mounted).toEqual([page]);
  expect(writes.filter(write => write.startsWith('push:'))).toEqual([]);
  expect(writes.filter(write => write !== `replace:${canonical}`)).toEqual([]);
});
