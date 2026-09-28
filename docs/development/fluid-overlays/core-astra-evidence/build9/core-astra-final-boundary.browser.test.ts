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



it('final boundary: whole-run successor preserves active slide and scale',()=>{
 const f=rig();const n=f.node('hero');n.style.cssText='position:fixed;left:100px;top:100px;width:100px;height:40px';
 const p=defineChoreography({cueMs:0,durationMs:1000,tracks:[{participant:'hero',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:1},slide:{dx:100,dy:50},scale:{from:1,to:.5}}]});
 f.host.local(p,f.owner,()=>{});f.step(400);const before=n.getBoundingClientRect();const oldPose={translate:n.style.translate,scale:n.style.scale};
 f.host.local(p,f.owner,()=>{});f.step(400);const after=n.getBoundingClientRect();
 console.log('[astra-whole-transform]',JSON.stringify({oldPose,newPose:{translate:n.style.translate,scale:n.style.scale},before:before.toJSON(),after:after.toJSON()}));
 expect.soft(after.x).toBeCloseTo(before.x,2);expect.soft(after.y).toBeCloseTo(before.y,2);expect.soft(after.width).toBeCloseTo(before.width,2);
});
