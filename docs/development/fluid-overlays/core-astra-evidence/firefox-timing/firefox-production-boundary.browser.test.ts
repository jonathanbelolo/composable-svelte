import {afterEach,expect,it} from 'vitest';
import {Representer} from '../../src/lib/application/renderer/representation/representer.js';
const stops:(()=>void)[]=[];afterEach(()=>{for(const stop of stops.splice(0).reverse())stop();});
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const nums=(v:string)=>(v.match(/-?[\d.]+(e-?\d+)?/g)??[]).map(Number);
const cases=[
 {name:'add margin',property:'margin-left',style:'margin-left:10px',effects:[{frames:[{marginLeft:'0px'},{marginLeft:'40px'}],options:{duration:1000,iterations:Infinity,composite:'add'}}]},
 {name:'replace plus add margin',property:'margin-left',style:'margin-left:5px',effects:[{frames:[{marginLeft:'40px'}],options:{duration:1000,iterations:Infinity}},{frames:[{marginLeft:'0px'},{marginLeft:'12px'}],options:{duration:700,iterations:Infinity,composite:'add'}}]},
 {name:'implicit opacity easing',property:'opacity',style:'opacity:0.9',effects:[{frames:[{offset:.5,opacity:.5,easing:'ease-in'},{opacity:.1}],options:{duration:1000,iterations:Infinity}}]},
 {name:'implicit transform',property:'transform',style:'transform:translateX(10px) rotate(5deg)',effects:[{frames:[{transform:'translateX(60px) rotate(20deg)'}],options:{duration:1000,iterations:Infinity}}]}
];
for(const c of cases)it(`running retirement has no test pause or clock rewrite: ${c.name}`,async()=>{
 const root=document.createElement('div');root.innerHTML=`<span style="display:block;width:20px;height:20px;${c.style}"></span>`;document.body.append(root);stops.push(()=>root.remove());
 const node=root.firstElementChild as HTMLElement;
 const sources=c.effects.map(e=>node.animate(e.frames as Keyframe[],e.options as KeyframeAnimationOptions));stops.push(()=>sources.forEach(a=>a.cancel()));
 for(let i=0;i<8;i++)await frame();
 const outcome=new Representer().capture(root,'boundary');if(outcome.kind!=='captured')throw Error(outcome.reason);document.body.append(outcome.node);outcome.handle.attach();stops.push(()=>{outcome.handle.dispose();outcome.node.remove();});
 for(let i=0;i<3;i++){await frame();outcome.handle.read();outcome.handle.write(performance.now());}
 const reference=document.createElement('span');reference.style.cssText=`display:block;width:20px;height:20px;${c.style}`;document.body.append(reference);stops.push(()=>reference.remove());
 const oracles=c.effects.map((e,i)=>{const a=new Animation(new KeyframeEffect(reference,e.frames as Keyframe[],e.options as KeyframeEffectOptions),document.timeline);a.startTime=sources[i]!.startTime;return a;});stops.push(()=>oracles.forEach(a=>a.cancel()));
 outcome.handle.retire();sources.forEach(a=>a.cancel());root.remove();
 const copy=outcome.node.querySelector('span')!;const replays=copy.getAnimations();expect(replays.every(a=>a.playState==='running')).toBe(true);
 const errors:number[]=[];const sample=()=>{const actual=nums(getComputedStyle(copy).getPropertyValue(c.property)),expected=nums(getComputedStyle(reference).getPropertyValue(c.property));expect(actual.length).toBe(expected.length);errors.push(Math.max(...actual.map((n,i)=>Math.abs(n-expected[i]!))));};
 sample();for(let i=0;i<20;i++){await frame();sample();}
 console.info('[astra-production-running]',JSON.stringify({name:c.name,samples:errors.length,initialError:errors[0],maxError:Math.max(...errors),replayTime:replays.map(a=>a.currentTime),oracleTime:oracles.map(a=>a.currentTime)}));
 expect(Math.max(...errors)).toBeLessThan(.2);
});
for(const explicit of [false,true])it(`already-paused production source remains faithful: ${explicit?'explicit':'implicit'}`,async()=>{
 const root=document.createElement('div');root.innerHTML='<span style="display:block;width:20px;height:20px;opacity:.9"></span>';document.body.append(root);stops.push(()=>root.remove());const node=root.firstElementChild as HTMLElement;
 const frames=explicit?[{opacity:.9},{opacity:.1}]:[{opacity:.1}];const source=node.animate(frames,{duration:1000,iterations:Infinity});source.pause();source.currentTime=400;await source.ready;stops.push(()=>source.cancel());
 const outcome=new Representer().capture(root,'paused');if(outcome.kind!=='captured')throw Error(outcome.reason);document.body.append(outcome.node);outcome.handle.attach();stops.push(()=>{outcome.handle.dispose();outcome.node.remove();});
 for(let i=0;i<3;i++){await frame();outcome.handle.read();outcome.handle.write(performance.now());}outcome.handle.retire();source.cancel();root.remove();
 const copy=outcome.node.querySelector('span')!;for(let i=0;i<3;i++)await frame();const replay=copy.getAnimations()[0]!;
 console.info('[astra-production-paused]',JSON.stringify({explicit,time:replay.currentTime,pending:replay.pending,state:replay.playState,value:getComputedStyle(copy).opacity}));expect(replay.playState).toBe('paused');expect(Number(getComputedStyle(copy).opacity)).toBeCloseTo(.58,3);
});
