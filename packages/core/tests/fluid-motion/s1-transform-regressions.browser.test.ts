/**
 * S1 browser witnesses (run in Chromium, Firefox and WebKit by vitest.fluid-motion.config.ts): CSS cubic-bezier
 * reference accuracy, channel easing through a real run (opacity, geometry, radius, clip, waypoint override), and
 * outgoing/incoming slide + scale composed with stable transforms, hit boxes, focus and lease cleanup.
 */
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { sampleEasing } from '../../src/lib/application/renderer/choreography/channels.js';
import type { ChannelEasing, CubicBezierPoints } from '../../src/lib/application/renderer/choreography/channel-types.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); expect(liveChoreographyLeases()).toBe(0); });
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
  const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); } };
  const node = (key: string, scoped: object = owner, tag = 'div', css = '') => {
    const node = document.createElement(tag); node.textContent = key; node.style.cssText = `position:absolute;left:100px;top:100px;width:100px;height:40px;background:rgb(20, 40, 60);margin:0;padding:0;border:0;${css}`; document.body.append(node);
    const release = host.register(node, key, scoped); stops.push(() => { release(); node.remove(); }); return node;
  };
  const plan = (tracks: Parameters<typeof defineChoreography>[0]['tracks']) => defineChoreography({ cueMs: 500, durationMs: 1000, tracks });
  const route = (p: ReturnType<typeof plan>) => { const run = new ChoreographyRun(host, 1 as never, p, owner, [], () => {}); stops.push(() => run.settle('hostDisposed')); step(0); return run; };
  const rep = (key: string) => document.querySelector<HTMLElement>(`[data-route-representation="${key}"]`)!;
  return { host, owner, step, node, plan, route, rep };
}
const progress = (easing: ChannelEasing, u: number) => sampleEasing(easing, u).progress;
const translateOf = (node: HTMLElement) => node.style.translate.split(' ').map(Number.parseFloat);


const center = (r: DOMRect) => [r.x + r.width/2, r.y + r.height/2];
function parentFor(node: HTMLElement, css: string) { const parent = document.createElement('div'); parent.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;${css}`; document.body.append(parent); parent.append(node); stops.push(() => parent.remove()); return parent; }

it('review: outgoing slide retains the ancestor scale in viewport displacement', () => {
  const f = rig(); const node = f.node('x'); parentFor(node, 'transform:scale(2)');
  const run = f.route(f.plan([{ participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:40} }]));
  f.step(400); f.step(416); run.beforeRemoval(f.owner); const copy = f.rep('x'); const at = center(copy.getBoundingClientRect());
  node.remove(); f.step(700); const later = center(copy.getBoundingClientRect());
  console.info('[review ancestor scale]', {at,later,expectedDX: 2*40*(.7-.416), actualDX:later[0]!-at[0]!});
  expect(later[0]!-at[0]!).toBeCloseTo(2*40*(.7-.416), 1);
});
it('review: outgoing slide retains the ancestor rotation in viewport displacement', () => {
  const f = rig(); const node = f.node('x'); parentFor(node, 'left:500px;transform:rotate(90deg)');
  const run = f.route(f.plan([{ participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:40} }]));
  f.step(400); f.step(416); run.beforeRemoval(f.owner); const copy=f.rep('x'), at=center(copy.getBoundingClientRect());
  node.remove(); f.step(700); const later=center(copy.getBoundingClientRect());
  console.info('[review ancestor rotate]',{at,later,dx:later[0]!-at[0]!,dy:later[1]!-at[1]!});
  expect(later[0]!-at[0]!).toBeCloseTo(0,1);
  expect(later[1]!-at[1]!).toBeCloseTo(40*(.7-.416),1);
});
it('review: noncentral scale origin preserves its trajectory after removal', () => {
  const f=rig(); const node=f.node('x'); node.style.transformOrigin='0 0';
  const run=f.route(f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},scale:{from:1,to:.5}}]));
  f.step(400); f.step(416); run.beforeRemoval(f.owner); const copy=f.rep('x'); const at=copy.getBoundingClientRect();
  node.remove();f.step(700); const later=copy.getBoundingClientRect();
  console.info('[review origin]', {at:at.toJSON(), later:later.toJSON()});
  expect(later.x).toBeCloseTo(at.x,1); expect(later.y).toBeCloseTo(at.y,1);
});
it('review: dynamic control returns motion to stable within focus settle bound', () => {
  const f=rig(); const node=f.node('x'); node.style.translate='8px 4px';node.style.scale='2';
  f.route(f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:40},scale:{from:1,to:.5}}]));
  f.step(400); node.tabIndex=0; node.focus(); f.step(416); f.step(536);
  expect(translateOf(node)).toEqual([8,4]); expect(Number(node.style.scale)).toBe(2);expect(document.activeElement).toBe(node);
});
it('review: affine own rotate preserves copy bounds and centered scale trajectory', () => {
  const f=rig();const node=f.node('x');node.style.transform='rotate(30deg)';
  const run=f.route(f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:40},scale:{from:1,to:.5}}]));
  f.step(400);f.step(416);run.beforeRemoval(f.owner);const copy=f.rep('x'),at=copy.getBoundingClientRect();
  node.remove();f.step(700);const later=copy.getBoundingClientRect();
  expect(later.width/at.width).toBeCloseTo(.65/.792,3);expect(center(later)[0]!-center(at)[0]!).toBeCloseTo(40*(.7-.416),1);
});
it('review: successor scale resolves stylesheet stable value while older lease is live', () => {
  const f=rig();const style=document.createElement('style');style.textContent='.review-stable-scale {scale:2}';document.head.append(style);stops.push(()=>style.remove());
  const node=f.node('x');node.className='review-stable-scale';
  const p=f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},scale:{from:1,to:.5}}]);
  f.route(p);f.step(500);expect(Number(node.style.scale)).toBe(1.5);
  const next=new ChoreographyRun(f.host,2 as never,p,f.owner,[],()=>{});stops.push(()=>next.settle('hostDisposed'));f.step(500);f.step(1000);f.step(1499);
  console.info('[review stable fallback]',{scale:node.style.scale,expected:2*(1-.5*.999),diag:f.host.diagnostics});
  expect(Number(node.style.scale)).toBeCloseTo(2*(1-.5*.999),3);
});
