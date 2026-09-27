// Diagnostic: Chromium-only drift of ordinary projected text (0.10–0.13 differing). Saves source/copy images and
// compares computed styles and font readiness. Evidence only; the tolerance of the other tests is unchanged.
import { afterEach, beforeAll, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { commands, page } from 'vitest/browser';
import App from '../src/App.svelte';
import { defineElements } from '../src/elements.js';
import { current, makeApplication } from '../src/model.js';

const engine = navigator.userAgent.includes('Firefox') ? 'firefox' : /Chrome\//.test(navigator.userAgent) ? 'chromium' : 'webkit';
const log = (line: string) => console.info(`[drift:${engine}] ${line}`);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
beforeAll(() => defineElements());
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(predicate: () => boolean, ms = 4000) { const end = performance.now() + ms; while (!predicate()) { if (performance.now() > end) throw new Error('timeout'); await frame(); } }

async function shot(): Promise<HTMLImageElement> {
  const raw = await page.screenshot({ base64: true, save: false } as never) as unknown;
  const base64 = typeof raw === 'string' ? raw : (raw as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); return image;
}
function cropCanvas(image: HTMLImageElement, rect: DOMRect): HTMLCanvasElement {
  const scale = image.width / window.innerWidth;
  const canvas = document.createElement('canvas'); canvas.width = Math.round(rect.width * scale); canvas.height = Math.round(rect.height * scale);
  canvas.getContext('2d')!.drawImage(image, rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function save(name: string, canvas: HTMLCanvasElement) {
  await commands.writeFile(`evidence/${engine}-${name}.png`, canvas.toDataURL('image/png').split(',')[1]!, 'base64');
}
function diff(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const da = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data, db = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  let bad = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let i = 0; i < Math.min(da.length, db.length); i += 4) {
    if (Math.max(Math.abs(da[i]! - db[i]!), Math.abs(da[i + 1]! - db[i + 1]!), Math.abs(da[i + 2]! - db[i + 2]!)) > 24) {
      bad++; const p = i / 4, x = p % a.width, y = Math.floor(p / a.width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return `${(bad / (da.length / 4)).toFixed(4)} box=${minX},${minY}..${maxX},${maxY} size=${a.width}x${a.height}/${b.width}x${b.height}`;
}
const styles = (element: Element) => { const cs = getComputedStyle(element); return new Map(Array.from(cs).map(name => [name, cs.getPropertyValue(name)])); };
function styleDiff(a: Element, b: Element) {
  const sa = styles(a), sb = styles(b); const out: string[] = [];
  for (const [name, value] of sa) if (sb.get(name) !== value) out.push(`${name}: ${value} → ${sb.get(name)}`);
  return out;
}

it('diagnose ordinary copy drift', async () => {
  const application = makeApplication({}); current.application = application;
  const oldURL = location.href; history.replaceState(null, '', '/');
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(App, { target, props: { url: '/', application } }); flushSync();
  cleanups.push(async () => { await unmount(component); target.remove(); history.replaceState(null, '', oldURL); });
  await until(() => !!target.querySelector('section[data-p="wbr"]'));
  log(`fonts status=${document.fonts.status} size=${document.fonts.size} check14=${document.fonts.check('14px sans-serif')} dpr=${devicePixelRatio}`);
  const keys = ['light', 'pairA', 'intText', 'fracText'];
  const rects = Object.fromEntries(keys.map(key => [key, target.querySelector(`section[data-p="${key}"]`)!.getBoundingClientRect()]));
  const sources = Object.fromEntries(keys.map(key => { const section = target.querySelector(`section[data-p="${key}"]`)!; return [key, { host: section.firstElementChild!, text: section.firstElementChild!.firstElementChild ?? section.firstElementChild! }]; }));
  const sourceStyles = Object.fromEntries(keys.map(key => [key, { host: styles(sources[key]!.host), text: styles(sources[key]!.text) }]));
  const before = await shot();
  target.querySelector<HTMLButtonElement>('[data-go]')!.click();
  await until(() => location.pathname === '/next');
  // Diagnosis (see report): route focus scrolls the document after the commit; Chromium's screenshot of that scrolled
  // page is offset by 1 px. Take the diagnostic shot in both states.
  await until(() => document.activeElement === target.querySelector('h1[data-route-focus]'));
  const scrolled = await shot();
  const scrolledY = scrollY;
  window.scrollTo(0, 0); await until(() => scrollY === 0); await frame();
  const after = await shot();
  for (const key of keys) log(`${key} scrolled(${scrolledY}px) differing=${diff(cropCanvas(before, rects[key]!), cropCanvas(scrolled, rects[key]!))}`);
  for (const key of keys) {
    const a = cropCanvas(before, rects[key]!), b = cropCanvas(after, rects[key]!);
    await save(`${key}-source`, a); await save(`${key}-copy`, b);
    log(`${key} differing=${diff(a, b)}`);
    const rep = document.querySelector(`[data-route-representation="${key}"]`)!;
    const hostCopy = rep.firstElementChild!.firstElementChild!;
    const textCopy = hostCopy.firstElementChild ?? hostCopy;
    const hostDiff: string[] = [], textDiff: string[] = [];
    const hs = styles(hostCopy), ts = styles(textCopy);
    for (const [name, value] of sourceStyles[key]!.host) if (hs.get(name) !== value) hostDiff.push(`${name}: ${value} → ${hs.get(name)}`);
    for (const [name, value] of sourceStyles[key]!.text) if (ts.get(name) !== value) textDiff.push(`${name}: ${value} → ${ts.get(name)}`);
    log(`${key} copy tags=${hostCopy.localName}/${textCopy.localName} hostStyleDiff(${hostDiff.length})=${JSON.stringify(hostDiff.slice(0, 25))}`);
    log(`${key} textStyleDiff(${textDiff.length})=${JSON.stringify(textDiff.slice(0, 25))}`);
  }
  void styleDiff;
  await until(() => document.querySelector('[data-route-representation]') === null);
});
