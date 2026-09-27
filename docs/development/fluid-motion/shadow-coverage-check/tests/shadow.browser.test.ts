import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { page } from 'vitest/browser';
import type { FluidMotionOptions, VisualDiagnostic } from '@composable-svelte/core/application/motion';
import App from '../src/App.svelte';
import { closedBadgeProvider, constructions, defineElements, providerStats, serializableShadowProvider, shadowSerializationComplete } from '../src/elements.js';
import { current, makeApplication } from '../src/model.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
beforeAll(() => defineElements());

const engine = navigator.userAgent.includes('Firefox') ? 'firefox' : /Chrome\//.test(navigator.userAgent) ? 'chromium' : 'webkit';
const log = (line: string) => console.info(`[shadow:${engine}] ${line}`);

function start(options: FluidMotionOptions): { target: HTMLElement; diagnostics: VisualDiagnostic[] } {
  const diagnostics: VisualDiagnostic[] = [];
  const application = makeApplication({ ...options, onDiagnostic: event => diagnostics.push(event) });
  current.application = application;
  const oldURL = location.href;
  history.replaceState(null, '', '/');
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(App, { target, props: { url: '/', application } });
  flushSync();
  cleanups.push(async () => { await unmount(component); target.remove(); history.replaceState(null, '', oldURL); });
  return { target, diagnostics };
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(predicate: () => boolean, label: string, ms = 4000): Promise<void> {
  const end = performance.now() + ms;
  while (!predicate()) { if (performance.now() > end) throw new Error(`timed out: ${label}`); await frame(); }
}
/** Viewport screenshot cropped to a rect (CSS px). */
async function crop(rect: DOMRect): Promise<Uint8ClampedArray> {
  const shot = await page.screenshot({ base64: true, save: false } as never) as unknown;
  const base64 = typeof shot === 'string' ? shot : (shot as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
  const scale = image.width / window.innerWidth;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * scale); canvas.height = Math.round(rect.height * scale);
  canvas.getContext('2d')!.drawImage(image, rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height);
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
}
const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let bad = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) bad++;
  return bad / (n / 4);
};
const PARTICIPANTS = ['badge', 'animated', 'slot', 'light', 'serial', 'div', 'pairA', 'pairB', 'serialNested', 'serialAdopted', 'serialChild', 'opaque', 'lightDeclared', 'wbr'] as const;
const rectOf = (target: HTMLElement, key: string) => target.querySelector<HTMLElement>(`section[data-p="${key}"]`)!.getBoundingClientRect();
const reasons = (diagnostics: VisualDiagnostic[]) => diagnostics.flatMap(event => ('reason' in event && event.reason ? [`${event.type}:${'participant' in event ? event.participant : ''}:${event.reason}`] : []));

async function sources(target: HTMLElement) {
  const out: Record<string, { rect: DOMRect; pixels: Uint8ClampedArray }> = {};
  for (const key of PARTICIPANTS) { const rect = rectOf(target, key); out[key] = { rect, pixels: await crop(rect) }; }
  return out;
}
async function goAndWaitForCommit(target: HTMLElement) {
  target.querySelector<HTMLButtonElement>('[data-go]')!.click();
  expect(location.pathname).toBe('/'); // staged: nothing committed synchronously
  await until(() => location.pathname === '/next' && !!target.querySelector('h1[data-route-focus]'), 'business commit');
  // Route focus scrolls the document after the commit. Measure only once focus has landed and the document is back
  // at the pre-click offset: in Chromium a scrolled post-commit screenshot is offset by 1 px (diagnosed in drift test).
  await until(() => document.activeElement === target.querySelector('h1[data-route-focus]'), 'route focus');
  window.scrollTo(0, 0);
  await until(() => window.scrollY === 0, 'scroll reset');
  await frame();
}

describe('closed shadow roots in route participants (public package)', () => {
  it('platform: what can be detected or declared without patching', () => {
    const { target } = start({});
    const closed = target.querySelector('closed-badge')!, serial = target.querySelector('closed-serial')!, light = target.querySelector('light-card')!;
    const html = (element: Element) => (element as Element & { getHTML?: (o: object) => string }).getHTML?.({ serializableShadowRoots: true }) ?? '<no getHTML>';
    log(`closed.shadowRoot=${String(closed.shadowRoot)} light.shadowRoot=${String(light.shadowRoot)}`);
    log(`getHTML(closed)=${JSON.stringify(html(closed).slice(0, 60))}`);
    log(`getHTML(closed, serializable)=${JSON.stringify(html(serial).slice(0, 90))}`);
    // Both a closed host and a light-DOM-only custom element expose shadowRoot === null.
    expect(closed.shadowRoot).toBeNull();
    expect(light.shadowRoot).toBeNull();
  });

  it('baseline (no provider, no native snapshot): what the copy shows', async () => {
    const { target, diagnostics } = start({});
    await until(() => !!target.querySelector('section[data-p="serial"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    const results: Record<string, number> = {};
    for (const key of PARTICIPANTS) {
      const rep = document.querySelector(`[data-route-representation="${key}"]`);
      results[key] = rep ? differing(before[key]!.pixels, await crop(before[key]!.rect)) : -1;
    }
    const slotCopy = document.querySelector('[data-route-representation="slot"]');
    log(`baseline differing ${JSON.stringify(results)}`);
    log(`baseline slot copy text=${JSON.stringify(slotCopy?.textContent?.trim())}`);
    log(`baseline reasons ${JSON.stringify(reasons(diagnostics))}`);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });

  it('native snapshot opt-in (route): static old pixels where available', async () => {
    const { target, diagnostics } = start({ nativeSnapshot: 'namedParticipants' });
    await until(() => !!target.querySelector('section[data-p="serial"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    const first: Record<string, number> = {};
    for (const key of PARTICIPANTS) first[key] = differing(before[key]!.pixels, await crop(before[key]!.rect));
    const a = await crop(before.animated!.rect); await new Promise(resolve => setTimeout(resolve, 300)); const b = await crop(before.animated!.rect);
    log(`native differing ${JSON.stringify(first)} animatedChangeOver300ms=${differing(a, b).toFixed(4)}`);
    log(`native reasons ${JSON.stringify(reasons(diagnostics))}`);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });

  it('registered component provider (existing API): faithful, continues after retirement, released once', async () => {
    Object.assign(providerStats, { represented: 0, retired: 0, disposed: 0 });
    const { target, diagnostics } = start({ providers: [closedBadgeProvider()] });
    await until(() => !!target.querySelector('section[data-p="serial"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    // The page (and its closed-badge sources) is gone; the representations are on the plane.
    expect(target.querySelector('section[data-p="badge"]')).toBeNull();
    const badge = differing(before.badge!.pixels, await crop(before.badge!.rect));
    const a = await crop(before.animated!.rect); await new Promise(resolve => setTimeout(resolve, 300)); const b = await crop(before.animated!.rect);
    const live = differing(a, b);
    log(`provider badge differing=${badge.toFixed(4)} animatedChangeOver300ms=${live.toFixed(4)} stats=${JSON.stringify(providerStats)}`);
    log(`provider reasons ${JSON.stringify(reasons(diagnostics))}`);
    expect(diagnostics.some(event => event.type === 'representation' && event.participant === 'badge' && event.provider.includes('closed-badge'))).toBe(true);
    expect(reasons(diagnostics).some(reason => reason.includes('closedShadowSuspected:closed-badge'))).toBe(false);
    expect(badge).toBeLessThan(0.02);
    expect(live).toBeGreaterThan(0.001);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
    const badges = before ? 3 : 0; // badge, animated and the declared-opaque badge are all closed-badge instances
    expect(providerStats.represented).toBe(badges);
    expect(providerStats.retired).toBe(badges);
    expect(providerStats.disposed).toBe(badges);
  });

  it('declared serializable closed root: static copy from getHTML markup', async () => {
    const { target, diagnostics } = start({ providers: [serializableShadowProvider()] });
    await until(() => !!target.querySelector('section[data-p="serial"]'), 'home rendered');
    const before = await sources(target);
    const constructedBefore = constructions['closed-badge'];
    await goAndWaitForCommit(target);
    const serial = differing(before.serial!.pixels, await crop(before.serial!.rect));
    const badge = differing(before.badge!.pixels, await crop(before.badge!.rect));
    log(`declared serial differing=${serial.toFixed(4)} (undeclared badge ${badge.toFixed(4)})`);
    log(`declared reasons ${JSON.stringify(reasons(diagnostics))}`);
    if (shadowSerializationComplete(document)) {
      expect(diagnostics.some(event => event.type === 'representation' && event.participant === 'serial' && event.provider.includes('serializable-shadow'))).toBe(true);
      expect(serial).toBeLessThan(0.005);
    } else {
      // Firefox 142: incomplete serialization is detected and the participant settles (real content until the commit).
      expect(diagnostics).toContainEqual({ type: 'representation', participant: 'serial', provider: 'settled', continuity: 'unrepresented', reason: 'settled:serializable-shadow:serializationIncomplete' });
    }
    log(`declared serializationComplete=${shadowSerializationComplete(document)}`);
    // Incomplete serializations the capability check cannot see: a nested non-serializable closed root, adopted sheets.
    const nested = differing(before.serialNested!.pixels, await crop(before.serialNested!.rect));
    const adopted = differing(before.serialAdopted!.pixels, await crop(before.serialAdopted!.rect));
    log(`declared incomplete: nested=${nested.toFixed(4)} adopted=${adopted.toFixed(4)}`);
    // No component constructor ran for any copy (the inner closed-badge of serialChild included).
    const child = differing(before.serialChild!.pixels, await crop(before.serialChild!.rect));
    log(`declared serialChild differing=${child.toFixed(4)} constructorsDuringRun=${constructions['closed-badge'] - constructedBefore}`);
    expect(constructions['closed-badge'] - constructedBefore).toBe(0);
    if (shadowSerializationComplete(document)) {
      expect(diagnostics).toContainEqual({ type: 'representation', participant: 'serialChild', provider: 'settled', continuity: 'unrepresented', reason: 'settled:serializable-shadow:serializationIncomplete:nestedComponent' });
    }
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });

  it('native snapshot timeline after the commit (static badge)', async () => {
    const { target } = start({ nativeSnapshot: 'namedParticipants' });
    await until(() => !!target.querySelector('section[data-p="serial"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    const t0 = performance.now(); const series: string[] = [];
    for (let i = 0; i < 5; i++) {
      series.push(`${Math.round(performance.now() - t0)}ms:${differing(before.badge!.pixels, await crop(before.badge!.rect)).toFixed(3)}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    log(`native badge timeline ${series.join(' ')} vtPseudo=${String(document.documentElement.getAnimations?.({ subtree: true }).filter(a => String((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').includes('view-transition')).length)}`);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });
});

// Core91 contract (remaining-core-coverage-report.md): judged against its announced coherent build.
describe('closed-shadow contract: detection, declarations and fallback (real pixels)', () => {
  const has = (list: string[], entry: string) => list.includes(entry);
  const settled = (key: string, reason: string) => `representation:${key}:settled:${reason}`;
  const unverified = (key: string, tag: string) => `unsupported:${key}:representationCompletenessUnverified:${tag}`;

  it('defaults and declarations, no provider, native off', async () => {
    const { target, diagnostics } = start({});
    await until(() => !!target.querySelector('section[data-p="wbr"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    const d: Record<string, number> = {};
    for (const key of PARTICIPANTS) d[key] = differing(before[key]!.pixels, await crop(before[key]!.rect));
    const r = reasons(diagnostics);
    const onPlane = (key: string) => !!document.querySelector(`[data-route-representation="${key}"]`);
    log(`contract differing ${JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v.toFixed(4))])))}`);
    log(`contract reasons ${JSON.stringify(r)}`);
    // Ordinary light DOM: projected faithfully; undeclared reports only unverified completeness, declared reports nothing.
    expect(d.light).toBeLessThan(0.01);
    expect(has(r, unverified('light', 'light-card'))).toBe(true);
    expect(d.lightDeclared).toBeLessThan(0.01);
    expect(r.some(entry => entry.includes('lightDeclared:'))).toBe(false);
    // Ambiguous pair: both projected, both unverified, no closed-root claim; pair-closed's hidden paint is the accepted residual.
    expect(onPlane('pairA') && onPlane('pairB')).toBe(true);
    expect(has(r, unverified('pairA', 'pair-light')) && has(r, unverified('pairB', 'pair-closed'))).toBe(true);
    expect(d.pairA).toBeLessThan(0.01);
    expect(r.some(entry => entry.includes('closedShadow') && (entry.includes(':pairA:') || entry.includes(':pairB:')))).toBe(false);
    // Confirmed closed root (unslotted light child): settles, no copy, no leak.
    expect(has(r, settled('slot', 'closedShadow:closed-slot-card'))).toBe(true);
    expect(onPlane('slot')).toBe(false);
    // Declared serializable root without a provider: settles.
    expect(has(r, settled('serial', 'closedShadow:serializable:closed-serial'))).toBe(true);
    // Declared opaque without provider or native: settles.
    expect(has(r, settled('opaque', 'opaqueDeclared:closed-badge'))).toBe(true);
    expect(onPlane('opaque')).toBe(false);
    // Built-in closed root with no light-DOM signal: Main's accepted residual (projected, nothing reported).
    expect(onPlane('div')).toBe(true);
    expect(r.some(entry => entry.includes(':div:'))).toBe(false);
    // Ordinary paragraph with <wbr>: not a closed root.
    expect(onPlane('wbr')).toBe(true);
    expect(d.wbr).toBeLessThan(0.01);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });

  it('declared opaque with native opt-in: static native snapshot where available, else settle', async () => {
    const { target, diagnostics } = start({ nativeSnapshot: 'namedParticipants' });
    await until(() => !!target.querySelector('section[data-p="wbr"]'), 'home rendered');
    await goAndWaitForCommit(target);
    const r = reasons(diagnostics);
    log(`contract native reasons ${JSON.stringify(r.filter(entry => entry.includes(':opaque:') || entry.includes(':light:') || entry.includes(':pairA:')))}`);
    const available = typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function';
    if (available) expect(r.some(entry => entry.startsWith('representation:opaque:') && entry.includes('nativeSnapshotAtCue'))).toBe(true);
    else expect(has(r, settled('opaque', 'opaqueDeclared:closed-badge'))).toBe(true);
    // Ambiguous elements are never sent to native.
    expect(r.some(entry => (entry.includes(':light:') || entry.includes(':pairA:')) && entry.includes('nativeSnapshot'))).toBe(false);
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });

  it('serializable static provider takes precedence over the automatic settle; incomplete serialization settles', async () => {
    const { target, diagnostics } = start({ providers: [serializableShadowProvider()] });
    await until(() => !!target.querySelector('section[data-p="wbr"]'), 'home rendered');
    const before = await sources(target);
    await goAndWaitForCommit(target);
    const r = reasons(diagnostics);
    const serial = differing(before.serial!.pixels, await crop(before.serial!.rect));
    log(`contract provider serial=${serial.toFixed(4)} reasons ${JSON.stringify(r.filter(entry => /:serial(Child|Nested|Adopted)?:/.test(entry)))}`);
    if (shadowSerializationComplete(document)) {
      expect(diagnostics.some(event => event.type === 'representation' && event.participant === 'serial' && event.provider.includes('serializable-shadow'))).toBe(true);
      expect(serial).toBeLessThan(0.005);
      expect(has(r, settled('serialChild', 'serializable-shadow:serializationIncomplete:nestedComponent'))).toBe(true);
    } else {
      expect(has(r, settled('serial', 'serializable-shadow:serializationIncomplete'))).toBe(true);
    }
    await until(() => document.querySelector('[data-route-representation]') === null, 'plane cleared');
  });
});
