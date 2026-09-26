import {it,expect,vi,afterEach} from 'vitest';
import {createStore} from '@composable-svelte/core';
import {appReducer} from '../src/app/app.reducer.js';
import {createInitialAppState} from '../src/app/app.state.js';
const disposals:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposals.splice(0))dispose();vi.useRealTimers();vi.restoreAllMocks();});
const data={name:'Jane Doe',email:'jane@example.com',message:'A sufficiently detailed question.'};
function setup(){
 vi.useFakeTimers();vi.setSystemTime(0);const initial=createInitialAppState();const now=vi.fn(()=>new Date(1234));
 const store=createStore({initialState:{...initial,contactForm:{...initial.contactForm,data}},reducer:appReducer,dependencies:{now}});
 disposals.push(()=>store.destroy());return{store,now};
}
it('replacement success owns a full dismissal window',async()=>{
 const{store}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});await vi.advanceTimersByTimeAsync(1000);expect(store.state.submissionHistory).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(3000);store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});await vi.advanceTimersByTimeAsync(1000);expect(store.state.submissionHistory).toHaveLength(2);
 await vi.advanceTimersByTimeAsync(1000);expect(store.state.successMessage).not.toBeNull();
 await vi.advanceTimersByTimeAsync(4000);expect(store.state.successMessage).toBeNull();
});
it('manual dismissal cancels its pending framework timer',async()=>{
 const{store}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});await vi.advanceTimersByTimeAsync(1000);
 expect(vi.getTimerCount()).toBeGreaterThan(0);store.dispatch({type:'successMessageDismissed'});expect(vi.getTimerCount()).toBe(0);
});
it('records the submitted business snapshot and captures event time through the dependency',async()=>{
 const{store,now}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});expect(now).not.toHaveBeenCalled();
 store.dispatch({type:'contactForm',action:{type:'setFieldValue',field:'name',value:'Later edit'}});await vi.advanceTimersByTimeAsync(1000);
 expect(store.state.submissionHistory).toEqual([{timestamp:new Date(1234),name:data.name,email:data.email}]);expect(now).toHaveBeenCalledOnce();
});
it('a rejected start cannot replace the pending business snapshot',async()=>{
 const{store}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});
 store.dispatch({type:'contactForm',action:{type:'submissionStarted',validationId:999,snapshot:{...data,name:'Stale'}}});
 await vi.advanceTimersByTimeAsync(1000);expect(store.state.submissionHistory[0]?.name).toBe(data.name);
});
it('reset retires submission, and a stale tagged success cannot create history',async()=>{
 const{store}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});const oldId=store.state.contactForm.submissionId;
 store.dispatch({type:'contactForm',action:{type:'formReset'}});store.dispatch({type:'contactForm',action:{type:'submissionSucceeded',submissionId:oldId}});
 await vi.advanceTimersByTimeAsync(2000);expect(store.state.submissionHistory).toEqual([]);expect(store.state.successMessage).toBeNull();
});
it('destroy clears the success dismissal resource',async()=>{
 const{store}=setup();store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});await vi.advanceTimersByTimeAsync(1000);
 expect(vi.getTimerCount()).toBeGreaterThan(0);store.destroy();expect(vi.getTimerCount()).toBe(0);
});
