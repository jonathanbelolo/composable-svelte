import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { visual, visualLog } from '../src/visual.js';
import type { RepresentationProvider } from '@composable-svelte/core/application/motion';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function start(url: string): HTMLElement {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(App, { target, props: { url } });
  flushSync();
  cleanups.push(async () => { await unmount(component); target.remove(); history.replaceState(oldState, '', oldURL); });
  return target;
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(predicate: () => boolean, label: string, ms = 3000): Promise<void> {
  const end = performance.now() + ms;
  while (!predicate()) { if (performance.now() > end) throw new Error(`timed out: ${label}`); await frame(); }
}
const translateY = (node: HTMLElement) => Number.parseFloat(node.style.translate.split(' ')[1] ?? '0') || 0;

it('catalog → detail: commit at the cue, shared heading, incoming body slides and fades in, route focus', async () => {
  const target = start('/');
  await until(() => !!target.querySelector('li button'), 'catalog rendered');

  target.querySelector<HTMLButtonElement>('li button')!.click();
  // Staged: nothing committed synchronously; the shared card travels on the motion plane first.
  expect(location.pathname).toBe('/');
  expect(target.querySelector('h1')?.textContent).toBe('Catalog');
  await until(() => !!document.querySelector('[data-route-representation="item-pavilion"]'), 'shared representation on the plane');

  await until(() => location.pathname === '/items/pavilion' && !!target.querySelector('article'), 'detail committed');
  // The route (and its outcome) committed at the cue; the shared surface is still travelling.
  expect(document.querySelector('[data-route-representation="item-pavilion"]')).not.toBeNull();
  const body = target.querySelector<HTMLElement>('article')!;
  const samples: number[] = [translateY(body)];
  const opacities: number[] = [Number(getComputedStyle(body).opacity)];
  const settleBy = performance.now() + 2000;
  while (body.style.translate !== '' && performance.now() < settleBy) {
    await frame();
    samples.push(translateY(body));
    opacities.push(Number(getComputedStyle(body).opacity));
  }
  // Slides from +24px toward its layout position, then the translate lease is released.
  expect(Math.max(...samples)).toBeGreaterThan(0);
  expect(Math.max(...samples)).toBeLessThanOrEqual(24);
  expect(samples.some(y => y > 0 && y < 24)).toBe(true);
  expect(body.style.translate).toBe('');
  // Fades in with it.
  expect(Math.min(...opacities)).toBeLessThan(1);
  await until(() => Number(getComputedStyle(body).opacity) === 1, 'body settled opaque');

  // The replacing route received focus on its [data-route-focus] heading.
  expect(document.activeElement?.textContent).toBe('Pavilion of Light');
  expect(target.querySelector('[data-route-focus]')).toBe(document.activeElement);
});

it('back is an ordinary staged request with its own plan', async () => {
  const target = start('/items/pavilion');
  await until(() => !!target.querySelector('article'), 'detail rendered');
  target.querySelector<HTMLButtonElement>('main > button')!.click();
  expect(location.pathname).toBe('/items/pavilion');
  await until(() => location.pathname === '/' && target.querySelector('h1')?.textContent === 'Catalog', 'catalog committed');
  await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
});

it('within-page choreography commits the business action immediately', async () => {
  const target = start('/');
  await until(() => target.querySelectorAll('main li').length === 2, 'catalog rendered');
  target.querySelector<HTMLButtonElement>('main > button')!.click();
  flushSync();
  // The real page changed at once; the plane briefly holds a copy of the resizing list.
  expect(target.querySelectorAll('main li').length).toBe(1);
  expect(document.querySelector('[data-route-representation="catalog-list"]')).not.toBeNull();
  expect(location.pathname).toBe('/');
  await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
});

it('a provider keeps an outgoing canvas drawing after its page retires; diagnostics are public', async () => {
  visualLog.length = 0;
  const target = start('/');
  await until(() => !!target.querySelector('li canvas'), 'catalog rendered');
  target.querySelector<HTMLButtonElement>('li button')!.click();

  // The inline SVG participant and the pulse canvases are represented on the plane.
  await until(() => !!document.querySelector('[data-route-representation="catalog-mark"] svg'), 'SVG participant represented');
  await until(() => !!document.querySelector('[data-route-representation] canvas[data-pulse]'), 'pulse provider representation');

  await until(() => location.pathname === '/items/pavilion' && !!target.querySelector('article'), 'detail committed');
  // The catalog page (and every source canvas) is gone; the retained renderer keeps drawing its own canvas.
  expect(target.querySelector('canvas:not([data-pulse])')).toBeNull();
  const copy = document.querySelector<HTMLCanvasElement>('canvas[data-pulse]')!;
  const widths = new Set<number>();
  for (let i = 0; i < 20 && copy.isConnected; i++) {
    const row = copy.getContext('2d')!.getImageData(0, 0, copy.width, 1).data;
    let filled = 0;
    for (let x = 0; x < copy.width; x++) if (row[x * 4 + 3]! > 0) filled++;
    widths.add(filled);
    await frame();
  }
  expect(widths.size).toBeGreaterThan(1);

  await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  // Released at settle: the provider's dispose() ran.
  expect(visualLog.some(event => event.type === 'representation' && event.provider.includes('pulse'))).toBe(true);
  expect(visualLog.some(event => event.type === 'preparation' && event.outcome === 'ready')).toBe(true);
  expect(visualLog.some(event => event.type === 'settled')).toBe(true);
});

it('within-page removal through <Presence> retires the leaving item while its source is still connected', async () => {
  // Test-only probe around the configured provider: record whether the source is connected when retire() runs.
  const provider = visual.providers[0] as RepresentationProvider;
  const represent = provider.represent;
  const connectedAtRetire: boolean[] = [];
  provider.represent = (source, context) => {
    const result = represent.call(provider, source, context);
    if (!result || 'declined' in result || !result.retire) return result;
    const retire = result.retire;
    return { ...result, retire: () => { connectedAtRetire.push(source.isConnected); return retire(); } };
  };
  cleanups.push(async () => { provider.represent = represent; });

  const target = start('/');
  await until(() => target.querySelectorAll('main li').length === 2, 'catalog rendered');
  target.querySelector<HTMLButtonElement>('main > button')!.click();
  flushSync();
  // Committed at once: the harbour item left, and its copy fades out on the plane.
  expect(target.querySelectorAll('main li:not([data-route-representation] li)').length).toBe(1);
  expect(document.querySelector('[data-route-representation="item-harbour"]')).not.toBeNull();
  expect(connectedAtRetire).toContain(true);
  expect(connectedAtRetire).not.toContain(false);
  await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
});

it('a settling decline leaves the whole participant unrepresented', async () => {
  // Test-only probe: the configured provider settles for the Harbour canvas (the documented example is not instrumented).
  visualLog.length = 0;
  const provider = visual.providers[0] as RepresentationProvider;
  const represent = provider.represent;
  cleanups.push(async () => { provider.represent = represent; });
  provider.represent = (source, context) =>
    source instanceof HTMLCanvasElement && source.closest('li')?.textContent?.includes('Harbour')
      ? { declined: 'probe', settle: true }
      : represent.call(provider, source, context);
  const target = start('/');
  await until(() => target.querySelectorAll('li canvas').length === 2, 'catalog rendered');
  target.querySelector<HTMLButtonElement>('li button')!.click(); // Pavilion: catalog-list is an outgoing participant.
  await until(() => !!document.querySelector('[data-route-representation="item-pavilion"]'), 'run prepared');
  // No copy, no placeholder: the real list is untouched until the commit; the other participants still move.
  expect(document.querySelector('[data-route-representation="catalog-list"]')).toBeNull();
  expect(getComputedStyle(target.querySelector('ul.catalog')!).opacity).toBe('1');
  expect(visualLog).toContainEqual({ type: 'representation', participant: 'catalog-list', provider: 'settled', continuity: 'unrepresented', reason: 'settled:pulse:probe' });
  await until(() => location.pathname === '/items/pavilion', 'committed');
  await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
});
