import { it, expect } from 'vitest';
import { createInitialAppState, rootReducer, type AppAction, type AppState, type CuratorModalAction } from '../src/model.js';
const child = (action: CuratorModalAction): AppAction => ({type:'curator',action:{type:'presented',action}});
function step(s: AppState, a: AppAction) { return rootReducer(s,a,{})[0]; }
const open = (s=createInitialAppState()) => step(step(s,{type:'openCuratorModal',id:'cloud'}),{type:'curatorPresentation',event:{type:'presentationCompleted'}});
it('a successful save after full dismissal is retained in the catalog', async () => {
 let s=open(); s=step(s,child({type:'editNotes',notes:'Saved before leaving'}));
 let complete!: AppAction; const [saving,fx]=rootReducer(s,child({type:'save'}),{saveCuratorWork:async()=>{}});
 s=step(saving,{type:'closeCuratorModal'});s=step(s,{type:'confirmAlert',action:{type:'presented',action:{type:'confirmDiscard'}}});
 s=step(s,{type:'curatorPresentation',event:{type:'dismissalCompleted'}});
 if(fx._tag==='Run') await fx.execute(a=>{complete=a;});
 s=step(s,complete);
 console.log('late-save',JSON.stringify({notes:s.specs.cloud!.curatorNotes,status:s.curatorPresentation.status}));
 expect(s.specs.cloud!.curatorNotes).toBe('Saved before leaving');
 expect(s.curator).toBeNull();
});
it('a stale result does not roll back a newer saved catalog revision', async () => {
 let s=open();s=step(s,child({type:'editNotes',notes:'old'}));
 const [a,fxA]=rootReducer(s,child({type:'save'}),{saveCuratorWork:async()=>{}});
 s=open(a);s=step(s,child({type:'editNotes',notes:'new'}));
 const [b,fxB]=rootReducer(s,child({type:'save'}),{saveCuratorWork:async()=>{}});
 let resultA!:AppAction;let resultB!:AppAction;
 if(fxA._tag==='Run')await fxA.execute(x=>{resultA=x;});
 if(fxB._tag==='Run')await fxB.execute(x=>{resultB=x;});
 s=step(step(b,resultB),resultA);
 console.log('out-of-order',JSON.stringify({catalog:s.specs.cloud!.curatorNotes,draft:s.curator!.spec.curatorNotes,dirty:s.curator!.isDirty}));
 expect(s.specs.cloud!.curatorNotes).toBe('new');
});
it('a duplicate success before the view flush preserves the pending accepted Save & Close',async()=>{
 let s=open();s=step(s,child({type:'editNotes',notes:'Save and close once'}));
 const [saving,fx]=rootReducer(s,child({type:'saveAndClose'}),{saveCuratorWork:async()=>{}});let result!:AppAction;
 if(fx._tag==='Run')await fx.execute(x=>{result=x;});
 const ready=step(saving,result);const duplicate=step(ready,result);
 console.log('duplicate-before-bridge',JSON.stringify({first:ready.curator!.closeReady,duplicate:duplicate.curator!.closeReady,status:duplicate.curatorPresentation.status}));
 expect(duplicate.curator!.closeReady).toBe(ready.curator!.closeReady);
});
