/**
 * Identity and ownership regressions (fluid-overlays design §3a), inverting the independent audit's three
 * reproductions (audit-observations.md A1–A3) on the same engine-boundary rig: exact destination owner,
 * ambiguity diagnosed before any acquisition, one representation and one writer per node across concurrent runs.
 */
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
function rig() {
  let now = 0, id = 0;
  const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
  const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
  const host = new RouteHost(undefined, window, clock, {}); const owner = {};
  stops.push(() => host.dispose());
  const step = (ms: number) => { now = ms; const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
  const node = (key: string, scope: object = owner) => { const n = document.createElement('div'); n.textContent = key; n.style.cssText = 'width:100px;height:40px;background:red'; document.body.append(n); const release = host.register(n, key, scope); stops.push(() => { release(); n.remove(); }); return n; };
  const plan = defineChoreography({ cueMs: 500, durationMs: 1000, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 1000 }] });
  const route = () => { const run = new ChoreographyRun(host, 1 as never, plan, owner, [], () => {}); stops.push(() => run.settle('hostDisposed')); step(0); run.lifecycle({ type: 'commitReserved', transaction: 1 as never }); return run; };
  return { host, owner, step, node, plan, route };
}

it('A1 fixed: another owner\'s same-key participant registering first is never the destination; the committed destination is', () => {
  const f = rig(); f.node('hero'); const run = f.route();
  const wrongOwner = {}; const wrong = f.node('hero', wrongOwner);
  run.registered({ node: wrong, key: 'hero', owner: wrongOwner, role: 'surface' });
  const correctOwner = {}; const right = f.node('hero', correctOwner);
  run.registered({ node: right, key: 'hero', owner: correctOwner, role: 'surface' });
  run.rendered(correctOwner);
  expect(wrong.style.opacity).toBe('');
  expect(right.style.opacity).toBe('0');
});

it('A2 fixed: two same-owner destinations are diagnosed as ambiguous before any acquisition (neither is suppressed)', () => {
  const f = rig(); f.node('hero'); const run = f.route(); const owner = {};
  const first = f.node('hero', owner), second = f.node('hero', owner);
  run.registered({ node: first, key: 'hero', owner, role: 'surface' });
  run.registered({ node: second, key: 'hero', owner, role: 'surface' });
  run.rendered(owner);
  expect(first.style.opacity).toBe('');
  expect(second.style.opacity).toBe('');
  expect(f.host.diagnostics.some(event => event.type === 'unsupported' && (event as { reason: string }).reason === 'destinationAmbiguous')).toBe(true);
});

it('A3 fixed: a later local run adopts the conflicting participant from the route run — one representation, one writer, source consistent', () => {
  const f = rig(); f.node('hero'); f.route();
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 100 }] }), f.owner, () => {});
  expect(document.querySelectorAll('[data-route-representation="hero"]').length).toBe(1);
  f.step(16); f.step(200); f.step(400);
  // Whatever is on screen is owned by exactly one run: no stray copy over a restored source.
  const copies = document.querySelectorAll('[data-route-representation="hero"]').length;
  const source = f.host.find('hero', f.owner)[0]!.node;
  expect(copies === 0 ? source.style.opacity : '0').toBe(copies === 0 ? '' : '0');
  expect(copies).toBeLessThanOrEqual(1);
});

it('leases stay balanced after concurrent adoption', () => {
  const f = rig(); f.node('hero'); const run = f.route();
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 100 }] }), f.owner, () => {});
  f.step(16); f.step(200); f.step(400); run.settle('hostDisposed'); f.host.dispose();
  expect(liveChoreographyLeases()).toBe(0);
});

it('gap 7: a yielding run hands over its destination reveal clip — never abandoned; untaken, it is restored when that run settles', () => {
  const f = rig();
  const a = {}, b = {};
  f.node('card', a);
  let hero: HTMLElement | undefined;
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 400, tracks: [{ participant: 'card', side: 'shared', startMs: 0, durationMs: 400, content: 'clipReveal' }] }), a, () => {
    hero = document.createElement('div'); hero.style.cssText = 'width:300px;height:200px;background:blue'; document.body.append(hero);
    const release = f.host.register(hero, 'card', a); stops.push(() => { release(); hero!.remove(); });
  });
  for (let ms = 16; ms <= 160; ms += 16) f.step(ms);
  const clipped = hero!.style.clipPath;
  expect(clipped).not.toBe(''); // A is revealing the destination through a clip
  // A later run in another scope takes the same node (incoming): A yields it; the clip lease is handed, not abandoned.
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ participant: 'target', side: 'incoming', startMs: 0, durationMs: 100, opacity: { from: 0.5, to: 1 } }] }), b, () => {});
  stops.push(f.host.register(hero!, 'target', b)); // the committed render registers B's destination
  expect(hero!.style.clipPath).toBe(clipped); // contested: nothing arbitrated before the destination checkpoint
  f.step(176); // checkpoint: B is admitted and adopts the node
  expect(f.host.diagnostics.some(event => (event as { reason?: string }).reason === 'adoptedFromEarlierRun')).toBe(true); // the yield path ran
  expect(hero!.style.clipPath).not.toBe(''); // handed over live: no restoring write at the yield
  for (let ms = 192; ms <= 1200; ms += 16) f.step(ms);
  expect(hero!.style.clipPath).toBe(''); // restored when A settled (B does not use a clip)
  expect(hero!.style.opacity).toBe('');
  expect(f.host.find('card', a)[0]!.node.style.opacity).toBe(''); // the un-yielded source endpoint is restored, not left suppressed
  expect(liveChoreographyLeases()).toBe(0);
});

it('gap 5: a flight into an app-authored native <dialog> (top layer) renders in that surface\'s inert in-surface slot — no promotion, no z escalation — and leaves nothing behind', () => {
  const f = rig();
  const scope = {};
  f.node('card', scope);
  const dialog = document.createElement('dialog'); document.body.append(dialog);
  stops.push(() => { if (dialog.open) dialog.close(); dialog.remove(); });
  const hero = document.createElement('div'); hero.style.cssText = 'width:200px;height:120px;background:green'; dialog.append(hero);
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'card', side: 'shared', startMs: 0, durationMs: 300 }] }), scope, () => { dialog.showModal(); });
  stops.push(f.host.register(hero, 'card', scope)); // the committed render registers the destination
  f.step(16); f.step(32);
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]');
  expect(flight).not.toBeNull();
  const slot = flight!.closest<HTMLElement>('[data-composable-overlay-slot="native"]');
  expect(slot?.parentElement).toBe(dialog); // inside the top-layer surface, so it paints above the dialog's ::backdrop
  expect(slot!.inert).toBe(true); expect(slot!.getAttribute('aria-hidden')).toBe('true');
  expect(slot!.style.zIndex).toBe('');
  expect(dialog.matches(':modal')).toBe(true); expect(slot!.hasAttribute('popover')).toBe(false);
  for (let ms = 48; ms <= 1200; ms += 16) f.step(ms);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(hero.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
});

it('C3 unreachable layer (cross-document destination): that flight settles faithfully — no copy, live endpoints unsuppressed — while the run\'s other tracks keep running; balanced cleanup', async () => {
  const f = rig();
  const { enrollOverlayLayer } = await import('../../src/lib/actions/overlayLayers.js');
  const scope = {};
  f.node('card', scope);
  const other = f.node('other', scope);
  const frameEl = document.createElement('iframe'); document.body.append(frameEl); stops.push(() => frameEl.remove());
  const inner = frameEl.contentDocument!;
  const wrapper = inner.createElement('div'); inner.body.append(wrapper);
  const layer = enrollOverlayLayer(wrapper); stops.push(() => layer.dispose());
  const hero = inner.createElement('div'); hero.style.cssText = 'width:100px;height:60px'; wrapper.append(hero);
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
    { participant: 'card', side: 'shared', startMs: 0, durationMs: 300 },
    { participant: 'other', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0 } }
  ] }), scope, () => {});
  stops.push(f.host.register(hero as unknown as HTMLElement, 'card', scope));
  f.step(16); f.step(32); f.step(150);
  expect(f.host.diagnostics.some(event => (event as { reason?: string }).reason === 'layerUnreachable:crossDocument')).toBe(true);
  expect(document.querySelector('[data-route-representation="card"]')).toBeNull();
  expect(f.host.find('card', scope).find(entry => entry.node.ownerDocument === document)!.node.style.opacity).toBe(''); // source restored, live
  expect(hero.style.opacity).toBe(''); // destination never suppressed
  const fading = Number(other.style.opacity);
  expect(fading).toBeGreaterThan(0); expect(fading).toBeLessThan(1); // the other track keeps running
  for (let ms = 166; ms <= 1200; ms += 16) f.step(ms);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('R2 identity: a whole-run handoff keeps same-key participants of DIFFERENT scopes distinct (key + scope, not key alone)', async () => {
  const { registerOverlayScope } = await import('../../src/lib/application/renderer/choreography/overlay-scopes.js');
  const f = rig();
  const page = f.node('hero'); page.style.cssText += ';position:fixed;left:10px;top:10px';
  const other = {}; const scope = { select: (key: string) => ({ key, scope }) }; registerOverlayScope(scope, () => other);
  const scoped = f.node('hero', other); scoped.style.cssText += ';position:fixed;left:300px;top:10px';
  const plan = defineChoreography({ cueMs: 0, durationMs: 1000, tracks: [
    { participant: 'hero', side: 'shared', startMs: 0, durationMs: 1000 },
    { participant: scope.select('hero') as never, side: 'shared', startMs: 0, durationMs: 1000 }
  ] });
  f.host.local(plan, f.owner, () => {}); f.step(100);
  const lefts = () => [...document.querySelectorAll<HTMLElement>('[data-route-representation="hero"]')].map(copy => Math.round(copy.getBoundingClientRect().left)).sort((a, b) => a - b);
  const before = lefts();
  expect(before.length).toBe(2);
  f.host.local(plan, f.owner, () => {}); // whole-run handoff to a successor with the same plan
  expect(lefts()).toEqual(before); // each scope's flight continues its own identity (no swap, no loss)
  for (let ms = 116; ms <= 2400; ms += 16) f.step(ms);
  expect(document.querySelectorAll('[data-route-representation]').length).toBe(0);
  expect(liveChoreographyLeases()).toBe(0);
});

it('S6 two Hosts: runs on two Hosts (one page showing an open native modal) are independent — disposing one Host never touches the other\'s run, leases or copies', () => {
  const a = rig(), b = rig();
  const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal();
  stops.push(() => { if (dialog.open) dialog.close(); dialog.remove(); });
  const na = a.node('x'), nb = b.node('x');
  const fade = defineChoreography({ cueMs: 0, durationMs: 400, tracks: [{ participant: 'x', side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 } }] });
  a.host.local(fade, {}, () => {}); b.host.local(fade, b.owner, () => {});
  stops.push(b.host.register(nb, 'x', b.owner));
  b.step(200);
  const shownB = Number(nb.style.opacity);
  expect(shownB).toBeGreaterThan(0); expect(shownB).toBeLessThan(1);
  a.host.dispose(); // Host A torn down mid-flight
  expect(Number(nb.style.opacity)).toBe(shownB);
  b.step(300);
  expect(Number(nb.style.opacity)).toBeGreaterThan(shownB); // B keeps running
  for (let ms = 316; ms <= 1500; ms += 16) b.step(ms);
  expect(nb.style.opacity).toBe(''); expect(na.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
  expect(b.host.diagnostics.some(event => (event as { reason?: string }).reason === 'topLayer')).toBe(false);
});

it('C3 two native surfaces: a flight from a card in dialog A to a hero in dialog B (opened by the commit) starts in A\'s in-surface slot and lands in B\'s — no promotion; both slots removed, source restored, balanced', () => {
  const f = rig();
  const scope = {};
  const a = document.createElement('dialog'), b = document.createElement('dialog');
  document.body.append(a, b); a.showModal();
  stops.push(() => { for (const d of [a, b]) { if (d.open) d.close(); d.remove(); } });
  const card = document.createElement('div'); card.style.cssText = 'width:120px;height:60px;background:orange'; a.append(card);
  stops.push(f.host.register(card, 'card', scope));
  const hero = document.createElement('div'); hero.style.cssText = 'width:200px;height:100px;background:teal'; b.append(hero);
  f.host.local(defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'card', side: 'shared', startMs: 0, durationMs: 300 }] }), scope, () => {});
  const flight = document.querySelector<HTMLElement>('[data-route-representation="card"]')!;
  expect(flight.closest('dialog')).toBe(a); // starts in the source surface's slot (paints above A's ::backdrop)
  b.showModal(); // the destination surface opens (above A in the top layer)
  stops.push(f.host.register(hero, 'card', scope));
  f.step(16); f.step(32);
  expect(flight.closest('dialog')).toBe(b); // re-homed into the destination surface's slot
  expect(flight.closest('[data-composable-overlay-slot="native"]')!.hasAttribute('popover')).toBe(false);
  expect(a.querySelector('[data-composable-overlay-slot]')).toBeNull(); // the source surface's slot left with its last copy
  for (let ms = 48; ms <= 1200; ms += 16) f.step(ms);
  expect(document.querySelectorAll('[data-route-representation], [data-composable-overlay-slot]').length).toBe(0);
  expect(card.style.opacity).toBe(''); expect(hero.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
});

it('C-R1 whole-run successor: adopted active slide/scale continue from the displayed pose toward the declared end, then release balanced (no leak, no stale transform)', () => {
  const f = rig();
  const n = f.node('hero'); n.style.cssText = 'position:fixed;left:100px;top:100px;width:100px;height:40px';
  const plan = defineChoreography({ cueMs: 0, durationMs: 1000, tracks: [{ participant: 'hero', side: 'outgoing', startMs: 0, durationMs: 1000, easing: 'linear', opacity: { from: 1, to: 1 }, slide: { dx: 100, dy: 50 }, scale: { from: 1, to: 0.5 } }] });
  f.host.local(plan, f.owner, () => {}); f.step(400);
  const shown = { translate: n.style.translate, scale: Number(n.style.scale) };
  f.host.local(plan, f.owner, () => {}); f.step(400);
  expect(n.style.translate).toBe(shown.translate); expect(Number(n.style.scale)).toBeCloseTo(shown.scale, 6); // continuous at the handoff
  f.step(900); // the successor's own timeline: progressing from the adopted pose toward the declared end
  const dx = Number.parseFloat(n.style.translate), s = Number(n.style.scale);
  expect(dx).toBeGreaterThan(40); expect(dx).toBeLessThan(100);
  expect(s).toBeLessThan(0.8); expect(s).toBeGreaterThan(0.5);
  for (let ms = 916; ms <= 2600; ms += 16) f.step(ms);
  expect(n.style.translate).toBe(''); expect(n.style.scale).toBe(''); expect(n.style.opacity).toBe('');
  expect(liveChoreographyLeases()).toBe(0);
});
