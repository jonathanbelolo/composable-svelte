import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { visual, visualLog } from '../src/visual.js';
import type { RepresentationProvider } from '@composable-svelte/core/application/motion';
import { modalProbe } from './modal-probe.js';

// Observes the completion callbacks the real Modal delivers: the public Modal is replaced by a probe that renders it
// with every prop forwarded and records each delivery. Presentation status alone cannot prove that a cancelled
// completion was never delivered, because the reducer ignores a stale notesPresented after the status changes.
vi.mock('@composable-svelte/core/navigation-components', async importOriginal => {
  const actual = await importOriginal<typeof import('@composable-svelte/core/navigation-components')>();
  const { modalProbe: probe } = await import('./modal-probe.js');
  probe.Modal = actual.Modal as never;
  const { default: ModalProbe } = await import('./ModalProbe.svelte');
  return { ...actual, Modal: ModalProbe };
});

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

describe('overlay orchestration: the notes dialog (public package)', () => {
  const status = (target: HTMLElement) => target.querySelector('main')?.getAttribute('data-notes');
  const heading = () => document.querySelector('[data-route-representation="notes-heading"]');
  const deliveries = () => modalProbe.deliveries;
  beforeEach(() => { modalProbe.deliveries.length = 0; });
  // Lets any late (stale) delivery arrive before the delivery log is asserted.
  async function quiet() { for (let i = 0; i < 30; i++) await frame(); }
  async function opened(target: HTMLElement) {
    target.querySelector<HTMLButtonElement>('[data-open-notes]')!.click();
    await until(() => status(target) === 'presented', 'notes presented');
  }

  it('default plans: the page heading flies into the dialog and back; completion needs no timer', async () => {
    const target = start('/items/pavilion');
    await until(() => !!target.querySelector('[data-open-notes]'), 'detail rendered');
    target.querySelector<HTMLButtonElement>('[data-open-notes]')!.click();
    await until(() => !!heading(), 'shared heading on the plane');
    await until(() => status(target) === 'presented', 'open completed through onPresentationComplete');
    document.querySelector<HTMLButtonElement>('[data-close-notes]')!.click();
    await until(() => !!heading(), 'shared heading flies back');
    await until(() => status(target) === 'idle', 'close completed through onDismissalComplete');
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
    expect(document.querySelector('[data-close-notes]')).toBeNull();
    await quiet();
    // Exactly one delivery of each completion, in order.
    expect(deliveries()).toEqual(['presentationComplete', 'dismissalComplete']);
  });

  it('a refused close (pinned) starts no motion and keeps the dialog', async () => {
    const target = start('/items/pavilion');
    await until(() => !!target.querySelector('[data-open-notes]'), 'detail rendered');
    await opened(target);
    await until(() => document.querySelector('[data-route-representation]') === null, 'open settled');
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-close-notes]')!.click();
    for (let i = 0; i < 20; i++) {
      await frame();
      expect(document.querySelector('[data-route-representation]')).toBeNull();
    }
    expect(status(target)).toBe('presented');
    // The refused close delivers no dismissal completion.
    expect(deliveries()).toEqual(['presentationComplete']);
  });

  it('the explicit entry replaces the default close for that transition only', async () => {
    const target = start('/items/pavilion');
    await until(() => !!target.querySelector('[data-open-notes]'), 'detail rendered');
    await opened(target);
    await until(() => document.querySelector('[data-route-representation]') === null, 'open settled');
    document.querySelector<HTMLButtonElement>('[data-close-quickly]')!.click();
    let flew = false;
    await until(() => { flew ||= !!heading(); return status(target) === 'idle'; }, 'quick close completed');
    // notesQuickClose has no shared heading track, unlike the default close.
    expect(flew).toBe(false);
    await quiet();
    expect(deliveries()).toEqual(['presentationComplete', 'dismissalComplete']);
  });

  it('a close during the opening reverses it; the cancelled open never completes', async () => {
    const target = start('/items/pavilion');
    await until(() => !!target.querySelector('[data-open-notes]'), 'detail rendered');
    target.querySelector<HTMLButtonElement>('[data-open-notes]')!.click();
    await until(() => status(target) === 'presenting', 'opening');
    await frame(); await frame();
    document.querySelector<HTMLButtonElement>('[data-close-notes]')!.click();
    const seen = new Set<string>();
    await until(() => { seen.add(status(target) ?? ''); return status(target) === 'idle'; }, 'reversed to idle');
    expect(seen.has('presented')).toBe(false);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
    await quiet();
    // The Modal itself never delivered the cancelled open's completion (the status alone cannot show this: the
    // reducer ignores a late notesPresented once the status is no longer 'presenting'); the close completed once.
    expect(deliveries()).toEqual(['dismissalComplete']);
  });

  it("lifetime: 'overlay' holds the page's resting state while the dialog is open; a refused close keeps it", async () => {
    const target = start('/items/pavilion');
    await until(() => !!target.querySelector('[data-open-notes]'), 'detail rendered');
    const body = target.querySelector<HTMLElement>('article')!;
    const paint = () => ({ opacity: Number(getComputedStyle(body).opacity), scale: getComputedStyle(body).scale });
    const resting = () => Math.abs(paint().opacity - 0.6) < 0.01 && paint().scale.startsWith('0.98');
    await opened(target);
    // Open completed once, without waiting for the hold; the hold outlives the open run and its duration.
    await until(() => document.querySelector('[data-route-representation]') === null, 'open settled');
    expect(deliveries()).toEqual(['presentationComplete']);
    await quiet();
    expect(paint()).toEqual({ opacity: 0.6, scale: '0.98' });
    // A refused close keeps the resting state.
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-close-notes]')!.click();
    await quiet();
    expect(status(target)).toBe('presented');
    expect(resting()).toBe(true);
    // The accepted close starts from the displayed resting values and returns the page to stable.
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-close-notes]')!.click();
    const opacities: number[] = [];
    await until(() => { opacities.push(paint().opacity); return status(target) === 'idle'; }, 'close completed');
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
    await quiet();
    expect(Math.min(...opacities)).toBeGreaterThanOrEqual(0.59);
    expect(opacities.some(value => value > 0.6 && value < 1)).toBe(true);
    expect(paint().opacity).toBe(1);
    expect(['none', '1']).toContain(paint().scale);
    expect(body.style.opacity).toBe('');
    expect(body.style.scale).toBe('');
    expect(deliveries()).toEqual(['presentationComplete', 'dismissalComplete']);
  });
});
