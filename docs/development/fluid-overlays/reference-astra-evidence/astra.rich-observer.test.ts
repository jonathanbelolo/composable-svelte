import '../src/styles.css';
import { it, expect } from 'vitest';
import { userEvent } from 'vitest/browser';
import { launch, settle, waitFor, frame } from './support/observe.js';
async function witness(remove:boolean){
 const f=launch('/');try {
 await settle();await waitFor(()=>!!document.querySelector<HTMLCanvasElement>('[data-pavilion-model] canvas')?.width,8000);
 for(let i=0;i<10;i++)await frame();
 let captured: {runMs:number,width:number,height:number}|undefined;
 let stopped=false;let removals=0;const start=performance.now();
 // Observer starts BEFORE the trusted input's asynchronous round trip. Capture is synchronous within one frame.
 const observe=(async()=>{while(!stopped&&performance.now()-start<8000){
  let rep=document.querySelector('[data-route-representation="card-pavilion"]');
  if(remove&&rep){rep.remove();removals++;rep=document.querySelector('[data-route-representation="card-pavilion"]');}
  const last=f.host().diagnostics.filter(d=>d.type==='frame'&&d.participant==='card-pavilion').at(-1);
  const runMs=(last?.t as number|undefined)??-1;
  if(rep&&runMs>290&&f.diagnostics('settled').length===0){const box=rep.getBoundingClientRect();captured={runMs,width:box.width,height:box.height};break;}
  if(f.diagnostics('settled').length>0)break;
  await frame();
 }})();
 await userEvent.click(document.querySelector<HTMLElement>('[data-open-study]')!);await observe;stopped=true;
 await waitFor(()=>f.diagnostics('settled').length>0,8000);
 const skipped=f.diagnostics('prepared').flatMap(d=>(d.skipped as string[]|undefined)??[]);
 const unsupported=f.host().diagnostics.filter(d=>d.type==='unsupported');
 console.log('ASTRA_RICH_BOUNDED',JSON.stringify({remove,captured:captured??null,removals,skipped,unsupported}));
 // Same required assertion applies to both healthy and deliberate missing-paint control.
 expect(captured,'no live card representation observed in the required motion window').toBeDefined();
 expect(captured!.width).toBeGreaterThan(500);expect(captured!.height).toBeGreaterThan(200);expect(skipped).toEqual([]);expect(unsupported).toEqual([]);
 }finally{await f.restore();}
}
it('early armed bounded rich observer witnesses the real live surface',()=>witness(false));
it('negative control: removed rich paint must fail the same mandatory witness',()=>witness(true));
