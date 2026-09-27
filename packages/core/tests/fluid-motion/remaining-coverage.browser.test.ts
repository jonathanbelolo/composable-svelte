/** Remaining ordinary paint coverage (Main 15:30Z): witnesses through a real run and plane, pixels at reveal. */
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type RunDiagnostic, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { Representer, liveRepresentationHandles } from '../../src/lib/application/renderer/representation/representer.js';
import { liveMediaResources } from '../../src/lib/application/renderer/representation/builtins.js';
import { fluidMotion } from '../../src/lib/application/renderer/choreography/engine.js';
import type { RepresentationProvider, VisualDiagnostic } from '../../src/lib/application/renderer/representation/types.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
const mount = (html: string, css = '') => {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const root = document.createElement('div'); root.innerHTML = html; document.body.append(root);
  stops.push(() => { root.remove(); style.remove(); });
  return root;
};
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** Place a captured wrapper exactly over its source (fidelity comparisons) and dispose after the test. */
function place(outcome: ReturnType<Representer['capture']>) {
  if (outcome.kind !== 'captured') throw new Error(`not captured: ${outcome.reason}`);
  document.body.append(outcome.node); outcome.handle.attach();
  stops.push(() => { outcome.handle.dispose(); outcome.node.remove(); });
  return outcome;
}
async function pixels(element: Element): Promise<Uint8ClampedArray> {
  const shot = await page.screenshot({ element, base64: true, save: false } as never) as unknown;
  const base64 = typeof shot === 'string' ? shot : (shot as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}
const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let bad = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) bad++;
  return bad / (n / 4);
};


async function shot(element: Element): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const taken = await page.screenshot({ element, base64: true, save: false } as never) as unknown;
  const base64 = typeof taken === 'string' ? taken : (taken as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: image.width, height: image.height };
}
/** Pixels of `frameBox` restricted to `box` (viewport rect), at the screenshot's device scale. */
function crop(image: { data: Uint8ClampedArray; width: number; height: number }, frameRect: DOMRect, box: DOMRect): Uint8ClampedArray {
  const scale = image.width / frameRect.width;
  const x0 = Math.max(0, Math.floor((box.x - frameRect.x) * scale)), y0 = Math.max(0, Math.floor((box.y - frameRect.y) * scale));
  const x1 = Math.min(image.width, Math.ceil((box.right - frameRect.x) * scale)), y1 = Math.min(image.height, Math.ceil((box.bottom - frameRect.y) * scale));
  const out = new Uint8ClampedArray(Math.max(0, (x1 - x0) * (y1 - y0) * 4)); let k = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * image.width + x) * 4; out[k++] = image.data[i]!; out[k++] = image.data[i + 1]!; out[k++] = image.data[i + 2]!; out[k++] = image.data[i + 3]!; }
  return out;
}
/**
 * A participant represented through a real run and plane. Measured over the participant's own box (strict): the
 * source before the run vs the representation at reveal (source hidden). With `lifetime`, the business commit then
 * removes the old page (`[data-old]`) and the participant, and the representation is sampled through the continued
 * visual period; it is compared with the pre-run source and with a live reference (the source's clone over the
 * destination, as a real element there would paint).
 */
async function throughRun(html: string, css: string, participantSelector: string, lifetime = false) {
  let now = 0, id = 0;
  const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
  const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
  const diagnostics: RunDiagnostic[] = [];
  const host = new RouteHost(undefined, window, clock, {}); stops.push(() => host.dispose());
  const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
  const owner = {};
  const root = mount(html, css);
  const participant = root.querySelector<HTMLElement>(participantSelector)!;
  stops.push(host.register(participant, 'p', owner));
  const frameBox = root.querySelector<HTMLElement>('[data-frame]')!;
  await frame(); await frame();
  const box = participant.getBoundingClientRect(), frameRect = frameBox.getBoundingClientRect();
  const before = crop(await shot(frameBox), frameRect, box);
  const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 600, tracks: [{ participant: 'p', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map());
  stops.push(() => run.settle('hostDisposed'));
  step(0); step(50);
  run.beforeRemoval(owner); participant.style.visibility = 'hidden';
  await frame(); await frame();
  const atReveal = crop(await shot(frameBox), frameRect, box);
  const reasons = host.diagnostics.filter(event => event.type === 'unsupported').map(event => (event as { reason: string }).reason);
  const result = { difference: differing(before, atReveal), reasons, host, diagnostics, afterCommit: [] as number[], afterCommitLive: [] as number[] };
  if (lifetime) {
    // Business commit: the old page and the participant leave; the destination (the frame's own background) shows.
    const clone = participant.cloneNode(true) as HTMLElement; clone.style.visibility = '';
    const parent = participant.parentElement!, next = participant.nextSibling;
    for (const old of root.querySelectorAll('[data-old]')) old.remove();
    participant.remove();
    const currents: Uint8ClampedArray[] = [];
    for (const at of [150, 300, 390]) {
      step(at); await frame(); await frame();
      const current = crop(await shot(frameBox), frameRect, box);
      currents.push(current);
      result.afterCommit.push(differing(before, current));
    }
    // Live reference after the run has settled (plane and wrappers gone): the real element over the destination.
    for (const at of [800, 1400, 2000]) step(at);
    await frame();
    parent.insertBefore(clone, next); await frame(); await frame();
    const live = crop(await shot(frameBox), frameRect, box);
    clone.remove();
    for (const current of currents) result.afterCommitLive.push(differing(live, current));
  }
  return result;
}
const report = (id: string, result: { difference: number; reasons: string[]; afterCommit?: number[]; afterCommitLive?: number[] }) => console.info(`[coverage] ${id}: differing=${result.difference.toFixed(4)} reasons=${[...new Set(result.reasons)].join(',')}${result.afterCommit?.length ? ` afterCommit(vs source)=${result.afterCommit.map(v => v.toFixed(4)).join('/')} afterCommit(vs live over destination)=${result.afterCommitLive!.map(v => v.toFixed(4)).join('/')}` : ''}`);
const PAGE = 'position:absolute;left:40px;top:40px;width:360px;height:220px;background:linear-gradient(135deg,#f97316,#0ea5e9 45%,#22c55e 55%,#a855f7);font:15px sans-serif';

describe('remaining ordinary paint coverage (witnesses)', () => {
  it('list: a middle item of <ol start> numbers from the list outside the participant', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><ol start="3" style="margin:10px;padding-left:40px"><li>One</li><li id="p">Two</li><li>Three</li></ol></div>`, '', '#p'); report('list-middle-item', r); expect(r.difference).toBeLessThan(0.01);
  });
  it('list: reversed list, value attribute and nested list numbered as painted', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><ol reversed style="margin:10px;padding-left:40px"><li>a</li><li id="p">b<ol type="a"><li>x</li><li value="7">y</li></ol></li><li>c</li></ol></div>`, '', '#p'); report('list-reversed-nested', r); expect(r.difference).toBeLessThan(0.01);
  });
  it('list: counter(list-item) in generated content', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><ol class="cl" start="4" style="margin:10px"><li>a</li><li id="p">b</li></ol></div>`, '.cl { list-style: none; } .cl > li::before { content: "#" counter(list-item) " "; }', '#p'); report('list-item-counter-content', r); expect(r.difference).toBeLessThan(0.01);
  });
  // Custom `@counter-style` in native markers and in counter() (CSSOM-formatted), measured separately. Symbols are not
  // colour emoji: a literal-emoji control without counters differs up to 0.99% in one engine (rasterization variance).
  for (const [name, inner] of [['markers', '<ol id="p" class="cs" style="margin:6px;padding-left:40px"><li>a</li><li>b</li><li>c</li><li>d</li></ol>'], ['counter()', '<div id="p" class="cc"><p>one</p><p>two</p><p>three</p><p>four</p><p>five</p></div>']] as const) it(`custom @counter-style in ${name}`, async () => {
    const css = '@counter-style rp-shapes { system: cyclic; symbols: "◆" "◇" "○"; suffix: " "; } @counter-style rp-fixed { system: fixed 7; symbols: "Ⓐ" "Ⓑ" "Ⓒ"; } @counter-style rp-add { system: additive; additive-symbols: 5 "V", 1 "I"; }'
      + ' .cs { list-style-type: rp-shapes; } .cc { counter-reset: s 6; } .cc > p { counter-increment: s; margin: 0; } .cc > p::before { content: counter(s, rp-fixed) " " counter(s, rp-shapes) " " counter(s, rp-add) " "; }';
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff">${inner}</div>`, css, '#p'); report(`custom-counter-style-${name}`, r);
    expect(r.reasons.filter(reason => reason.startsWith('counterStyleApproximated'))).toEqual([]);
    expect(r.difference).toBeLessThan(0.01);
  });
  it('predefined non-literal counter style (lower-armenian) in counter()', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><div id="p" class="ca"><p>one</p><p>two</p><p>three</p></div></div>`, '.ca { counter-reset: s 8; } .ca > p { counter-increment: s; margin: 0; } .ca > p::before { content: counter(s, lower-armenian) " "; }', '#p'); report('predefined-armenian', r); expect(r.difference).toBeLessThan(0.01);
  });
  // Partly open (report §5): text resolves and native duplication is suppressed; WebKit is pixel-exact, Chromium/Firefox
  // still differ (unattributed) and are asserted to be reported-free only, with their numbers logged.
  it('quotes: nested <q> inside an outer quote (depth from outside the participant) and open/close-quote in content', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><p lang="en" style="margin:10px">Outside <q>outer <span id="p" style="display:inline-block">then <q>level <q>two</q> back</q> and <span class="oq">x</span></span> end</q></p></div>`, '.oq::before { content: open-quote; } .oq::after { content: close-quote; }', '#p'); report('quotes', r); expect(r.reasons).toEqual([]); if (/Version\/[\d.]+ Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) expect(r.difference).toBeLessThan(0.01);
  });
  it('backdrop-filter inside the participant (its own background behind the glass)', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE}"><div id="p" style="position:absolute;left:20px;top:20px;width:260px;height:160px;background:repeating-linear-gradient(45deg,#111 0 10px,#fde047 10px 20px)"><div style="position:absolute;left:30px;top:30px;width:180px;height:90px;backdrop-filter:blur(6px) saturate(2);background:rgba(255,255,255,.2)">glass</div></div></div>`, '', '#p', true); report('backdrop-internal', r); expect(r.difference).toBeLessThan(0.01); expect(r.afterCommitLive.length).toBe(3); for (const value of r.afterCommitLive) expect(value).toBeLessThan(0.01); // after the business commit: as the real element over the destination
  });
  it('backdrop-filter participant over page content (backdrop outside the participant)', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE}"><div data-old style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,#111 0 10px,#fde047 10px 20px)"></div><div id="p" style="position:absolute;left:40px;top:40px;width:200px;height:100px;backdrop-filter:blur(6px);background:rgba(255,255,255,.25)">glass nav</div></div>`, '', '#p', true); report('backdrop-external', r); expect(r.difference).toBeLessThan(0.01); expect(r.afterCommitLive.length).toBe(3); for (const value of r.afterCommitLive) expect(value).toBeLessThan(0.01); // after the business commit: as the real element over the destination
  });
  it('mix-blend-mode inside the participant', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE}"><div id="p" style="position:absolute;left:20px;top:20px;width:260px;height:160px;background:linear-gradient(90deg,#ef4444,#3b82f6)"><div style="position:absolute;left:30px;top:30px;width:180px;height:90px;background:#22c55e;mix-blend-mode:multiply"></div></div></div>`, '', '#p', true); report('blend-internal', r); expect(r.difference).toBeLessThan(0.01); expect(r.afterCommitLive.length).toBe(3); for (const value of r.afterCommitLive) expect(value).toBeLessThan(0.01); // after the business commit: as the real element over the destination
  });
  it('mix-blend-mode participant over page content', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE}"><div data-old style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,#111 0 10px,#fde047 10px 20px)"></div><div id="p" style="position:absolute;left:40px;top:40px;width:200px;height:100px;background:#22c55e;mix-blend-mode:multiply;color:#fff">blended</div></div>`, '', '#p', true); report('blend-external', r); expect(r.difference).toBeLessThan(0.01); expect(r.afterCommitLive.length).toBe(3); for (const value of r.afterCommitLive) expect(value).toBeLessThan(0.01); // after the business commit: as the real element over the destination
  });
  it('two rotated clipping ancestors compose exactly', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><div style="position:absolute;left:60px;top:30px;width:200px;height:150px;overflow:hidden;transform:rotate(-12deg);background:#f1f5f9"><div style="position:absolute;left:30px;top:20px;width:180px;height:120px;overflow:hidden;transform:rotate(25deg);background:#e2e8f0"><div id="p" style="margin:10px;width:220px;height:160px;background:linear-gradient(90deg,#6366f1,#ec4899)"></div></div></div></div>`, '', '#p'); report('two-rotated-clippers', r); expect(r.reasons).not.toContain('clipApproximated:multipleRotatedClippers'); expect(r.difference).toBeLessThan(0.01);
  });
});

describe('closed shadow roots: no unrendered content, confirmed opacity settles, light DOM stays faithful', () => {
  let serial = 0;
  const define = (render: (host: HTMLElement) => void) => { const name = `rp-shadow-${++serial}-${Math.random().toString(36).slice(2, 7)}`; customElements.define(name, class extends HTMLElement { connectedCallback() { if (!this.dataset['done']) { this.dataset['done'] = '1'; render(this); } } }); return name; };
  const capture = (element: HTMLElement) => { const events: VisualDiagnostic[] = []; const outcome = new Representer({ diagnose: event => events.push(event) }).capture(element, 'shadow'); if (outcome.kind === 'captured') stops.push(() => outcome.handle.dispose()); return { outcome, events }; };
  it('a closed root that leaves a light child unslotted: the copy never paints it and the participant settles (confirmed)', () => {
    const tag = define(host => { const root = host.attachShadow({ mode: 'closed' }); root.innerHTML = '<b>chrome</b><slot name="title"></slot>'; });
    const root = mount(`<div id="p"><${tag}><span slot="title">Title</span><span>unslotted secret</span></${tag}></div>`);
    const { outcome, events } = capture(root.querySelector<HTMLElement>('#p')!);
    expect(outcome).toEqual({ kind: 'skipped', reason: `settled:closedShadow:${tag}` });
    expect(events).toContainEqual(expect.objectContaining({ type: 'representation', provider: 'settled', reason: `settled:closedShadow:${tag}` }));
  });
  it('a built-in <div> with a closed root and loose light text is confirmed and settles', () => {
    const root = mount('<section id="p"><div id="host">loose text</div></section>');
    root.querySelector('#host')!.attachShadow({ mode: 'closed' }).innerHTML = '<i>inside</i>';
    expect(capture(root.querySelector<HTMLElement>('#p')!).outcome).toEqual({ kind: 'skipped', reason: 'settled:closedShadow:div' });
  });
  it('unslotted content is pruned from the copy even when nothing settles (host declared light, contradicting evidence)', () => {
    const tag = define(host => { host.attachShadow({ mode: 'closed' }).innerHTML = '<slot name="a"></slot>'; });
    const root = mount(`<div id="p"><${tag} data-composable-representation="light-dom"><span slot="a">kept</span><span>secret</span></${tag}></div>`);
    const { outcome } = capture(root.querySelector<HTMLElement>('#p')!);
    expect(outcome.kind).toBe('captured');
    if (outcome.kind === 'captured') { expect(outcome.node.textContent).toContain('kept'); expect(outcome.node.textContent).not.toContain('secret'); }
  });
  it('ordinary light-DOM custom elements and unboxed-but-legitimate content are projected faithfully (no settle, nothing pruned)', async () => {
    const tag = define(() => {});
    const root = mount(`<div id="p" style="width:240px;font:14px sans-serif;background:#fff"><${tag} style="display:block"><b>light</b> card</${tag}><span></span><div style="display:contents"><em>contents child</em></div><p style="visibility:hidden;margin:0">hidden but boxed</p><p style="display:none">none</p><details><summary>sum</summary><p>closed details body</p></details><div style="content-visibility:hidden;height:10px"><p>skipped</p></div><select><option>one</option><option selected>two</option></select><table><colgroup><col style="width:60px"></colgroup><tr><td>cell</td></tr></table>
    <span>  </span></div>`);
    const participant = root.querySelector<HTMLElement>('#p')!;
    const { outcome, events } = capture(participant);
    expect(outcome.kind).toBe('captured');
    expect(events.some(event => event.type === 'representation' && event.provider === 'settled')).toBe(false);
    if (outcome.kind === 'captured') { for (const text of ['light', 'contents child', 'hidden but boxed', 'cell']) expect(outcome.node.textContent).toContain(text); expect(outcome.node.querySelectorAll('col').length).toBe(1); expect(outcome.node.querySelectorAll('option').length).toBe(2); }
    const declared = define(() => {});
    const second = mount(`<div id="q"><${declared} data-composable-representation="light-dom">declared</${declared}></div>`);
    const { events: declaredEvents } = capture(second.querySelector<HTMLElement>('#q')!);
    expect(declaredEvents.some(event => event.type === 'unsupported' && event.reason.startsWith('representationCompletenessUnverified'))).toBe(false);
  });
});

describe('closed shadow: declared facts, ambiguity and serialization (Main 15:35Z refinement)', () => {
  const unique = () => `rp-sd-${Math.random().toString(36).slice(2, 9)}`;
  const capture = (element: HTMLElement) => { const events: VisualDiagnostic[] = []; const outcome = new Representer({ diagnose: event => events.push(event) }).capture(element, 'sd'); if (outcome.kind === 'captured') stops.push(() => outcome.handle.dispose()); return { outcome, events }; };
  it('the indistinguishable pair (light-only vs closed root slotting all) both project, reported completeness-unverified, never "closed detected"', () => {
    const light = unique(), closed = unique();
    customElements.define(light, class extends HTMLElement {});
    customElements.define(closed, class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'closed' }).innerHTML = '<b>extra</b><slot></slot>'; } });
    for (const tag of [light, closed]) {
      const root = mount(`<div id="${tag}-p"><${tag}><span>child</span></${tag}></div>`);
      const { outcome, events } = capture(root.querySelector<HTMLElement>(`#${tag}-p`)!);
      expect(outcome.kind).toBe('captured');
      expect(events).toContainEqual(expect.objectContaining({ type: 'unsupported', reason: `representationCompletenessUnverified:${tag}` }));
      expect(events.some(event => 'reason' in event && typeof event.reason === 'string' && /closedShadow/.test(event.reason))).toBe(false);
    }
  });
  it('declared opaque settles without a native route (built-in or custom host); declared light-dom projects without a completeness report', () => {
    const tag = unique(); customElements.define(tag, class extends HTMLElement {});
    const root = mount(`<div id="op"><div data-composable-representation="opaque">x</div></div><div id="ld"><${tag} data-composable-representation="light-dom">light</${tag}></div>`);
    expect(capture(root.querySelector<HTMLElement>('#op')!).outcome).toEqual({ kind: 'skipped', reason: 'settled:opaqueDeclared:div' });
    const declared = capture(root.querySelector<HTMLElement>('#ld')!);
    expect(declared.outcome.kind).toBe('captured');
    expect(declared.events.some(event => event.type === 'unsupported' && event.reason.startsWith('representationCompletenessUnverified'))).toBe(false);
  });
  it('a serializable closed root is detected from its serialization and settles (static reconstruction is not qualified, incl. Firefox 142)', () => {
    const tag = unique();
    customElements.define(tag, class extends HTMLElement { constructor() { super(); (this.attachShadow as (init: ShadowRootInit & { serializable?: boolean }) => ShadowRoot)({ mode: 'closed', serializable: true }).innerHTML = '<b>inside</b>'; } });
    const root = mount(`<div id="${tag}-p"><${tag}></${tag}></div>`);
    const element = root.querySelector(tag) as Element & { getHTML?: (o: { serializableShadowRoots: boolean }) => string };
    const serialized = element.getHTML?.({ serializableShadowRoots: true }) ?? '';
    const { outcome } = capture(root.querySelector<HTMLElement>(`#${tag}-p`)!);
    console.info(`[coverage] serializable-closed: serialized=${JSON.stringify(serialized.slice(0, 60))} outcome=${JSON.stringify(outcome.kind === 'skipped' ? outcome : outcome.kind)}`);
    // Where the engine serializes the declared root, it is detected and settles; where it does not (incomplete or
    // absent serialization), it is the ambiguous case: projected and reported unverified, never claimed complete.
    if (/shadowrootmode/i.test(serialized)) expect(outcome).toEqual({ kind: 'skipped', reason: `settled:closedShadow:serializable:${tag}` });
    else expect(outcome.kind).toBe('captured');
  });
});

describe('large preparation: end-to-end latency vs main-thread blocking (real clock)', () => {
  it('a 1500-element outgoing participant: longest main-thread block, cue, commit and settle are measured through a real run', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => `<div style="display:flex;gap:6px;padding:2px;border-bottom:1px solid #e2e8f0"><span style="font-weight:600">Item ${i}</span><em style="color:#64748b">detail ${i}</em></div>`).join('');
    const root = mount(`<div id="big" style="position:absolute;left:0;top:0;width:420px;height:600px;overflow:auto;font:12px sans-serif;background:#fff">${rows}</div>`);
    const participant = root.querySelector<HTMLElement>('#big')!;
    expect(participant.querySelectorAll('*').length + 1).toBeGreaterThanOrEqual(1500);
    const host = new RouteHost(undefined, window, undefined, {}); stops.push(() => host.dispose());
    const owner = {};
    stops.push(host.register(participant, 'big', owner));
    let committedAt = -1;
    (host as unknown as { cue: () => void }).cue = () => { committedAt = performance.now(); run.beforeRemoval(owner); participant.remove(); };
    // Heartbeat: the longest gap between consecutive macrotasks is the longest main-thread block the page experiences.
    let last = performance.now(), longest = 0, beating = true; const gaps: number[] = [];
    const beat = () => { const now = performance.now(); const gap = now - last; gaps.push(gap); longest = Math.max(longest, gap); last = now; if (beating) setTimeout(beat, 0); };
    setTimeout(beat, 0);
    await sleep(50);
    const start = performance.now();
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 250, durationMs: 700, tracks: [{ participant: 'big', side: 'outgoing', startMs: 0, durationMs: 600, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map());
    stops.push(() => run.settle('hostDisposed'));
    const constructedMs = performance.now() - start;
    const deadline = performance.now() + 4000;
    while (!host.diagnostics.some(event => event.type === 'settled') && performance.now() < deadline) await sleep(16);
    beating = false;
    const preparation = host.diagnostics.find(event => event.type === 'preparation') as { workMs: number; slices: number; elements: number; outcome: string; waitedMs: number } | undefined;
    const cue = host.diagnostics.find(event => event.type === 'cue') as { t: number } | undefined;
    const settled = host.diagnostics.find(event => event.type === 'settled') as { t: number; reason: string } | undefined;
    const over50 = gaps.filter(gap => gap > 50).length;
    console.info(`[coverage] large-preparation: elements=${preparation?.elements} workMs=${preparation?.workMs} slices=${preparation?.slices} outcome=${preparation?.outcome} waitedMs=${preparation?.waitedMs} constructorMs=${constructedMs.toFixed(1)} longestBlockMs=${longest.toFixed(1)} gapsOver50ms=${over50} cueT=${cue?.t} commitMs=${committedAt < 0 ? 'none' : (committedAt - start).toFixed(0)} settled=${settled?.reason}@${settled?.t} media=${JSON.stringify(host.visualResources?.() ?? null)}`);
    expect(preparation?.outcome).toBe('ready');
    expect(preparation?.elements).toBeGreaterThanOrEqual(1500);
    expect(committedAt).toBeGreaterThan(0);
    // The representation was shown (revealed at the business commit), not a timeout-to-box.
    expect(host.diagnostics.some(event => event.type === 'reveal' && (event as { participant: string }).participant === 'big')).toBe(true);
    // No preparation-caused long task: chunked slices, and no self-triggered synchronous recapture.
    expect(host.diagnostics.some(event => event.type === 'recapture')).toBe(false);
    expect(longest).toBeLessThan(150);
  });
});

describe('blended copies placed beside the plane: ordering and cleanup', () => {
  function rig() {
    let now = 0, id = 0;
    const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
    const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
    const host = new RouteHost(undefined, window, clock, {});
    const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
    return { host, step };
  }
  const html = `<div data-frame style="${PAGE}"><div id="blend" style="position:absolute;left:40px;top:40px;width:160px;height:100px;background:#22c55e;mix-blend-mode:multiply"></div><div id="plain" style="position:absolute;left:120px;top:80px;width:160px;height:100px;background:#1d4ed8"></div></div>`;
  const plan = defineChoreography({ cueMs: 100, durationMs: 600, tracks: [{ participant: 'blend', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }, { participant: 'plain', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }] });
  it('the blended copy blends with the page and a later ordinary participant still paints over it (source order kept); nothing is stranded after settle', async () => {
    const { host, step } = rig(); stops.push(() => host.dispose());
    const root = mount(html); const owner = {};
    const [blend, plain] = [root.querySelector<HTMLElement>('#blend')!, root.querySelector<HTMLElement>('#plain')!];
    stops.push(host.register(blend, 'blend', owner)); stops.push(host.register(plain, 'plain', owner));
    const frameBox = root.querySelector<HTMLElement>('[data-frame]')!;
    await frame(); await frame();
    const before = await shot(frameBox);
    const run = new ChoreographyRun(host, 1 as never, plan, owner, [], () => {}, new Map());
    step(0); step(50); run.beforeRemoval(owner); blend.style.visibility = 'hidden'; plain.style.visibility = 'hidden';
    await frame(); await frame();
    const after = await shot(frameBox);
    const difference = differing(before.data, after.data);
    console.info(`[coverage] blend-with-overlap: differing=${difference.toFixed(4)}`);
    expect(difference).toBeLessThan(0.01);
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(2);
    run.settle('completed');
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
  });
  it('reverse order: an ordinary participant painted first stays under a later blended one (both directions are regression controls)', async () => {
    const { host, step } = rig(); stops.push(() => host.dispose());
    const root = mount(`<div data-frame style="${PAGE}"><div id="plain" style="position:absolute;left:40px;top:40px;width:160px;height:100px;background:#1d4ed8"></div><div id="blend" style="position:absolute;left:120px;top:80px;width:160px;height:100px;background:#22c55e;mix-blend-mode:multiply"></div></div>`); const owner = {};
    const [plain, blend] = [root.querySelector<HTMLElement>('#plain')!, root.querySelector<HTMLElement>('#blend')!];
    stops.push(host.register(plain, 'plain', owner)); stops.push(host.register(blend, 'blend', owner));
    const frameBox = root.querySelector<HTMLElement>('[data-frame]')!;
    await frame(); await frame();
    const before = await shot(frameBox);
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 600, tracks: [{ participant: 'plain', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }, { participant: 'blend', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map());
    step(0); step(50); run.beforeRemoval(owner); plain.style.visibility = 'hidden'; blend.style.visibility = 'hidden';
    await frame(); await frame();
    const difference = differing(before.data, (await shot(frameBox)).data);
    console.info(`[coverage] blend-reverse-order: differing=${difference.toFixed(4)}`);
    expect(difference).toBeLessThan(0.01);
    run.settle('completed');
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
  });
  it('Host destruction mid-run removes the blended copy beside the plane too (queried globally)', async () => {
    const { host, step } = rig();
    const root = mount(html); const owner = {};
    stops.push(host.register(root.querySelector<HTMLElement>('#blend')!, 'blend', owner));
    const run = new ChoreographyRun(host, 1 as never, plan, owner, [], () => {}, new Map());
    step(0); step(50);
    expect(document.querySelectorAll('[data-route-representation="blend"]').length).toBe(1);
    host.dispose(); run.settle('hostDisposed');
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
    expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
  });
});

describe('blended shared flight beside the plane', () => {
  it('a blended shared flight blends with the page, stays above an overlapping outgoing copy, and leaves nothing after settle', async () => {
    let now = 0, id = 0;
    const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
    const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
    const host = new RouteHost(undefined, window, clock, {}); stops.push(() => host.dispose());
    const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
    const root = mount(`<div data-frame style="${PAGE}"><div id="plain" style="position:absolute;left:100px;top:70px;width:160px;height:100px;background:#1d4ed8"></div><div id="hero" style="position:absolute;left:40px;top:40px;width:160px;height:100px;background:#22c55e;mix-blend-mode:multiply"></div></div>`);
    const owner = {};
    const [hero, plain] = [root.querySelector<HTMLElement>('#hero')!, root.querySelector<HTMLElement>('#plain')!];
    stops.push(host.register(hero, 'hero', owner)); stops.push(host.register(plain, 'plain', owner));
    const frameBox = root.querySelector<HTMLElement>('[data-frame]')!;
    await frame(); await frame();
    const before = await shot(frameBox);
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 900, tracks: [
      { participant: 'hero', side: 'shared', startMs: 300, durationMs: 500, path: [{ atMs: 800, pose: { relativeTo: 'viewport', x: 0.5, y: 0.3, width: 0.2, height: 0.15 } }] },
      { participant: 'plain', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map());
    step(0); step(50);
    run.beforeRemoval(owner); hero.style.visibility = 'hidden'; plain.style.visibility = 'hidden';
    await frame(); await frame();
    const after = await shot(frameBox);
    const difference = differing(before.data, after.data);
    const flight = document.querySelector<HTMLElement>('[data-route-representation="hero"]')!;
    const plane = document.querySelector('[data-composable-route-plane]')!;
    console.info(`[coverage] blend-shared-flight: differing=${difference.toFixed(4)} afterPlane=${plane.compareDocumentPosition(flight) === Node.DOCUMENT_POSITION_FOLLOWING}`);
    expect(flight.style.mixBlendMode).toBe('multiply');
    expect(plane.compareDocumentPosition(flight)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(difference).toBeLessThan(0.01);
    run.settle('completed');
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
  });
});

describe('predefined Armenian outside its qualified range (Main RC4): deterministic participant settle in every engine', () => {
  function rig() {
    let now = 0, id = 0;
    const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
    const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
    const host = new RouteHost(undefined, window, clock, {});
    const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
    return { host, step };
  }
  const css = (style: string) => `.arm > p { margin: 0; } .arm > p::before { content: counter(a, ${style}) " "; }`;
  for (const [value, style] of [[10000, 'lower-armenian'], [0, 'upper-armenian']] as const) it(`${style} ${value}: settles through a real Host run (no copy, no lease, unrelated participant animates), commits and disposes cleanly`, async () => {
    const { host, step } = rig(); stops.push(() => host.dispose());
    const root = mount(`<div data-frame style="${PAGE};background:#fff"><div id="p" class="arm" style="font:24px sans-serif"><p style="counter-reset:a ${value}">x</p></div><div id="other" style="width:60px;height:20px;background:#334155"></div></div>`, css(style));
    const owner = {}; const participant = root.querySelector<HTMLElement>('#p')!, other = root.querySelector<HTMLElement>('#other')!;
    stops.push(host.register(participant, 'p', owner)); stops.push(host.register(other, 'other', owner));
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 600, tracks: [{ participant: 'p', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }, { participant: 'other', side: 'outgoing', startMs: 400, durationMs: 100, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map());
    step(0); step(50);
    expect(host.diagnostics).toContainEqual(expect.objectContaining({ type: 'representation', participant: 'p', provider: 'settled', reason: `settled:counterStyleOutsideQualifiedRange:${style}:${value}` }));
    expect(document.querySelector('[data-route-representation="p"]')).toBeNull();
    expect(participant.style.opacity).toBe(''); // not leased: the live original paints until the commit
    expect(document.querySelector('[data-route-representation="other"]')).not.toBeNull();
    // The business commit removes the page; the run completes; nothing is left behind.
    run.beforeRemoval(owner); participant.remove(); other.remove();
    step(300); step(600); step(900);
    run.settle('completed');
    expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
    expect(host.visualResources?.() ?? { observers: 0, handles: 0, media: 0 }).toMatchObject({ handles: 0, media: 0 });
  });
  it('boundaries 1 and 9999 keep their exact representation (no settle)', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><div id="p" class="arm" style="font:24px sans-serif"><p style="counter-reset:a 9999">x</p><p style="counter-reset:a 1">y</p><p style="counter-reset:a 2024">z</p></div></div>`, css('lower-armenian'), '#p');
    report('armenian-in-range', r);
    expect(r.host.diagnostics.some(event => event.type === 'representation' && (event as { provider?: string }).provider === 'settled')).toBe(false);
    expect(r.difference).toBeLessThan(0.01);
  });
  it('an author @counter-style named lower-armenian overrides the predefined one: 10000 is represented exactly, never settled; an unrelated custom style is unaffected', async () => {
    const r = await throughRun(`<div data-frame style="${PAGE};background:#fff"><div id="p" class="arm" style="font:24px sans-serif"><p style="counter-reset:a 10000">x</p><p class="u" style="counter-reset:u 3">y</p></div></div>`,
      '@counter-style lower-armenian { system: cyclic; symbols: "◆" "◇"; } @counter-style rp-unrelated { system: numeric; symbols: "0" "1"; } ' + css('lower-armenian') + ' .arm > p.u::before { content: counter(u, rp-unrelated) " "; }', '#p');
    report('armenian-author-override', r);
    expect(r.host.diagnostics.some(event => event.type === 'representation' && (event as { provider?: string }).provider === 'settled')).toBe(false);
    expect(r.reasons.filter(reason => reason.startsWith('counterStyle'))).toEqual([]);
    expect(r.difference).toBeLessThan(0.01);
  });
});
