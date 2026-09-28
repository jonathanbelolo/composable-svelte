import '../src/styles.css';
import { it, expect } from 'vitest';
import { userEvent } from 'vitest/browser';
import { launch, settle, waitFor } from './support/observe.js';
it('rich test sampling predicate also accepts an already completed animation',async()=>{
 const f=launch('/');try{
 await settle();await waitFor(()=>!!document.querySelector<HTMLCanvasElement>('[data-pavilion-model] canvas')?.width,8000);
 await userEvent.click(document.querySelector<HTMLElement>('[data-open-study]')!);
 await waitFor(()=>f.diagnostics('settled').length>0,8000);
 // Exact original runTime predicate, intentionally sampled after lifecycle completion (e.g. a delayed observer).
 const runTime=Math.round(f.host().diagnostics.filter(d=>d.type==='frame').at(-1)!.t as number);
 const rep=document.querySelector('[data-route-representation="card-pavilion"]');
 console.log('ASTRA_RICH_EXPIRED_WINDOW',JSON.stringify({runTime,predicate:runTime>290,representation:!!rep,settled:f.diagnostics('settled'),cardFrames:f.host().diagnostics.filter(d=>d.type==='frame'&&d.participant==='card-pavilion').length,prepared:f.diagnostics('prepared')}));
 expect(runTime>290).toBe(true);expect(rep).toBeNull();expect(f.host().diagnostics.filter(d=>d.type==='frame'&&d.participant==='card-pavilion').length).toBeGreaterThan(3);
 }finally{await f.restore();}
});
