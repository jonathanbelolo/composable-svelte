/**
 * WP7 binding-owned scroll restoration: real-browser witnesses (Chromium, Firefox, WebKit via
 * vitest.fluid-motion.config.ts). Real history traversal, real fragment navigation, real iframe reload and its real
 * pagehide. Back/forward-cache admission is NOT witnessed here: test documents are iframes, which browsers never
 * admit to bfcache (see scroll-report.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import ScrollApp from './scroll-fixtures/ScrollApp.svelte';
import { scrollDefinition, type ScrollAction, type ScrollState } from './scroll-fixtures/ScrollModel.js';
import type { ApplicationInstance } from '../../src/lib/application/index.js';
import { getApplicationInternal, type ApplicationOwner } from '../../src/lib/application/instance.svelte.js';
import { createScrollOwnership, readPersistedScroll } from '../../src/lib/routing/scroll-restoration.js';
import { defaultHistoryMetadataCodec, type HistoryPort } from '../../src/lib/routing/managed-history.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
  vi.restoreAllMocks();
});

const frames = (win: Window = window, count = 2) =>
  new Promise<void>(resolve => { const step = (n: number) => n === 0 ? resolve() : win.requestAnimationFrame(() => step(n - 1)); step(count); });
const settle = async () => { await tick(); await frames(); await tick(); };
function locationAt(url: string) {
  const oldURL = location.href, oldState = history.state, oldMode = history.scrollRestoration;
  history.replaceState(null, '', url);
  history.scrollRestoration = 'auto';
  window.scrollTo(0, 0);
  cleanups.push(() => { history.replaceState(oldState, '', oldURL); history.scrollRestoration = oldMode; window.scrollTo(0, 0); });
}
function setup(url: string, definition = scrollDefinition(), anchor = true) {
  const target = document.createElement('div');
  document.body.append(target);
  let app!: ApplicationInstance<ScrollState, ScrollAction>;
  const component = mount(ScrollApp, { target, props: { url, definition, anchor, onApp: (value: ApplicationInstance<ScrollState, ScrollAction>) => { app = value; } } }) as { hide(): void; show(): void };
  let destroyed = false;
  const destroy = async () => { if (destroyed) return; destroyed = true; await unmount(component); target.remove(); };
  cleanups.push(destroy);
  return { get app() { return app; }, component, target, destroy, panel: () => target.querySelector<HTMLElement>('[data-composable-scroll="panel"]')! };
}
const traverse = async (direction: 'back' | 'forward') => {
  const arrived = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
  if (direction === 'back') history.back(); else history.forward();
  await arrived;
  await settle();
};
const expectNear = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
const persistedScroll = () => (history.state as { __composableRoute?: { scroll?: unknown } } | null)?.__composableRoute?.scroll;
const sectionTop = (root: ParentNode = document) => root.querySelector('#sec')!.getBoundingClientRect().top;

describe('binding-owned scroll restoration (real browser)', () => {
  it('push applies top; Back/Forward restore document and keyed container positions from entry identity', async () => {
    locationAt('/s');
    const f = setup('/s');
    await settle();
    window.scrollTo(0, 700);
    f.panel().scrollTop = 250;
    await frames();

    f.app.store.dispatch({ type: 'navigate', url: '/one' });
    await settle();
    expect(location.pathname).toBe('/one');
    expectNear(window.scrollY, 0);
    expectNear(f.panel().scrollTop, 0);
    window.scrollTo(0, 400);
    await frames();

    await traverse('back');
    expect(location.pathname).toBe('/s');
    expectNear(window.scrollY, 700);
    expectNear(f.panel().scrollTop, 250);
    // Persisted onto the departing entry immediately before the push, inside the existing record.
    const record = persistedScroll() as { v: number; x: number; y: number; c: { panel: [number, number] } };
    expect(record).toMatchObject({ v: 1, x: 0 });
    expectNear(record.y, 700);
    expectNear(record.c.panel[1], 250);

    await traverse('forward');
    expect(location.pathname).toBe('/one');
    expectNear(window.scrollY, 400);
  });

  it('semantic top overrides a retained native hash; explicit fragment policy resolves once after render; missing target preserves', async () => {
    locationAt('/s#sec');
    const f = setup('/s#sec');
    await settle();
    window.scrollTo(0, 300);
    await frames();

    f.app.store.dispatch({ type: 'navigate', url: '/one' });
    await settle();
    expect(location.pathname + location.hash).toBe('/one#sec');
    expectNear(window.scrollY, 0);

    f.app.store.dispatch({ type: 'navigate', url: '/frag' });
    await settle();
    expect(location.pathname + location.hash).toBe('/frag#sec');
    expect(Math.abs(sectionTop(f.target))).toBeLessThan(2);
    const resolved = window.scrollY;
    // Resolved once: later geometry invalidation or user scroll does not re-run it.
    window.scrollTo(0, 100);
    await settle();
    expectNear(window.scrollY, 100);
    expect(resolved).toBeGreaterThan(0);
    await f.destroy();

    const missing = setup('/m#sec', scrollDefinition(), false);
    await settle();
    window.scrollTo(0, 300);
    await frames();
    missing.app.store.dispatch({ type: 'navigate', url: '/frag-missing' });
    await settle();
    expect(location.pathname + location.hash).toBe('/frag-missing#sec');
    expectNear(window.scrollY, 300);
  });

  it('physical native anchor keeps browser anchor behavior; same-route Back restores without a domain action', async () => {
    locationAt('/s');
    const f = setup('/s');
    await settle();
    window.scrollTo(0, 600);
    await frames();
    const visits = f.app.store.state.visits;

    const changed = new Promise<void>(resolve => window.addEventListener('hashchange', () => resolve(), { once: true }));
    location.hash = 'sec';
    await changed;
    await settle();
    expect(Math.abs(sectionTop(f.target))).toBeLessThan(2);
    expect(window.scrollY).toBeGreaterThan(0);
    expect(f.app.store.state.visits).toBe(visits);

    await traverse('back');
    expect(location.hash).toBe('');
    expectNear(window.scrollY, 600);
    expect(f.app.store.state.visits).toBe(visits);
  });

  it('attach sets manual; detach flushes and restores the recorded mode on the current entry only; reattach does not restore', async () => {
    locationAt('/s');
    // Keeps the document scrollable while the Host content is detached.
    const spacer = document.createElement('div');
    spacer.style.height = '6000px';
    document.body.append(spacer);
    cleanups.push(() => spacer.remove());
    const f = setup('/s');
    await settle();
    expect(history.scrollRestoration).toBe('manual');
    f.app.store.dispatch({ type: 'navigate', url: '/one' });
    await settle();
    expect(history.scrollRestoration).toBe('manual');
    await traverse('back');
    window.scrollTo(0, 500);
    await frames();

    f.component.hide();
    await settle();
    expect(history.scrollRestoration).toBe('auto');
    expect(persistedScroll()).toMatchObject({ v: 1 });
    expectNear((persistedScroll() as { y: number }).y, 500);

    window.scrollTo(0, 321);
    await frames();
    const arrived = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    history.forward();
    await arrived;
    await frames(window, 3);
    expect(location.pathname).toBe('/one');
    // Visited while attached: keeps manual; neither browser nor framework restores while detached.
    expect(history.scrollRestoration).toBe('manual');
    expectNear(window.scrollY, 321);

    f.component.show();
    await settle();
    expect(f.app.store.state.url).toBe('/one');
    expectNear(window.scrollY, 321);
  });

  it('exposes one checkpoint seam: applied once, user scroll reported, no re-run on later checkpoints', async () => {
    locationAt('/s');
    const f = setup('/s');
    await settle();
    const seam = getApplicationInternal(f.app as ApplicationOwner).scroll!;
    const events: string[] = [];
    cleanups.push(seam.subscribe(event => events.push(event.type)));
    window.scrollTo(0, 800);
    await frames();
    f.app.store.dispatch({ type: 'navigate', url: '/one' });
    seam.checkpoint();
    expectNear(window.scrollY, 0);
    seam.checkpoint();
    await settle();
    expect(events.filter(type => type === 'applied')).toHaveLength(1);
    window.scrollTo(0, 50);
    await frames();
    expect(events).toContain('user');
    seam.checkpoint();
    expectNear(window.scrollY, 50);
  });

  it('S1: semantic entry-restore without a saved position preserves instead of following a retained hash', async () => {
    locationAt('/review#sec');
    const f = setup('/review#sec', scrollDefinition({ policy: () => 'entry-restore' }));
    await settle();
    window.scrollTo(0, 300);
    await frames();
    f.app.store.dispatch({ type: 'navigate', url: '/destination' });
    await settle();
    expect(location.pathname + location.hash).toBe('/destination#sec');
    expectNear(window.scrollY, 300);
  });

  it('S2: native fragment movement never runs the semantic policy; Back still restores by entry identity', async () => {
    locationAt('/review');
    const f = setup('/review', scrollDefinition({ policy: () => 'top' }));
    await settle();
    window.scrollTo(0, 300);
    await frames();
    const changed = new Promise<void>(resolve => window.addEventListener('hashchange', () => resolve(), { once: true }));
    location.hash = 'sec';
    await changed;
    await settle();
    expect(f.app.store.state.visits).toBe(0);
    expect(Math.abs(sectionTop(f.target))).toBeLessThan(2);
    expect(window.scrollY).toBeGreaterThan(300);
    await traverse('back');
    expect(location.hash).toBe('');
    expectNear(window.scrollY, 300);
    expect(f.app.store.state.visits).toBe(0);
  });

  it('S4: a no-op application does not swallow the next container-only user scroll', async () => {
    locationAt('/s');
    const f = setup('/s', scrollDefinition({ policy: () => 'top' }));
    await settle();
    const seam = getApplicationInternal(f.app as ApplicationOwner).scroll!;
    const events: string[] = [];
    cleanups.push(seam.subscribe(event => events.push(event.type)));
    f.app.store.dispatch({ type: 'navigate', url: '/destination' });
    await settle();
    expect(events).toEqual(['applied']);
    f.panel().scrollTop = 100;
    await vi.waitFor(() => expect(events).toContain('user'));
    expectNear(f.panel().scrollTop, 100);
  });

  it('S3: an accepted replace keeps the entry\'s persisted record, and a real reload restores it', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:400px;height:300px;border:0';
    document.body.append(frame);
    cleanups.push(() => frame.remove());
    type FixtureWindow = Window & { __scrollFixture?: { attachedAt?: number; app?: { store: { dispatch(action: ScrollAction): void } } } };
    const load = (src?: string) => new Promise<FixtureWindow>(resolve => {
      frame.addEventListener('load', () => resolve(frame.contentWindow as FixtureWindow), { once: true });
      if (src) frame.src = src;
    });
    const ready = async (win: FixtureWindow) => {
      await vi.waitFor(() => expect(win.__scrollFixture?.attachedAt).toBeDefined());
      await frames(win, 3);
    };
    const recordY = (win: FixtureWindow) => (win.history.state as { __composableRoute?: { scroll?: { y?: number } } } | null)?.__composableRoute?.scroll?.y;
    const base = '/tests/fluid-motion/scroll-fixtures/reload.html';
    let win = await load(`${base}?p=a`);
    await ready(win);
    win.scrollTo(0, 600);
    await frames(win);
    const first = win;
    await vi.waitFor(() => expect(Math.abs((recordY(first) ?? -1) - 600)).toBeLessThanOrEqual(1), { timeout: 3000 });

    win.__scrollFixture!.app!.store.dispatch({ type: 'navigate', url: `${base}?p=replace` });
    await frames(win, 3);
    expect(win.location.search).toBe('?p=replace');
    expect(Math.abs((recordY(win) ?? -1) - 600)).toBeLessThanOrEqual(1);

    const reloaded = load();
    win.location.reload();
    win = await reloaded;
    await ready(win);
    expectNear(win.scrollY, 600);
  });

  it('records the browser capabilities this backend depends on (measurement, not a gate)', () => {
    const capabilities = {
      navigationAPI: typeof (window as { navigation?: { entries?: unknown } }).navigation?.entries === 'function',
      scrollRestoration: 'scrollRestoration' in history,
      instantBehavior: CSS.supports('scroll-behavior', 'auto'),
      userAgent: navigator.userAgent
    };
    console.info('[scroll capabilities]', JSON.stringify(capabilities));
    expect(capabilities.scrollRestoration).toBe(true);
  });

  it('ignores malformed persisted records instead of failing routing', () => {
    expect(readPersistedScroll({ v: 1, x: 0, y: 10 })).toMatchObject({ x: 0, y: 10 });
    for (const bad of [null, 1, { v: 2, x: 0, y: 1 }, { v: 1, x: Number.NaN, y: 1 }, { v: 1, x: 0, y: 1, c: { a: [1] } },
      { v: 1, x: 0, y: 1, c: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, [0, 0]])) }])
      expect(readPersistedScroll(bad, ['a'])).toBeUndefined();
    // Undeclared container keys are dropped, declared ones kept.
    expect(readPersistedScroll({ v: 1, x: 0, y: 1, c: { a: [0, 5], other: [0, 9] } }, ['a'])?.c.get('a')).toEqual([0, 5]);
  });

  it('a failed persistence write is a scroll diagnostic only and never throws into the binding', () => {
    locationAt('/s');
    const errors: unknown[] = [];
    const state = { __composableRoute: { version: 1, chain: 'c', id: 'i', index: 0 } };
    const port: HistoryPort = {
      read: () => ({ url: '/s', state }),
      replace: () => { throw new DOMException('throttled', 'SecurityError'); },
      push: () => {}, go: () => {}, listen: () => () => {}
    };
    const ownership = createScrollOwnership({ window, port, codec: defaultHistoryMetadataCodec, report: error => errors.push(error) });
    ownership.attached();
    expect(() => ownership.beforePush()).not.toThrow();
    expect(errors).toHaveLength(1);
    ownership.detached();
    expect(history.scrollRestoration).toBe('auto');
  });

  it('without a scroll declaration the browser mode is untouched', async () => {
    locationAt('/s');
    const f = setup('/s', scrollDefinition({ scroll: false }));
    await settle();
    expect(history.scrollRestoration).toBe('auto');
    expect(getApplicationInternal(f.app as ApplicationOwner).scroll).toBeUndefined();
  });

  it('real reload: idle persistence survives, the new document restores once after actual pagehide; a fresh document keeps its native position', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:400px;height:300px;border:0';
    document.body.append(frame);
    cleanups.push(() => frame.remove());
    type FixtureWindow = Window & { __scrollFixture?: { attachedAt?: number } };
    const load = (src?: string) => new Promise<FixtureWindow>(resolve => {
      frame.addEventListener('load', () => resolve(frame.contentWindow as FixtureWindow), { once: true });
      if (src) frame.src = src;
    });
    const ready = async (win: FixtureWindow) => {
      await vi.waitFor(() => expect(win.__scrollFixture?.attachedAt).toBeDefined());
      await frames(win, 3);
    };
    const base = '/tests/fluid-motion/scroll-fixtures/reload.html';

    let win = await load(`${base}?p=a`);
    await ready(win);
    expect(win.history.scrollRestoration).toBe('manual');
    win.scrollTo(0, 900);
    await frames(win);
    // The low-frequency idle persist writes the record onto the current entry (Chromium and Firefox drop history
    // writes made inside a reload's pagehide; WebKit keeps them — see scroll-pagehide-probe.log).
    const current = win;
    await vi.waitFor(() => {
      const scroll = (current.history.state as { __composableRoute?: { scroll?: { y?: number } } }).__composableRoute?.scroll;
      expect(Math.abs((scroll?.y ?? -1) - 900)).toBeLessThanOrEqual(1);
    }, { timeout: 3000 });
    let pagehide = false;
    win.addEventListener('pagehide', () => { pagehide = true; });

    const reloaded = load();
    win.location.reload();
    win = await reloaded;
    await ready(win);
    expect(pagehide).toBe(true);
    expectNear(win.scrollY, 900);
    expect((win.history.state as { __composableRoute: { scroll: unknown } }).__composableRoute.scroll).toMatchObject({ v: 1 });

    win = await load(`${base}?p=fresh#sec`);
    await ready(win);
    // No persisted record: the native initial fragment position stands.
    expect(Math.abs(win.document.getElementById('sec')!.getBoundingClientRect().top)).toBeLessThan(2);
  });
});
