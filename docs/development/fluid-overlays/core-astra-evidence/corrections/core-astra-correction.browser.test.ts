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



import { defineVisualDriver } from '../../src/lib/application/renderer/choreography/drivers.js';
it('correction review: unreachable destination disposes its shared driver exactly once',async()=>{
 const f=rig(); const {enrollOverlayLayer}=await import('../../src/lib/actions/overlayLayers.js');
 f.node('card'); let disposed=0;
 const driver=defineVisualDriver({name:'astra-unreachable-disposal',continuation:'pose',sample:({from})=>({x:from[0]+10}),dispose:()=>disposed++});
 const iframe=document.createElement('iframe');document.body.append(iframe);stops.push(()=>iframe.remove());
 const inner=iframe.contentDocument!;const wrapper=inner.createElement('div');inner.body.append(wrapper);const layer=enrollOverlayLayer(wrapper);stops.push(()=>layer.dispose());
 const hero=inner.createElement('div');hero.style.cssText='width:100px;height:40px';wrapper.append(hero);
 f.host.local(defineChoreography({cueMs:0,durationMs:300,tracks:[{participant:'card',side:'shared',startMs:0,durationMs:300,driver}]}),f.owner,()=>{});
 stops.push(f.host.register(hero as unknown as HTMLElement,'card',f.owner));f.step(16);f.step(32);
 expect(f.host.diagnostics.some(e=>(e as {reason?:string}).reason==='layerUnreachable:crossDocument')).toBe(true);
 expect(document.querySelector('[data-route-representation="card"]')).toBeNull();
 f.step(1000);f.host.dispose();expect(disposed).toBe(1);
});
it('correction review: partial incoming conflict adopts displayed slide and scale',()=>{
 const f=rig();const a={},b={};const n=document.createElement('div');n.style.cssText='position:fixed;left:100px;top:100px;width:100px;height:40px';document.body.append(n);stops.push(()=>n.remove());
 const p=defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'n',side:'incoming',startMs:0,durationMs:1000,easing:'linear',slide:{dx:100,dy:50},scale:{from:.5,to:1}}]});
 f.host.local(p,a,()=>{});stops.push(f.host.register(n,'n',a));f.step(400);
 const before=n.getBoundingClientRect();f.host.local(p,b,()=>{});stops.push(f.host.register(n,'n',b));f.step(400);
 const after=n.getBoundingClientRect();expect(after.x).toBeCloseTo(before.x,2);expect(after.y).toBeCloseTo(before.y,2);expect(after.width).toBeCloseTo(before.width,2);
});

it('correction review: reduced resting transforms compose with stylesheet base like animated transforms',()=>{
 const f=rig();const n=f.node('card');n.className='astra-css-base';const sheet=document.createElement('style');sheet.textContent='.astra-css-base { scale: 2; translate: 20px 10px; }';document.head.append(sheet);stops.push(()=>sheet.remove());
 (f.host as unknown as {reduced:()=>boolean}).reduced=()=>true;
 const instance={owner:{},content:undefined,backdrop:undefined};
 f.host.overlayTransition({handle:{} as never,instance,kind:'present',explicit:false,scope:f.owner,complete:()=>{},plan:defineChoreography({cueMs:0,durationMs:300,tracks:[{participant:'card',side:'outgoing',startMs:0,durationMs:300,opacity:{from:1,to:.6},scale:{from:1,to:.95},slide:{dx:12,dy:5},lifetime:'overlay'}]})});
 expect.soft(Number(getComputedStyle(n).scale)).toBeCloseTo(1.9,3);expect.soft(getComputedStyle(n).translate).toBe('32px 15px');
});
it('correction review: retiring reaction source owner releases retained channels while shell overlay survives',()=>{
 const f=rig();const n=f.node('card');(f.host as unknown as {reduced:()=>boolean}).reduced=()=>true;
 const instance={owner:{},content:undefined,backdrop:undefined};
 f.host.overlayTransition({handle:{} as never,instance,kind:'present',explicit:false,scope:f.owner,complete:()=>{},plan:defineChoreography({cueMs:0,durationMs:300,tracks:[{participant:'card',side:'outgoing',startMs:0,durationMs:300,opacity:{from:1,to:.6},lifetime:'overlay'}]})});
 expect(liveChoreographyLeases()).toBe(1);f.host.retire(f.owner);n.remove();
 expect(liveChoreographyLeases()).toBe(0);
});
