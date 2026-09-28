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


it('review: partial conflicting incoming opacity adopts displayed state', () => {
 const f=rig(); const a={}, b={};
 const n=document.createElement('div'); n.style.cssText='width:100px;height:40px;background:red';document.body.append(n);stops.push(()=>n.remove());
 const p=defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'n',side:'incoming',startMs:0,durationMs:1000,easing:'linear',opacity:{from:0,to:1}}]});
 f.host.local(p,a,()=>{});stops.push(f.host.register(n,'n',a));f.step(400);
 const before=Number(n.style.opacity);
 f.host.local(p,b,()=>{});stops.push(f.host.register(n,'n',b));
 const after=Number(n.style.opacity);
 expect(before).toBeCloseTo(0.4,3);expect(after,`before=${before}, after=${after}`).toBeCloseTo(before,3);
});
it('review: partial conflicting shared flight adopts displayed geometry', () => {
 const f=rig();const n=f.node('hero');n.style.position='fixed';n.style.left='20px';n.style.top='20px';
 const p=defineChoreography({cueMs:900,durationMs:1000,tracks:[{participant:'hero',side:'shared',startMs:0,durationMs:1000,path:[{atMs:800,pose:{relativeTo:'source',dx:300,dy:0}}]}]});
 const run=new ChoreographyRun(f.host,1 as never,p,f.owner,[],()=>{});stops.push(()=>run.settle('hostDisposed'));f.step(0);f.step(400);
 const before=document.querySelector<HTMLElement>('[data-route-representation="hero"]')!.getBoundingClientRect().x;
 f.host.local(defineChoreography({cueMs:0,durationMs:300,tracks:[{participant:'hero',side:'shared',startMs:0,durationMs:300}]}),f.owner,()=>{});
 const after=document.querySelector<HTMLElement>('[data-route-representation="hero"]')!.getBoundingClientRect().x;
 expect(after,`before=${before}, after=${after}`).toBeCloseTo(before,1);
});

import { registerOverlayScope } from '../../src/lib/application/renderer/choreography/overlay-scopes.js';
it('review: whole-run handoff preserves a scoped shared participant', () => {
 const f=rig();const n=f.node('hero');
 const scope={select:(key:string)=>({key,scope})};registerOverlayScope(scope,()=>f.owner);
 const p=defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:scope.select('hero'),side:'shared',startMs:0,durationMs:1000,path:[{atMs:800,pose:{relativeTo:'source',dx:300}}]}]});
 f.host.local(p,f.owner,()=>{});f.step(100);
 expect(document.querySelectorAll('[data-route-representation="hero"]').length).toBe(1);
 f.host.local(p,f.owner,()=>{});
 expect(document.querySelectorAll('[data-route-representation="hero"]').length).toBe(1);
});

import { defineVisualDriver } from '../../src/lib/application/renderer/choreography/drivers.js';
it('review: partially yielded shared driver is disposed once', () => {
 const f=rig();f.node('hero');let disposed=0;
 const driver=defineVisualDriver({name:'astra-partial-yield-driver',continuation:'pose',sample:({from})=>({x:from[0]+100}),dispose:()=>disposed++});
 const p=defineChoreography({cueMs:900,durationMs:1000,tracks:[{participant:'hero',side:'shared',startMs:0,durationMs:1000,driver}]});
 const run=new ChoreographyRun(f.host,1 as never,p,f.owner,[],()=>{});stops.push(()=>run.settle('hostDisposed'));f.step(0);f.step(100);
 f.host.local(defineChoreography({cueMs:0,durationMs:300,tracks:[{participant:'hero',side:'shared',startMs:0,durationMs:300}]}),f.owner,()=>{});
 run.settle('superseded');f.host.dispose();expect(disposed).toBe(1);
});

it('review: an ambiguous route destination does not cancel an unrelated earlier node animation', () => {
 const f=rig();const destOwner={};const first=f.node('old',destOwner);
 f.host.local(defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'old',side:'incoming',startMs:0,durationMs:1000,easing:'linear',opacity:{from:0,to:1}}]}),destOwner,()=>{});
 // local incoming discovery is through committed registration
 stops.push(f.host.register(first,'old',destOwner));f.step(400);expect(Number(first.style.opacity)).toBeCloseTo(.4,3);
 f.node('hero');const route=new ChoreographyRun(f.host,2 as never,f.plan,f.owner,[],()=>{});stops.push(()=>route.settle('hostDisposed'));f.step(400);
 route.lifecycle({type:'commitReserved',transaction:2 as never});route.destinationMounted(destOwner);
 route.registered({node:first,key:'hero',owner:destOwner,role:'surface'});
 const second=f.node('hero',destOwner);route.registered({node:second,key:'hero',owner:destOwner,role:'surface'});
 expect(f.host.diagnostics.some(e=>e.type==='unsupported'&&e.reason==='destinationAmbiguous')).toBe(true);
 f.step(500);
 expect(Number(getComputedStyle(first).opacity),`inline=${first.style.opacity}, computed=${getComputedStyle(first).opacity}`).toBeCloseTo(.5,3);
});

it('review: rotated outgoing scale preserves a noncentral transform origin after removal', () => {
 const f=rig();const n=f.node('hero');n.style.cssText='position:absolute;left:100px;top:100px;width:100px;height:40px;background:red;transform:rotate(30deg);transform-origin:0 0';
 const oracle=n.cloneNode(true) as HTMLElement;document.body.append(oracle);stops.push(()=>oracle.remove());
 const p=defineChoreography({cueMs:500,durationMs:1000,tracks:[{participant:'hero',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},scale:{from:1,to:.5}}]});
 const run=new ChoreographyRun(f.host,1 as never,p,f.owner,[],()=>{});stops.push(()=>run.settle('hostDisposed'));f.step(0);f.step(400);f.step(416);run.beforeRemoval(f.owner);n.remove();f.step(700);oracle.style.scale='.65';
 const actual=document.querySelector<HTMLElement>('[data-route-representation="hero"]')!.getBoundingClientRect(),expected=oracle.getBoundingClientRect();
 expect(actual.x,`copy=${actual.x}, real=${expected.x}`).toBeCloseTo(expected.x,1);
 expect(actual.y,`copy=${actual.y}, real=${expected.y}`).toBeCloseTo(expected.y,1);
});
