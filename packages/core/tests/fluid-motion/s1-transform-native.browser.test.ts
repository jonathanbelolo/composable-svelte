import {afterEach,expect,it} from 'vitest';
import {RouteHost} from '../../src/lib/application/renderer/choreography/route-host.js';
import {ChoreographyRun,type VisualClock} from '../../src/lib/application/renderer/choreography/run.js';
import {defineChoreography} from '../../src/lib/application/renderer/choreography/plan.js';
import {fluidMotion} from '../../src/lib/application/renderer/choreography/engine.js';
import {liveNativeSessions} from '../../src/lib/application/renderer/representation/native-snapshot.js';
const stops:(()=>void)[]=[];
afterEach(()=>{for(const stop of stops.splice(0).reverse())stop();expect(liveNativeSessions()).toBe(0)});
const mount=(html:string)=>{const root=document.createElement('div');root.innerHTML=html;document.body.append(root);stops.push(()=>root.remove());return root};
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  function nativeRig() {
    let now = 0, id = 0;
    const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
    const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
    const config = fluidMotion({ nativeSnapshot: 'namedParticipants' });
    const host = new RouteHost(undefined, window, clock, {}, config);
    stops.push(() => host.dispose());
    const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
    const owner = {};
    const root = mount(`<div id="rp-embed" style="position:absolute;left:30px;top:30px;width:160px;height:90px;padding:10px;background:#1e293b"><iframe sandbox srcdoc="<body style='margin:0;background:#16a34a'></body>" style="display:block;width:140px;height:70px;border:0"></iframe></div><button id="rp-real" style="position:absolute;left:30px;top:300px;width:120px;height:40px">real</button>`);
    const participant = root.querySelector<HTMLElement>('#rp-embed')!;
    stops.push(host.register(participant, 'embed', owner));
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 900, tracks: [{ participant: 'embed', side: 'outgoing', startMs: 0, durationMs: 800, opacity: { from: 1, to: 1 }, slide: { dx: 100, dy: -40 }, scale: { from: 1, to: 0.5 } }] }), owner, [], () => {}, new Map(), undefined, config);
    stops.push(() => run.settle('hostDisposed'));
    // The route commit removes the outgoing page inside the transition's update callback.
    let committed = 0;
    (host as unknown as { cue: () => void }).cue = () => { committed++; run.beforeRemoval(owner); participant.remove(); };
    return { host, step, run, root, committed: () => committed };
  }

it('review: actual native snapshot group follows outgoing slide and scale after commit',async()=>{
 const f=nativeRig();f.step(0);
 const available=typeof(document as Document & {startViewTransition?:unknown}).startViewTransition==='function';
 if(!available){console.info('[review native availability]',navigator.userAgent,'unavailable');expect(f.host.diagnostics).toContainEqual(expect.objectContaining({provider:'native',reason:'nativeSnapshotUnavailable:api'}));f.step(120);expect(f.committed()).toBe(1);return;}
 f.step(120);for(let i=0;i<10&&!f.committed();i++)await frame();expect(f.committed()).toBe(1);
 for(let i=0;i<4;i++){await frame();f.step(140+i*16)}
 f.step(500);await frame();
 const animation=document.getAnimations().find(a=>(a.effect as KeyframeEffect|null)?.pseudoElement?.startsWith('::view-transition-group(composable-native-'))!;
 expect(animation).toBeDefined();const effect=animation.effect as KeyframeEffect;const key=effect.getKeyframes()[0]!;
 const matrix=new DOMMatrix(String(key.transform));
 const rep=document.querySelector<HTMLElement>('[data-route-representation="embed"]')!;const r=rep.getBoundingClientRect();
 const scale=r.width/180;
 console.info('[review native motion]',navigator.userAgent,{key,rect:r.toJSON(),scale,matrix:[matrix.a,matrix.d,matrix.e,matrix.f]});
 expect(matrix.a).toBeCloseTo(scale,4);expect(matrix.d).toBeCloseTo(scale,4);
 expect(matrix.e).toBeCloseTo(r.x+10*scale,1);expect(matrix.f).toBeCloseTo(r.y+10*scale,1);
 expect(scale).toBeLessThan(.9);expect(r.x).toBeGreaterThan(50);
 f.run.settle('completed');expect(document.querySelector('style[data-composable-native-snapshot]')).toBeNull();
});
