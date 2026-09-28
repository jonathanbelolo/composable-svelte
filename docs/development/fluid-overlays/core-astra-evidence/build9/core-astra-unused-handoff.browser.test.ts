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



it('final cleanup: a successor not using transforms releases them and restores the base',()=>{
 const f=rig();const n=f.node('hero');n.style.cssText='position:fixed;left:100px;top:100px;width:100px;height:40px;scale:2;translate:5px 7px';
 const p=defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'hero',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:100,dy:50},scale:{from:1,to:.5}}]});
 f.host.local(p,f.owner,()=>{});f.step(400);
 f.host.local(defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'hero',side:'outgoing',startMs:0,durationMs:1000,opacity:{from:1,to:1}}]}),f.owner,()=>{});f.step(400);
 expect(n.style.scale).toBe('2');expect(n.style.translate).toBe('5px 7px');f.host.dispose();expect(liveChoreographyLeases()).toBe(0);
});
it('final cleanup: a reduced route successor discards every handed transform lease',()=>{
 const f=rig();const n=f.node('hero');n.style.cssText='position:fixed;left:100px;top:100px;width:100px;height:40px';
 f.host.rendered(f.host.mount(f.owner));
 const p=defineChoreography({cueMs:500,durationMs:1000,tracks:[{participant:'hero',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:100,dy:50},scale:{from:1,to:.5}}]});
 expect(f.host.admitted({type:'admitted',transaction:1 as never,motion:p} as never)).toBe(true);f.step(0);f.step(400);
 expect(n.style.scale).toBe('0.8');
 (f.host as unknown as {reduced:()=>boolean}).reduced=()=>true;
 expect(f.host.admitted({type:'admitted',transaction:2 as never,motion:p} as never)).toBe(false);
 f.host.dispose();console.log('[astra-discard]',JSON.stringify({translate:n.style.translate,scale:n.style.scale,leases:liveChoreographyLeases()}));
 expect.soft(n.style.translate).toBe('');expect.soft(n.style.scale).toBe('');expect.soft(liveChoreographyLeases()).toBe(0);
});
