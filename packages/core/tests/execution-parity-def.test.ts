/**
 * Evidence-only managed production/TestStore parity additions for
 * AAM-04 / SPEC-052-053 / DEF-001-003.
 *
 * Every case runs createStore and managed TestStore against one fixed,
 * hand-written transcript. Production runtime source is immutable context.
 */
import {expect,it} from 'vitest';
import {createStore} from '../src/lib/store.svelte.js';
import {TestStore,createTestStore} from '../src/lib/test/test-store.js';
import {Effect} from '../src/lib/effect.js';
import {DeterministicScheduler} from '../src/lib/execution/scheduler.js';
import {ownerAt,stampOrigin} from '../src/lib/execution/identity.js';
import {expectConsole} from './helpers/console.js';
import type {EffectRuntime} from '../src/lib/execution/runtime.js';
import type {Dispatch,Effect as EffectType,ManagedReductionAdapter,Reducer,StoreExecutionConfig} from '../src/lib/types.js';

function open<S,A>(test:boolean,config:{initialState:S;reducer:Reducer<S,A>;execution:StoreExecutionConfig<S,A>}){
 // deferEffects only matters where isServer() is true; Chromium remains the registered parity runner.
 return test?createTestStore(config):createStore({...config,ssr:{deferEffects:false}});
}
/** Arms the owning-test hook first, so a recorded failure surfaces through finish/destroyAndSettle, not a microtask rethrow. */
async function arm(store:object):Promise<void>{if(store instanceof TestStore){store.exhaustivity='off';await store.finish();}}
const microtasks=async():Promise<void>=>{for(let i=0;i<10;i++)await Promise.resolve();};
function failuresOf(runtime:EffectRuntime<any>):{phase:string;error:unknown}[]{
 const seen:{phase:string;error:unknown}[]=[];runtime.observe(event=>{if(event.type==='failure')seen.push({phase:event.phase,error:event.error});});return seen;
}
const drops=(runtime:EffectRuntime<any>):string[]=>runtime.diagnostics.flatMap(event=>event.type==='dropped'?[`${event.phase}:${event.reason}:${event.ownerId??'root'}`]:[]);

type Who='a'|'b'|'root';
type E1Action={type:'start'|'nested'|'standalone';who:Who}|{type:'message';from:string};
const E1_EXPECTED=[
 'reduce:start:a','setup:a','reduce:start:b','setup:b','reduce:start:root','setup:root',
 'reduce:nested:a','fx:a:1','cleanup:a','fx:a:2','reduce:message:mapped:b','reduce:message:mapped:root',
 'reduce:standalone:root','cleanup:root','reduce:message:mapped:b','delay:b','reduce:message:mapped:b',
 'reduce:standalone:b','cleanup:b'
];
async function nestedNamespace(test:boolean,order:'map-prefix'|'prefix-map'):Promise<string[]>{
 const log:string[]=[];const scheduler=new DeterministicScheduler();const callbacks=new Map<Who,Dispatch<E1Action>>();
 const mark=(action:E1Action):E1Action=>action.type==='message'?{type:'message',from:`mapped:${action.from}`}:action;
 const lift=(effect:EffectType<E1Action>):EffectType<E1Action>=>order==='map-prefix'?Effect.prefixGroups(Effect.map(effect,mark),'lift'):Effect.map(Effect.prefixGroups(effect,'lift'),mark);
 const reducer:Reducer<string[],E1Action>=(state,action)=>{
  if(action.type==='message'){log.push(`reduce:message:${action.from}`);return [[...state,action.from],Effect.none()];}
  const who=action.who;log.push(`reduce:${action.type}:${who}`);
  if(action.type==='start')return [state,Effect.batch(
   Effect.inGroup(Effect.subscription<E1Action>('same',dispatch=>{callbacks.set(who,dispatch);log.push(`setup:${who}`);return()=>{log.push(`cleanup:${who}`);};}),'task'),
   Effect.inGroup(Effect.afterDelay<E1Action>(5,dispatch=>{log.push(`delay:${who}`);dispatch({type:'message',from:who});}),'task'))];
  if(action.type==='nested')return [state,Effect.batch(Effect.fireAndForget(()=>{log.push(`fx:${who}:1`);}),Effect.batch(Effect.cancelGroup<E1Action>('task'),Effect.fireAndForget(()=>{log.push(`fx:${who}:2`);})))];
  return [state,Effect.cancelGroup('task')];
 };
 const adapter:ManagedReductionAdapter<string[],E1Action,unknown>=({state,action,dependencies,reducer,lifecycle})=>{
  const [next,effect]=reducer(state,action,dependencies);
  const token=action.type==='message'||action.who==='root'?undefined:ownerAt(lifecycle,[{slot:action.who}]);
  // The child origin is stamped before the outer lift: map/prefix must retain it at every depth.
  return [next,lift(token?stampOrigin(effect,token):effect)];
 };
 const store=open(test,{initialState:[] as string[],reducer,execution:{mode:'managed',scheduler,slots:{select:()=>[[{slot:'a'}],[{slot:'b'}]]},_reduce:adapter}});
 try{
  await arm(store);const runtime=store._runtime!;
  for(const who of ['a','b','root'] as const)store.dispatch({type:'start',who});
  expect(runtime.pendingWorkCount).toBe(6);
  store.dispatch({type:'nested',who:'a'});
  for(const who of ['a','b','root'] as const)callbacks.get(who)!({type:'message',from:who});
  // Root cancels the same local group name; owner-qualified child work is out of reach.
  store.dispatch({type:'standalone',who:'root'});callbacks.get('b')!({type:'message',from:'b'});
  await scheduler.advanceTime(5);
  store.dispatch({type:'standalone',who:'b'});callbacks.get('b')!({type:'message',from:'b'});
  await microtasks();
  expect(store.state).toEqual(['mapped:b','mapped:root','mapped:b','mapped:b']);
  expect(drops(runtime)).toEqual(['callback:cancelled:1','callback:cancelled:2']);
  const key=(owner:readonly unknown[],kind:string,local:string):string=>JSON.stringify([owner,kind,local]);
  expect(runtime.diagnostics.flatMap(event=>event.type==='started'&&event.record.description==='Subscription'?[[event.record.id,event.record.groups]]:[]))
   .toEqual([['owner',1],['owner',2],['root']].map(owner=>[key(owner,'id','same'),[key(owner,'group','lift/task')]]));
  expect(runtime.pendingWorkCount).toBe(0);
  if(store instanceof TestStore)await store.finish();
  return log;
 }finally{store.destroy();}
}
for(const order of ['map-prefix','prefix-map'] as const)it.each([false,true])(`DEF-001 managed nested batch/action-map namespace (${order}, TestStore=%s)`,async test=>{
 expect(await nestedNamespace(test,order)).toEqual(E1_EXPECTED);
});

const E2_ROWS=[
 {row:'cancel',live:0,transcript:['setup:1','cleanup']},
 {row:'cancelGroup',live:0,transcript:['setup:1','cleanup']},
 {row:'replace',live:1,transcript:['setup:1','cleanup','setup:2','cleanup:successor']},
 {row:'destroy',live:0,transcript:['setup:1','cleanup']},
 // Managed FIFO defers cancel/cancelGroup/replacement issued inside setup; synchronous destroy is the public setup-time retirement.
 {row:'setup-retire',live:0,transcript:['setup:1','retired','cleanup']}
] as const;
type E2Action={type:'start'|'cancel'|'cancelGroup'};
async function cleanupRejection(test:boolean,{row,live}:typeof E2_ROWS[number]):Promise<string[]>{
 const log:string[]=[];const cause=new Error(`cleanup rejected: ${row}`);const retired=row==='destroy'||row==='setup-retire';
 let setups=0,cleanups=0,handlers=0;let fail=():void=>{};let destroy=():void=>{};
 const rejecting=():Promise<void>=>{
  cleanups++;log.push('cleanup');const rejection=new Promise<void>((_resolve,reject)=>{fail=()=>reject(cause);});
  // Witness that a rejection handler is attached before the late rejection; none may escape unhandled.
  const then=rejection.then.bind(rejection);
  Object.defineProperty(rejection,'then',{value:(ok:unknown,no:unknown)=>{if(typeof no==='function')handlers++;return then(ok as never,no as never);}});
  return rejection;
 };
 const reducer:Reducer<number,E2Action>=(state,action)=>[state,action.type==='start'
  ?Effect.inGroup(Effect.subscription<E2Action>('feed',()=>{const n=++setups;log.push(`setup:${n}`);if(row==='setup-retire'){destroy();log.push('retired');}return n===1?rejecting:()=>{log.push('cleanup:successor');};}),'feeds')
  :action.type==='cancel'?Effect.cancel<E2Action>('feed'):Effect.cancelGroup<E2Action>('feeds')];
 if(!test)expectConsole('error',1);
 const store=open(test,{initialState:0,reducer,execution:{mode:'managed'}});destroy=()=>store.destroy();
 const trigger=():void=>{if(row==='destroy')store.destroy();else if(row==='replace')store.dispatch({type:'start'});else if(row!=='setup-retire')store.dispatch({type:row});};
 try{
  await arm(store);const runtime=store._runtime!;const failures=failuresOf(runtime);
  store.dispatch({type:'start'});expect(trigger).not.toThrow();
  // Logical retirement is immediate; only the unsettled cleanup is still pending.
  expect([cleanups,runtime.resourceScope.size,runtime.resourceScope.pendingCleanupCount,failures.length]).toEqual([1,live,1,0]);expect(handlers).toBeGreaterThan(0);
  fail();await runtime.whenCleanupsSettled();
  expect(failures).toEqual([{phase:'cleanup',error:cause}]);expect(failures[0]!.error).toBe(cause);
  expect(runtime.diagnostics.filter(event=>event.type==='failure')).toEqual([{type:'failure',phase:'cleanup',error:{name:'Error',message:cause.message}}]);
  if(store instanceof TestStore)await expect(retired?store.destroyAndSettle():store.finish()).rejects.toMatchObject({message:`[TestStore] effect rejected: ${cause.message}`,cause});
  if(live)store.dispatch({type:'cancel'});
  await microtasks();expect([cleanups,runtime.pendingWorkCount]).toEqual([1,0]);
  if(store instanceof TestStore&&!retired)await store.finish();
  return log;
 }finally{store.destroy();}
}
for(const expected of E2_ROWS)it.each([false,true])(`DEF-002 managed async cleanup rejection: ${expected.row} (TestStore=%s)`,async test=>{
 expect(await cleanupRejection(test,expected)).toEqual(expected.transcript);
});

const E3_ROWS=[
 {mode:'abandoned',transcript:['reduce:arm','run','size:1','reduce:selfCancel','aborted:true','size:0']},
 {mode:'throw',transcript:['reduce:arm','run','size:1','reduce:selfCancel','aborted:true','size:0']},
 {mode:'control',transcript:['reduce:arm','run','size:1','reduce:selfCancel','setup:control','aborted:true','size:1','reduce:message:control','reduce:stop','cleanup:control']}
] as const;
type E3Action={type:'arm'|'selfCancel'|'stop'}|{type:'message';from:string};
async function timerSelfCancel(test:boolean,variant:'group'|'id',mode:typeof E3_ROWS[number]['mode']):Promise<string[]>{
 const log:string[]=[];const scheduler=new DeterministicScheduler();const failure=new Error(`sync throw after ${variant} self-cancel`);
 let size=():number=>-1;let control:Dispatch<E3Action>=()=>{};
 const execute=(dispatch:Dispatch<E3Action>,signal?:AbortSignal):Promise<void>=>{
  log.push('run',`size:${size()}`);
  // No drain is active inside a timer callback: this dispatch reduces and cancels before it returns.
  dispatch({type:'selfCancel'});
  log.push(`aborted:${signal?.aborted}`,`size:${size()}`);
  dispatch({type:'message',from:'stale'});
  if(mode==='throw')throw failure;
  return new Promise<void>(()=>{});
 };
 const cancel=():EffectType<E3Action>=>variant==='group'?Effect.cancelGroup('jobs'):Effect.cancel('job');
 const watch=Effect.subscription<E3Action>(variant==='group'?'control':'job',dispatch=>{control=dispatch;log.push('setup:control');return()=>{log.push('cleanup:control');};});
 const reducer:Reducer<string[],E3Action>=(state,action)=>{
  if(action.type==='message'){log.push(`reduce:message:${action.from}`);return [[...state,action.from],Effect.none()];}
  log.push(`reduce:${action.type}`);
  if(action.type==='arm')return [state,variant==='group'?Effect.inGroup(Effect.afterDelay<E3Action>(5,execute),'jobs'):Effect.debounced<E3Action>('job',5,execute)];
  // The control starts after the cancellation in the same turn, under the same group/ID, and must survive it.
  if(action.type==='selfCancel')return [state,mode==='control'?Effect.batch(cancel(),variant==='group'?Effect.inGroup(watch,'jobs'):watch):cancel()];
  return [state,cancel()];
 };
 if(!test&&mode==='throw')expectConsole('error',1);
 const store=open(test,{initialState:[] as string[],reducer,execution:{mode:'managed',scheduler}});size=()=>store._runtime!.resourceScope.size;
 try{
  await arm(store);const runtime=store._runtime!;const failures=failuresOf(runtime);
  store.dispatch({type:'arm'});expect(runtime.pendingWorkCount).toBe(1);
  await scheduler.advanceTime(5);await microtasks();
  // The executor promise never settles; after cleanup microtasks only a later control may remain owned.
  expect(runtime.pendingWorkCount).toBe(mode==='control'?1:0);
  if(mode==='control'){control({type:'message',from:'control'});store.dispatch({type:'stop'});await microtasks();}
  expect(runtime.pendingWorkCount).toBe(0);expect(store.state).toEqual(mode==='control'?['control']:[]);expect(drops(runtime)).toEqual(['callback:cancelled:root']);
  expect(failures).toEqual(mode==='throw'?[{phase:'execution',error:failure}]:[]);if(mode==='throw')expect(failures[0]!.error).toBe(failure);
  if(store instanceof TestStore){
   if(mode==='throw')await expect(store.finish()).rejects.toMatchObject({message:`[TestStore] effect rejected: ${failure.message}`,cause:failure});
   await store.finish();
  }
  return log;
 }finally{store.destroy();}
}
for(const variant of ['group','id'] as const)for(const expected of E3_ROWS)it.each([false,true])(`DEF-003 managed synchronous timer-drain self-cancel by ${variant}, ${expected.mode} (TestStore=%s)`,async test=>{
 expect(await timerSelfCancel(test,variant,expected.mode)).toEqual(expected.transcript);
});
