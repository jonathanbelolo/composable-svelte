import { it, expect } from 'vitest';
import { createInitialAppState, rootReducer, type AppAction, type AppState, type CuratorModalAction } from '../src/model.js';
const child = (action: CuratorModalAction): AppAction => ({ type:'curator', action:{type:'presented',action} });
const step=(s:AppState,a:AppAction)=>rootReducer(s,a,{})[0];
async function save(s:AppState,id:string,notes:string){
 s=step(s,{type:'openCuratorModal',id});s=step(s,child({type:'editNotes',notes}));
 const [saving,fx]=rootReducer(s,child({type:'saveAndClose'}),{saveCuratorWork:async()=>{}});let result!:AppAction;
 if(fx._tag==='Run')await fx.execute(x=>{result=x;});return {saving,result};
}
it('an earlier success for another work survives newer unrelated success',async()=>{
 const a=await save(createInitialAppState(),'cloud','Cloud saved');const b=await save(a.saving,'origami','Origami saved');
 const s=step(step(b.saving,b.result),a.result);
 expect(s.specs.cloud!.curatorNotes).toBe('Cloud saved');expect(s.specs.origami!.curatorNotes).toBe('Origami saved');
 expect(s.curator!.spec.id).toBe('origami');expect(s.curator!.closeReady).toBe(b.saving.saveRequestId);
});
it('late failure after success preserves readiness; success replay after consumption cannot rearm it',async()=>{
 const {saving,result}=await save(createInitialAppState(),'cloud','Ready revision');let s=step(saving,result);const ready=s.curator!.closeReady!;
 const failed=step(s,{type:'curatorSaveFailed',requestId:s.saveRequestId,instanceId:s.curator!.instanceId,message:'late duplicate error'});
 expect(failed).toBe(s);expect(failed.curator!.closeReady).toBe(ready);
 s=step(s,child({type:'commitSavedClose',requestId:ready}));s=step(s,result);
 expect(s.curatorPresentation.status).toBe('dismissing');expect(s.curator!.closeReady).toBeNull();
});
