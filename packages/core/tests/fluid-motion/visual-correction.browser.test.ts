/** V1–V12 regressions. The first 15 cases are the independent Astra review's retained reproductions
 * (docs/development/fluid-motion/visual-astra-probe.ts), unchanged assertions; additional cases follow. */
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
it('local top-layer fallback still commits business state', () => {
  const f=rig(); f.node('x'); const dialog=document.createElement('div'); dialog.setAttribute('aria-modal','true'); document.body.append(dialog); stops.push(()=>dialog.remove()); let commits=0;
  expect(()=>f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]),f.owner,()=>commits++)).not.toThrow();
  expect(commits).toBe(1);
});
it('local incoming paint advances after its immediate commit', () => {
  const f=rig(); let incoming!:HTMLElement;
  f.host.local(f.plan([{participant:'new',side:'incoming',startMs:0,durationMs:200}]),f.owner,()=> {});
  incoming=f.node('new');
  expect(incoming.style.opacity).toBe('0'); f.step(300);
  expect(Number(getComputedStyle(incoming).opacity)).toBeGreaterThan(0.9);
});
it('shared recapture fallback releases suppression', async () => {
  const f=rig(); const source=f.node('x'); f.route(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]));
  // Form controls and 2D affine spaces are now represented; a perspective (non-affine) space remains unsupported.
  expect(source.style.opacity).toBe('0'); source.style.transform='perspective(200px) rotateY(30deg)'; await Promise.resolve(); f.step(100);
  expect(f.host.diagnostics).toContainEqual(expect.objectContaining({type:'recapture',outcome:'settled'}));
  expect(Number(getComputedStyle(source).opacity)).toBe(1);
});
it('outgoing copy applies own stable opacity once', () => {
  const f=rig(); const source=f.node('x'); source.style.opacity='0.5'; const run=f.route(f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,opacity:{from:1,to:0}}])); f.step(200); const real=Number(getComputedStyle(source).opacity); run.beforeRemoval(f.owner);
  const copy=f.rep('x'); const projected=Number(copy.style.opacity)*Number((copy.firstElementChild as HTMLElement).style.opacity);
  expect(projected).toBeCloseTo(real,6);
});
it('successor continues custom driver displayed pose', () => {
  const f=rig(); f.node('x'); const driver=defineVisualDriver({name:'review-driver',continuation:'pose',sample:({from,elapsedMs})=>({x:from[0]+elapsedMs})});
  const p=f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,driver}]); const first=f.route(p); f.step(200);
  const before=f.rep('x').style.transform; const adopted=first.handOff(); first.settle('superseded');
  const next=new ChoreographyRun(f.host,2 as never,p,f.owner,adopted.shared,()=>{},adopted.outgoing); stops.push(()=>next.settle('hostDisposed')); f.step(200);
  expect(f.rep('x').style.transform).toBe(before);
});
it('adopted outgoing lease keeps writing in successor', () => {
  const f=rig(); const node=f.node('x'); const p=f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,opacity:{from:1,to:0}}]); const first=f.route(p); f.step(200); const before=Number(node.style.opacity);
  const adopted=first.handOff(); first.settle('superseded'); const next=new ChoreographyRun(f.host,2 as never,p,f.owner,adopted.shared,()=>{},adopted.outgoing); stops.push(()=>next.settle('hostDisposed')); f.step(200); f.step(400);
  expect(Number(node.style.opacity)).toBeLessThan(before);
});
it('already-visible focus stays painted on a shared surface participant', () => {
  const f=rig(); const node=f.node('x'); node.tabIndex=0;
  node.focus(); expect(node.matches(':focus-visible')).toBe(true);
  f.route(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]));
  expect(Number(getComputedStyle(node).opacity)).toBe(1);
});
it('local choreography preserves its authored intermediate waypoint', () => {
  const f=rig(); const node=f.node('x'); const from=node.getBoundingClientRect().x;
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,easing:'linear',path:[{atMs:300,pose:{relativeTo:'source',dx:300}}]}]),f.owner,()=>{});
  f.step(16); f.step(300);
  const sample=f.host.diagnostics.filter(e=>e.type==='frame').at(-1)!;
  expect((sample as any).x).toBeCloseTo(from+300,3);
});
it('local choreography settles when reduced motion changes mid-run', () => {
  const f=rig(); f.node('x'); const old=window.matchMedia;
  const media=new EventTarget() as EventTarget & {matches:boolean}; media.matches=false;
  window.matchMedia=(()=>media as unknown as MediaQueryList); stops.push(()=>{window.matchMedia=old;});
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]),f.owner,()=>{});
  media.matches=true; media.dispatchEvent(new Event('change')); f.step(100);
  expect(f.host.resources().running).toBe(false);
});
it('custom-driver continuation preserves its forward velocity', () => {
  const f=rig(); f.node('x'); const driver=defineVisualDriver({name:'review-velocity',continuation:'pose',sample:({from,elapsedMs})=>({x:from[0]+elapsedMs})});
  const run=f.route(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,driver}])); f.step(200);
  run.lifecycle({type:'commitReserved',transaction:1 as never}); const owner={}; const dest=f.node('x',owner); run.registered({node:dest,key:'x',owner,role:'surface'}); run.rendered(owner); f.step(216);
  const frame=f.host.diagnostics.filter(e=>e.type==='frame').at(-1)!;
  expect((frame as any).vx).toBeCloseTo(1,5);
});
it('shared recapture keeps independently tracked control placeholders', async () => {
  const f=rig(); const outer=f.node('outer'); const child=document.createElement('button'); child.textContent='control'; outer.append(child);
  const release=f.host.register(child,'child',f.owner,'control'); stops.push(release);
  f.route(f.plan([{participant:'outer',side:'shared',startMs:0,durationMs:1000},{participant:'child',side:'shared',startMs:0,durationMs:1000}]));
  expect((f.rep('outer').firstElementChild!.lastElementChild as HTMLElement).style.visibility).toBe('hidden');
  outer.firstChild!.textContent='changed'; await Promise.resolve(); f.step(100);
  expect((f.rep('outer').firstElementChild!.lastElementChild as HTMLElement).style.visibility).toBe('hidden');
});
it('supported inline paint mutation invalidates a shared copy', async () => {
  const f=rig(); const source=f.node('x'); f.route(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]));
  source.style.backgroundColor='rgb(100, 120, 140)'; await Promise.resolve(); f.step(100);
  expect((f.rep('x').firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(100, 120, 140)');
});
it('scroll ownership notifications also rebase local runs', () => {
  const f=rig(); const node=f.node('x'); let scroll!:()=>void;
  f.host.setScrollSeam(()=>({subscribe(fn:()=>void){scroll=fn;return()=>{};},checkpoint(){}} as any)); f.host.attached();
  f.host.local(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}]),f.owner,()=>{}); f.step(16);
  const before=f.host.diagnostics.filter(e=>e.type==='retarget').length; node.style.marginLeft='50px'; scroll(); f.step(100);
  expect(f.host.diagnostics.filter(e=>e.type==='retarget').length).toBe(before+1);
});
it('a route run without scroll ownership rebases on native scroll', () => {
  const f=rig(); f.node('x'); f.host.current=f.owner;
  f.host.admitted({type:'admitted',transaction:1,motion:f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000}])} as any); f.step(0);
  f.host.notify({type:'commitReserved',transaction:1 as never}); const owner={}; const dest=f.node('x',owner); f.host.rendered(f.host.mount(owner));
  f.host.notify({type:'terminal',transaction:1,outcome:{type:'committed',route:'accepted'}} as any); f.step(16);
  const before=f.host.diagnostics.filter(e=>e.type==='retarget').length; dest.style.marginLeft='60px'; window.dispatchEvent(new Event('scroll')); f.step(100);
  expect(f.host.diagnostics.filter(e=>e.type==='retarget').length).toBe(before+1);
});
it('destination rebase does not accumulate clip leases', () => {
  const f=rig(); f.node('x'); const run=f.route(f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,content:'clipReveal'}]));
  run.lifecycle({type:'commitReserved',transaction:1 as never}); const destOwner={}; const dest=f.node('x',destOwner); run.registered({node:dest,key:'x',owner:destOwner,role:'surface'}); run.rendered(destOwner); run.lifecycle({type:'terminal',transaction:1 as never,outcome:{type:'committed',route:'accepted'} as never}); f.step(100); const before=f.host.resources().leases; run.rebase(); f.step(200);
  expect.soft(f.host.resources().leases).toBe(before);
  run.settle('completed'); expect(f.host.resources().leases).toBe(0);
});

// ---------------------------------------------------------------------------------------- additions
it('V7: adoption carries followed ancestor offset, non-default radius and partial representation opacity from the displayed state', () => {
  const f=rig(); const node=f.node('x');
  const p=f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,easing:'linear',radius:{from:[2,4,6,8],to:[20,20,20,20]},path:[{atMs:500,pose:{relativeTo:'source',dx:100},radius:[30,0,30,0]}]}]);
  const first=f.route(p); f.step(100);
  node.style.marginLeft='40px'; f.step(200);
  const before=f.rep('x'); const shown={transform:before.style.transform,radius:before.style.borderRadius,opacity:before.style.opacity};
  const adopted=first.handOff(); first.settle('superseded');
  expect(adopted.shared[0]!.displayed.x.value).toBeGreaterThan(adopted.shared[0]!.displayed.x.velocity); // includes +40 offset
  const next=new ChoreographyRun(f.host,2 as never,p,f.owner,adopted.shared,()=>{},adopted.outgoing); stops.push(()=>next.settle('hostDisposed')); f.step(200);
  expect(f.rep('x')).toBe(before);
  expect(f.rep('x').style.transform).toBe(shown.transform);
  expect(f.rep('x').style.borderRadius).toBe(shown.radius);
  expect(f.rep('x').style.opacity).toBe(shown.opacity);
  expect(node.style.opacity).toBe('0');
});
it('V11/V12: repeated rebases (native scroll, resize, late layout) keep one clip lease; settlement and Host disposal return every owned resource to zero', async () => {
  const f=rig(); f.node('x'); f.host.current=f.owner;
  f.host.admitted({type:'admitted',transaction:1,motion:f.plan([{participant:'x',side:'shared',startMs:0,durationMs:1000,content:'clipReveal'}])} as any); f.step(0);
  f.host.notify({type:'commitReserved',transaction:1 as never}); const destOwner={}; const dest=f.node('x',destOwner); f.host.rendered(f.host.mount(destOwner));
  f.host.notify({type:'terminal',transaction:1,outcome:{type:'committed',route:'accepted'}} as any); f.step(16);
  const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(undefined))));
  await frames(); // the ResizeObserver's initial delivery for the measured destination
  const leases=f.host.resources().leases; const retargets=()=>f.host.diagnostics.filter(e=>e.type==='retarget'&&(e as any).cause==='destination').length; const before=retargets();
  window.dispatchEvent(new Event('scroll')); f.step(100);
  window.dispatchEvent(new Event('resize')); f.step(150);
  dest.style.width='160px'; await frames(); f.step(200);
  expect(retargets()).toBe(before+3);
  expect(f.host.resources().leases).toBe(leases);
  f.host.dispose();
  expect(f.host.resources()).toMatchObject({ leases: 0, observers: 0, plane: false, running: false });
});
it('incoming slide: the real incoming element moves from its offset to layout with the track, alongside opacity; restored at settlement', () => {
  const f=rig();
  f.host.local(f.plan([{participant:'text',side:'incoming',startMs:0,durationMs:300,easing:'linear',opacity:{from:0,to:1},slide:{dy:24}}]),f.owner,()=>{});
  const text=f.node('text');
  expect(text.style.translate).toBe('0px 24px');
  f.step(150);
  expect(text.style.translate).toBe('0px 12px');
  expect(Number(text.style.opacity)).toBeCloseTo(0.5,6);
  f.step(400);
  expect(Number.parseFloat(text.style.translate.split(' ')[1] ?? '0')).toBe(0);
  f.step(1100);
  expect(text.style.translate).toBe('');
  expect(f.host.resources().leases).toBe(0);
  expect(()=>f.plan([{participant:'x',side:'shared',startMs:0,durationMs:100,slide:{dy:5}} as never])).toThrow('Only incoming and outgoing tracks declare slide');
});
it('V10: non-unit stable opacity is applied exactly once through recapture and destination crossfade', async () => {
  const f=rig(); const source=f.node('x'); source.style.opacity='0.6';
  const run=f.route(f.plan([{participant:'x',side:'outgoing',startMs:0,durationMs:1000,easing:'linear',opacity:{from:1,to:0}}])); f.step(100);
  source.textContent='changed'; await Promise.resolve(); f.step(200);
  expect(f.host.diagnostics).toContainEqual(expect.objectContaining({type:'recapture',participant:'x',outcome:'captured'}));
  const real=Number(getComputedStyle(source).opacity); run.beforeRemoval(f.owner);
  const copy=f.rep('x'); expect(Number(copy.style.opacity)*Number((copy.firstElementChild as HTMLElement).style.opacity)).toBeCloseTo(real,6);
  const g=rig(); g.node('y'); const shared=g.route(g.plan([{participant:'y',side:'shared',startMs:0,durationMs:300}]));
  shared.lifecycle({type:'commitReserved',transaction:1 as never}); const o={}; const dest=g.node('y',o); dest.style.opacity='0.5';
  shared.registered({node:dest,key:'y',owner:o,role:'surface'}); shared.rendered(o); shared.lifecycle({type:'terminal',transaction:1 as never,outcome:{type:'committed',route:'accepted'} as never});
  const seen:number[]=[]; for (let t=16;t<=1600;t+=16){ g.step(t); if(dest.style.opacity) seen.push(Number(dest.style.opacity)); }
  expect(Math.max(...seen)).toBeLessThanOrEqual(0.5+1e-9);
  expect(dest.style.opacity).toBe('0.5');
});
