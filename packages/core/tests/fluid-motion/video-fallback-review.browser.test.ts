// Regression: the independent video review's fallback repro incl. V3 (remaining-video-correction-astra-evidence, sha256 da38956481fbf4b9…), copied unchanged below.
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { videoProvider, liveMediaResources } from '../../src/lib/application/renderer/representation/builtins.js';
import type { ProvidedRepresentation } from '../../src/lib/application/renderer/representation/types.js';
const stops:Array<()=>void>=[];
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let clip:Blob, mime:string;
beforeAll(async()=>{
 const c=document.createElement('canvas');c.width=64;c.height=36;const g=c.getContext('2d')!;let hue=0;
 const interval=setInterval(()=>{g.fillStyle=`hsl(${hue=(hue+23)%360} 90% 50%)`;g.fillRect(0,0,64,36);},30);
 const stream=c.captureStream(30);mime=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))!;
 const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks:Blob[]=[];recorder.ondataavailable=e=>chunks.push(e.data);
 recorder.start();await sleep(1600);await new Promise<void>(resolve=>{recorder.onstop=()=>resolve();recorder.stop();});
 clearInterval(interval);stream.getTracks().forEach(t=>t.stop());clip=new Blob(chunks,{type:mime});
});
afterEach(()=>{for(const stop of stops.splice(0).reverse()) stop();vi.restoreAllMocks();expect(liveMediaResources()).toBe(0);});
async function source(){
 const video=document.createElement('video');video.loop=true;video.muted=false;video.volume=0;document.body.append(video);
 const mse=new MediaSource(),url=URL.createObjectURL(mse);video.src=url;stops.push(()=>{video.pause();video.remove();URL.revokeObjectURL(url);});
 await new Promise<void>(resolve=>mse.addEventListener('sourceopen',()=>resolve(),{once:true}));
 const buffer=mse.addSourceBuffer(mime.includes('codecs')?mime:'video/webm;codecs=vp8');buffer.appendBuffer(await clip.arrayBuffer());
 await new Promise<void>(resolve=>buffer.addEventListener('updateend',()=>resolve(),{once:true}));mse.endOfStream();await video.play();await sleep(150);return video;
}
function delayedReplayError(video:HTMLVideoElement){
 let replay!:HTMLVideoElement, error!:EventListener;
 const create=document.createElement.bind(document);
 const spy=vi.spyOn(document,'createElement').mockImplementation(((name:string, options?:ElementCreationOptions)=>{
  const node=create(name,options);
  if(name==='video'){
   replay=node as HTMLVideoElement;const add=replay.addEventListener.bind(replay);
   replay.addEventListener=((type:string,callback:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions)=>{if(type==='error'){error=callback as EventListener;}else add(type,callback,options);}) as typeof replay.addEventListener;
  }
  return node;
 }) as typeof document.createElement);
 const reasons:string[]=[];let rep:ProvidedRepresentation;
 try{rep=videoProvider.represent(video,{document,signal:new AbortController().signal,reducedMotion:false,diagnose:r=>reasons.push(r)}) as ProvidedRepresentation;}finally{spy.mockRestore();}
 document.body.append(rep!.node);stops.push(()=>{rep.dispose();rep.node.remove();});
 return {rep:rep!,replay,reasons,deliver:()=>error.call(replay,new Event('error'))};
}
function pixel(canvas:HTMLCanvasElement){return Array.from(canvas.getContext('2d')!.getImageData(20,10,1,1).data).join(',');}

it('late replay error after retirement activates the captured playing state; disposal owns exactly the fallback',async()=>{
 const video=await source();const f=delayedReplayError(video);expect(liveMediaResources()).toBe(2);
 const retained=f.rep.retire!()!;video.remove();await sleep(100);
 expect(video.paused).toBe(true);retained.frame?.(0);expect(video.muted,'dormant fallback touched the source').toBe(false);
 f.deliver();await f.rep.ready;expect(liveMediaResources()).toBe(1);expect(f.replay.isConnected).toBe(false);
 let running=true;const loop=()=>{if(running){retained.frame?.(0);requestAnimationFrame(loop);}};loop();stops.push(()=>{running=false;});
 await sleep(150);const mirror=f.rep.node.querySelectorAll('canvas')[1];const before=pixel(mirror);await sleep(500);
 expect(pixel(mirror),'late fallback has no decoded progression').not.toBe(before);expect(video.paused).toBe(false);expect(video.muted).toBe(true);
 running=false;retained.dispose();f.rep.dispose();expect(liveMediaResources()).toBe(0);expect(video.paused).toBe(true);expect(video.muted).toBe(false);
});

it('error delivered after disposal cannot reacquire, resume, or mute the source',async()=>{
 const video=await source();const f=delayedReplayError(video);const retained=f.rep.retire!()!;video.remove();await sleep(100);
 retained.dispose();expect(liveMediaResources()).toBe(0);const play=vi.spyOn(video,'play');
 f.deliver();retained.frame?.(0);f.rep.frame?.(0);await sleep(80);
 expect(play).not.toHaveBeenCalled();expect(liveMediaResources()).toBe(0);expect(video.paused).toBe(true);expect(video.muted).toBe(false);
});

it('encrypted-first settlement allocates no mirror or replay (policy branch, not protected playback qualification)',()=>{
 const video=document.createElement('video');Object.defineProperty(video,'mediaKeys',{value:{}});
 const before=liveMediaResources();const result=videoProvider.represent(video,{document,signal:new AbortController().signal,reducedMotion:false,diagnose:()=>{}});
 expect(result).toEqual({declined:'videoSourceUnqualified:encrypted',settle:true});expect(liveMediaResources()).toBe(before);
});

it('reclaim observed while replay error is pending stays permanent after late fallback activation',async()=>{
 const video=await source();const f=delayedReplayError(video);const retained=f.rep.retire!()!;
 video.remove();await sleep(100);
 document.body.append(video);retained.frame?.(0); // real run frame sees the owner's semantic element
 video.remove(); // later owner removal must not reactivate the old run
 f.deliver();retained.frame?.(1);await sleep(80);
 expect(video.muted,'late replay error recaptured an element already returned to its owner').toBe(false);
 expect(video.paused,'late replay error resumed a reclaimed element').toBe(true);
});
