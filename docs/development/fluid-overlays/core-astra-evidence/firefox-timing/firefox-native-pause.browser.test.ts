import { afterEach, describe, expect, it } from 'vitest';
const stops: (()=>void)[]=[];
afterEach(()=>{for(const stop of stops.splice(0).reverse())stop();});
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const mount=(html:string)=>{const root=document.createElement('div');root.innerHTML=html;document.body.append(root);stops.push(()=>root.remove());return root;};
describe('animation stack continuation after retirement native oracle diagnostic',()=>{
 it('native add animation pause exposes the same currentTime/style skew',async()=>{
  const root=mount('<span style="display:block;margin-left:10px"></span><span style="display:block;margin-left:10px"></span>');const [node,ref]=root.children;
  const frames=[{marginLeft:'0px'},{marginLeft:'40px'}];const timing={duration:1000,iterations:Infinity,composite:'add' as const};
  const a=(node as HTMLElement).animate(frames,timing);stops.push(()=>a.cancel());await sleep(120);await frame();await frame();await frame();await sleep(150);
  a.pause();await frame();await a.ready;const time=a.currentTime;const value=getComputedStyle(node!).marginLeft;
  const b=new Animation(new KeyframeEffect(ref!,frames,timing),document.timeline);b.currentTime=time;stops.push(()=>b.cancel());const want=getComputedStyle(ref!).marginLeft;
  await frame();const later=getComputedStyle(node!).marginLeft;a.currentTime=a.currentTime;const explicit=getComputedStyle(node!).marginLeft;
  console.info('[astra-native-control]',JSON.stringify({time,value,want,later,explicit,current:a.currentTime,underlying:(node as HTMLElement).style.marginLeft}));
  expect(parseFloat(explicit)).toBeCloseTo(parseFloat(want),5);
 });
});
