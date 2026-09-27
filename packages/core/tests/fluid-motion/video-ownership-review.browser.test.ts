// Regression: the independent video review's V1/V2 repro (remaining-video-sources-astra-evidence, sha256 156e361495a5eeab…), copied unchanged below.
import { afterEach, expect, it } from 'vitest';
import { representDetachedVideo } from '../../src/lib/application/renderer/representation/video.js';
const stops: Array<() => void> = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
function setup(muted: boolean) {
  const source=document.createElement('video'); source.muted=muted;
  const url=URL.createObjectURL(new Blob([], {type:'video/webm'})); source.src=url;document.body.append(source);
  stops.push(()=>{source.remove();URL.revokeObjectURL(url);});
  const reasons:string[]=[];let live=0;
  const rep=representDetachedVideo(source,{document,signal:new AbortController().signal,reducedMotion:false,diagnose:r=>reasons.push(r)},{acquire(release){live++;let done=false;return()=>{if(!done){done=true;live--;release();}};}})!;
  stops.push(()=>rep.dispose());
  return {source,rep,reasons,live:()=>live};
}
it('same-task reclaim preserves an immediate owner unmute before volumechange dispatch',()=>{
  const f=setup(true);const retained=f.rep.retire!()!;f.source.remove();retained.frame?.(0);
  expect(f.source.muted).toBe(true);
  document.body.append(f.source);f.source.muted=false;
  retained.frame?.(1); // event delivery is asynchronous; no artificial delay before reclaim
  expect(f.reasons).toContain('videoElementReclaimed');
  expect(f.source.muted,'reclaim restoration overwrote the owner before volumechange dispatch').toBe(false);
});
it('reclaim before the first detached frame permanently relinquishes the old run',()=>{
  const f=setup(false);const retained=f.rep.retire!()!;
  f.source.remove();document.body.append(f.source);retained.frame?.(0);
  // The application later removes its reclaimed element for its own purposes.
  f.source.remove();retained.frame?.(1);
  expect(f.source.muted,'the old run resumed control after a completed reclaim').toBe(false);
  expect(f.reasons).toContain('videoElementReclaimed');
});
it('control: without owner mutation disposal restores the retirement-time mute',()=>{
  const f=setup(false);const retained=f.rep.retire!()!;f.source.remove();retained.frame?.(0);
  expect(f.source.muted).toBe(true);retained.dispose();
  expect(f.source.muted).toBe(false);expect(f.live()).toBe(0);
});
