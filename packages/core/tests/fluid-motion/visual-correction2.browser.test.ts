/** C1–C4 regressions: the independent Astra follow-up probes (docs/development/fluid-motion/visual-correction-astra-probe.ts), unchanged assertions, plus R1–R4 and incoming-control witnesses. */
import { page } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { defineVisualDriver } from '../../src/lib/application/renderer/choreography/drivers.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
function rig() {
  let now = 0, id = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: VisualClock = {
    now: () => now,
    frame: fn => { frames.set(++id, fn); return id; },
    cancelFrame: id => { frames.delete(id as number); },
    timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; },
    clearTimeout: id => { timers.delete(id as number); }
  };
  const host = new RouteHost(undefined, window, clock, {});
  const owner = {};
  stops.push(() => host.dispose());
  const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [id, t] of timers) if(t.at <= now) { timers.delete(id); t.fn(); } };
  const node = (key: string, scoped = owner) => {
    const node = document.createElement('div'); node.textContent = key; node.style.cssText = 'width:100px;height:40px;background:rgb(20, 40, 60)'; document.body.append(node);
    const release = host.register(node,key,scoped); stops.push(() => { release(); node.remove(); }); return node;
  };
  const plan = (tracks: Parameters<typeof defineChoreography>[0]['tracks']) => defineChoreography({cueMs:500,durationMs:1000,tracks});
  const route = (p: ReturnType<typeof plan>) => { const run = new ChoreographyRun(host,1 as never,p,owner,[],()=>{}); stops.push(() => run.settle('hostDisposed')); step(0); return run; };
  const rep = (key: string) => document.querySelector<HTMLElement>(`[data-route-representation="${key}"]`)!;
  return {host,owner,step,node,plan,route,rep};
}
it('V2: local destination gaining a real control releases its earlier suppression', () => {
  const f=rig(); const source=f.node('x');
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]),f.owner,()=>{const button=document.createElement('button');button.textContent='Collapse';source.append(button);});
  f.step(16);
  expect(Number(getComputedStyle(source).opacity)).toBe(1);
});
it('V2: visible focus arriving after local destination measurement stays painted', () => {
  const f=rig(); const source=f.node('x'); source.tabIndex=-1;
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]),f.owner,()=>{}); f.step(16);
  source.focus(); expect(source.matches(':focus-visible')).toBe(true); f.step(100); f.step(240);
  expect(Number(getComputedStyle(source).opacity)).toBe(1);
});
it('V4: local radius and clip retain authored waypoint with geometry', () => {
  const f=rig(); f.node('x');
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,easing:'linear',radius:{from:0,to:0},clip:{from:[0,0,0,0],to:[0,0,0,0]},path:[{atMs:300,pose:{relativeTo:'source',dx:300},radius:30,clip:[20,20,20,20]}]}]),f.owner,()=>{});
  f.step(16); f.step(300);
  const sample=f.host.diagnostics.filter(e=>e.type==='frame').at(-1)! as any;
  expect.soft(sample.x).toBeCloseTo(300,5);
  expect.soft(sample.radius[0]).toBeCloseTo(30,5);
  expect(sample.clip[0]).toBeCloseTo(20,5);
});
it('V7: adopted radius continues through its future authored waypoint', () => {
  const f=rig(); f.node('x'); const p=f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,easing:'linear',radius:{from:0,to:0},path:[{atMs:300,pose:{relativeTo:'source',dx:300},radius:30}]}]);
  const first=f.route(p);f.step(100);const adopted=first.handOff();first.settle('superseded');
  const next=new ChoreographyRun(f.host,2 as never,p,f.owner,adopted.shared,()=>{},adopted.outgoing);stops.push(()=>next.settle('hostDisposed'));f.step(100);f.step(400);
  const sample=f.host.diagnostics.filter(e=>e.type==='frame').at(-1)! as any;
  expect(sample.radius[0]).toBeCloseTo(30,5);
});
it('incoming slide preserves existing stable CSS translate throughout its path', () => {
  const f=rig();f.host.local(f.plan([{participant:'text',side:'incoming',startMs:0,durationMs:300,easing:'linear',slide:{dx:24}}]),f.owner,()=>{});
  const node=document.createElement('div');node.textContent='incoming';node.style.cssText='width:100px;height:40px;translate:20px 10px';document.body.append(node);
  const release=f.host.register(node,'text',f.owner);stops.push(()=>{release();node.remove();});
  expect.soft(node.style.translate).toBe('44px 10px'); f.step(300);expect(node.style.translate).toBe('20px 10px');
});
it('V1/V6: top-layer fallback disposes adopted shared state and restores paint', () => {
  const f=rig();const source=f.node('x');const p=f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]);
  f.host.local(p,f.owner,()=>{});f.step(100);
  const modal=document.createElement('div');modal.setAttribute('aria-modal','true');document.body.append(modal);stops.push(()=>modal.remove());
  let commits=0;f.host.local(p,f.owner,()=>commits++);expect(commits).toBe(1);
  expect.soft(source.style.opacity).toBe('');expect.soft(f.host.resources().representations).toBe(0);
  f.host.dispose();expect(f.host.resources().leases).toBe(0);
});

// ------------------------------------------------------------------ R1–R4 and incoming control (core rig)
const lastFrame = (f: ReturnType<typeof rig>, key: string) => f.host.diagnostics.filter(e => e.type === 'frame' && (e as any).participant === key).at(-1) as any;
const frameAt = (f: ReturnType<typeof rig>, key: string, t: number) => (f.host.diagnostics.filter(e => e.type === 'frame' && (e as any).participant === key) as any[]).reduce((best, e) => Math.abs(e.t - t) < Math.abs(best.t - t) ? e : best);

it('R1: a viewport resize before the waypoint re-resolves the viewport-relative pose (local run)', async () => {
  const f = rig(); f.node('x');
  const original = { width: window.innerWidth, height: window.innerHeight };
  stops.push(() => { void page.viewport(original.width, original.height); });
  f.host.local(f.plan([{ participant: 'x', side: 'shared', startMs: 0, durationMs: 1000, easing: 'linear', path: [{ atMs: 300, pose: { relativeTo: 'viewport', x: 0.1, y: 0.1, width: 0.5, height: 0.3 } }] }]), f.owner, () => {});
  f.step(16); f.step(60);
  await page.viewport(600, 700);
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  expect(window.innerWidth).toBe(600);
  f.step(120); f.step(300);
  expect(frameAt(f, 'x', 300).width).toBeCloseTo(0.5 * 600, 0);
});

it('R2: a position-only late shift of the measured destination is followed to the real destination', () => {
  const f = rig(); f.node('x'); f.host.current = f.owner;
  f.host.admitted({ type: 'admitted', transaction: 1, motion: f.plan([{ participant: 'x', side: 'shared', startMs: 0, durationMs: 1000 }]) } as any); f.step(0);
  f.host.notify({ type: 'commitReserved', transaction: 1 as never }); const owner = {}; const dest = f.node('x', owner); f.host.rendered(f.host.mount(owner));
  f.host.notify({ type: 'terminal', transaction: 1, outcome: { type: 'committed', route: 'accepted' } } as any); f.step(16);
  dest.style.marginTop = '140px';
  for (let t = 32; t <= 1400; t += 16) f.step(t);
  const real = dest.getBoundingClientRect();
  const end = f.host.diagnostics.filter(e => e.type === 'frame').at(-1) as any;
  expect(Math.abs(end.y - real.y)).toBeLessThanOrEqual(1);
});

it('R3: within-page shared tracks start from the source and hold it before startMs', () => {
  const f = rig(); const node = f.node('x'); const from = node.getBoundingClientRect();
  f.host.local(f.plan([{ participant: 'x', side: 'shared', startMs: 90, durationMs: 600, content: 'translate' }]), f.owner, () => { node.style.marginLeft = '700px'; node.style.width = '300px'; });
  f.step(9); f.step(50); f.step(85);
  const frames = f.host.diagnostics.filter(e => e.type === 'frame') as any[];
  expect(frames[0].x).toBeCloseTo(from.x, 3);
  for (const frame of frames.filter(e => e.t < 85)) { expect(frame.x).toBeCloseTo(from.x, 3); expect(frame.width).toBeCloseTo(from.width, 3); }
  f.step(400);
  expect(lastFrame(f, 'x').x).toBeGreaterThan(from.x + 50);
});

it('R4: under crossfade the painted copied surface fills the resizing representation; children keep their size (no stretched text)', () => {
  const f = rig();
  const card = document.createElement('article'); card.style.cssText = 'display:block;width:160px;height:90px;background:rgb(200,120,40)';
  const title = document.createElement('span'); title.textContent = 'Card title'; title.style.cssText = 'display:block;width:120px'; card.append(title); document.body.append(card);
  const release = f.host.register(card, 'card', f.owner); stops.push(() => { release(); card.remove(); });
  f.route(f.plan([{ participant: 'card', side: 'shared', startMs: 0, durationMs: 1000, easing: 'linear', path: [{ atMs: 300, pose: { relativeTo: 'viewport', x: 0.1, y: 0.1, width: 0.6, height: 0.5 } }] }]));
  f.step(300);
  const wrapper = f.rep('card').getBoundingClientRect();
  const painted = (f.rep('card').firstElementChild as HTMLElement).getBoundingClientRect();
  const child = (f.rep('card').firstElementChild!.firstElementChild as HTMLElement).getBoundingClientRect();
  expect(wrapper.width).toBeCloseTo(window.innerWidth * 0.6, 0);
  expect(painted.width).toBeCloseTo(wrapper.width, 0);
  expect(painted.height).toBeCloseTo(wrapper.height, 0);
  expect(getComputedStyle(f.rep('card').firstElementChild as HTMLElement).backgroundColor).toBe('rgb(200, 120, 40)');
  expect(child.width).toBeCloseTo(120, 0);
  // translate keeps the source box (position-only policy).
  const g = rig(); g.node('y');
  g.route(g.plan([{ participant: 'y', side: 'shared', startMs: 0, durationMs: 1000, content: 'translate', path: [{ atMs: 300, pose: { relativeTo: 'source', dw: 200 } }] }])); g.step(300);
  expect((g.rep('y').firstElementChild as HTMLElement).getBoundingClientRect().width).toBeCloseTo(100, 0);
});

it('C1 (guidance): an incoming control with opacity 1→0 and slide never paints below its stable opacity', () => {
  const f = rig();
  f.host.local(f.plan([{ participant: 'btn', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 }, slide: { dx: 24 } }]), f.owner, () => {});
  const button = document.createElement('button'); button.textContent = 'Act'; document.body.append(button);
  const release = f.host.register(button, 'btn', f.owner, 'control'); stops.push(() => { release(); button.remove(); });
  const seen: number[] = [Number(getComputedStyle(button).opacity)];
  for (let t = 16; t <= 1200; t += 16) { f.step(t); seen.push(Number(getComputedStyle(button).opacity)); }
  expect(Math.min(...seen)).toBe(1);
  expect(button.style.translate).toBe('');
});

// ------------------------------------------------------------- follow-up: replan basis and start
it('replan retains a delayed track start: no movement before startMs after a viewport resize', async () => {
  const f = rig(); const node = f.node('x'); const from = node.getBoundingClientRect();
  const original = { width: window.innerWidth, height: window.innerHeight };
  stops.push(() => { void page.viewport(original.width, original.height); });
  f.host.local(f.plan([{ participant: 'x', side: 'shared', startMs: 200, durationMs: 800, easing: 'linear', path: [{ atMs: 400, pose: { relativeTo: 'viewport', x: 0.2, y: 0.2, width: 0.4, height: 0.2 } }] }]), f.owner, () => {});
  f.step(16); f.step(40);
  await page.viewport(640, 700);
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  f.step(60); f.step(100); f.step(199);
  for (const frame of (f.host.diagnostics.filter(e => e.type === 'frame') as any[]).filter(e => e.t < 200)) { expect(frame.x).toBeCloseTo(from.x, 6); expect(frame.width).toBeCloseTo(from.width, 6); }
  f.step(400);
  expect(frameAt(f, 'x', 400).width).toBeCloseTo(0.4 * 640, 0);
});
it('replan keeps the original source basis for source-relative poses after a local same-node commit', async () => {
  const f = rig(); const node = f.node('x'); const from = node.getBoundingClientRect();
  const original = { width: window.innerWidth, height: window.innerHeight };
  stops.push(() => { void page.viewport(original.width, original.height); });
  f.host.local(f.plan([{ participant: 'x', side: 'shared', startMs: 0, durationMs: 1000, easing: 'linear', path: [{ atMs: 300, pose: { relativeTo: 'source', dx: 80 } }, { atMs: 600, pose: { relativeTo: 'viewport', x: 0.1, y: 0.1, width: 0.3, height: 0.2 } }] }]), f.owner, () => { node.style.marginLeft = '500px'; });
  f.step(16); f.step(60);
  await page.viewport(660, 700);
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  f.step(100); f.step(300);
  expect(frameAt(f, 'x', 300).x).toBeCloseTo(from.x + 80, 6);
  f.step(600);
  expect(frameAt(f, 'x', 600).width).toBeCloseTo(0.3 * 660, 0);
});

// ---------------------------------------------- F1: outgoing native controls hold-then-fade (integrated review)
// The first two cases are integrated-review-evidence/control-probe.ts, unchanged assertions.
it('integrated: outgoing surface containing a real button holds stable paint before cue', () => {
  const f = rig(); const source = f.node('x');
  const button = document.createElement('button'); button.textContent = 'Save'; source.append(button);
  f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 100, opacity: {from: 1, to: 0} }]));
  f.step(200);
  expect(button.isConnected).toBe(true); expect(button.disabled).toBe(false);
  expect(getComputedStyle(source).opacity).toBe('1');
});
it('integrated: outgoing surface gaining a button holds stable paint before cue', () => {
  const f = rig(); const source = f.node('x');
  f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 100, opacity: {from: 1, to: 0} }]));
  const button = document.createElement('button'); button.textContent = 'Save'; source.append(button);
  f.step(200);
  expect(getComputedStyle(source).opacity).toBe('1');
});
it('F1: after reveal the copy of a held native control fades within the documented post-reveal bound; focus keeps the real control painted', async () => {
  const f = rig(); const source = f.node('x');
  const button = document.createElement('button'); button.textContent = 'Save'; source.append(button);
  const run = f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 100, opacity: {from: 1, to: 0} }]));
  f.step(50);
  button.focus({ focusVisible: true } as FocusOptions);
  f.step(100); f.step(300);
  expect(getComputedStyle(source).opacity).toBe('1');
  // Positive control: a plain surface with the same track has faded out by now.
  const g = rig(); const plain = g.node('y'); g.route(g.plan([{ participant: 'y', side: 'outgoing', startMs: 0, durationMs: 100, opacity: {from: 1, to: 0} }])); g.step(200);
  expect(Number(getComputedStyle(plain).opacity)).toBe(0);
  run.beforeRemoval(f.owner);
  const copy = f.rep('x');
  expect(Number(copy.style.opacity)).toBe(1);
  f.step(380);
  expect(Number(copy.style.opacity)).toBeGreaterThan(0);
  expect(Number(copy.style.opacity)).toBeLessThan(1);
  f.step(460);
  expect(Number(copy.style.opacity)).toBe(0);
});
