import {EffectRuntime} from '../src/lib/execution/runtime.js';
import {TurnQueue} from '../src/lib/execution/turn-queue.js';
import {describe,it,expect} from 'vitest';
import {createStore} from '../src/lib/store.svelte.js';
import {createTestStore} from '../src/lib/test/test-store.js';
import {Effect} from '../src/lib/effect.js';
import {DeterministicScheduler} from '../src/lib/execution/scheduler.js';
import {ownerAt,stampOrigin} from '../src/lib/execution/identity.js';
import type {ManagedReductionAdapter} from '../src/lib/types.js';
import type {Reducer,Dispatch} from '../src/lib/types.js';
type A={type:'start'|'done'|'cancel';name?:string};
const burst:Reducer<number,A>=(state,action)=>action.type==='start'?[state+1,Effect.run(dispatch=>{dispatch({type:'done',name:'one'});dispatch({type:'done',name:'two'});})]:[state+1,Effect.none()];
it('send and receive assertions see their own committed turns rather than the drained final state',async()=>{
 const store=createTestStore({initialState:0,reducer:burst,execution:{mode:'managed'}});
 await store.send({type:'start'},state=>{expect(state).toBe(1);});expect(store.state).toBe(3);
 await store.receive({type:'done',name:'one'},state=>{expect(state).toBe(2);});await store.receive({type:'done',name:'two'},state=>{expect(state).toBe(3);});await store.finish();
});
it('an unresolved assertion does not hold up synchronous effect execution',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let started=false;
 const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state+1,Effect.fireAndForget(()=>{started=true;})] as const,execution:{mode:'managed'}});
 const sent=store.send({type:'start'},async state=>{expect(state).toBe(1);await gate;});expect(started).toBe(true);release();await sent;await store.finish();
});
it('distinct sent envelopes may contain the exact same action object',async()=>{
 const action:A={type:'start'};const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state+1,Effect.none<A>()] as const,execution:{mode:'managed'}});
 const seen:number[]=[];const first=store.send(action,state=>{seen.push(state);});const second=store.send(action,state=>{seen.push(state);});await Promise.all([first,second]);expect(seen).toEqual([1,2]);expect(store.state).toBe(2);await store.finish();
});
it('queued send assertions reject on destruction instead of hanging',async()=>{
 const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state+1,Effect.none<A>()] as const,execution:{mode:'managed'}});let nested:Promise<void>|undefined;
 store.subscribe(state=>{if(state===1){nested=store.send({type:'done'});void nested.catch(()=>{});store.destroy();}});
 await store.send({type:'start'},state=>{expect(state).toBe(1);});await expect(nested).rejects.toThrow('dropped: destroyed');await store.destroyAndSettle();
});
it('failed reducer and reconciliation reject their send receipts without committing history',async()=>{
 const reducer:Reducer<number,A>=(state,action)=>{if(action.type==='start')throw new Error('reducer');return [state+1,Effect.none()];};
 const store=createTestStore({initialState:0,reducer,execution:{mode:'managed',slots:{select:state=>state===0?[]:[[{slot:'bad'}],[{slot:'bad'}]]}}});
 await expect(store.send({type:'start'})).rejects.toThrow('reducer');await expect(store.send({type:'done'})).rejects.toThrow('Duplicate');expect(store.state).toBe(0);expect(store.getHistory()).toEqual([]);await store.finish();
});
it('finish and receive never advance a deterministic timer implicitly',async()=>{
 const scheduler=new DeterministicScheduler();const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>action.type==='start'?[state,Effect.afterDelay<A>(0,dispatch=>dispatch({type:'done'}))] as const:[state+1,Effect.none<A>()] as const,execution:{mode:'managed',scheduler}});
 await store.send({type:'start'});await expect(store.receive({type:'done'},undefined,1)).rejects.toThrow('within 1ms');expect(store.state).toBe(0);await expect(store.finish()).rejects.toThrow('pending timer');expect(scheduler.now()).toBe(0);await store.advanceTime(0);await store.receive({type:'done'},state=>{expect(state).toBe(1);});await store.finish();
});

async function allEffects(test:boolean){
 const log:string[]=[];const scheduler=new DeterministicScheduler();let subscription!:Dispatch<A>;let signal:AbortSignal|undefined;
 const reducer:Reducer<number,A>=(state,action)=>{
  log.push(`reduce:${action.type}:${action.name??''}:${state}`);
  if(action.type==='start')return [state+1,Effect.batch(
   Effect.none(),Effect.fireAndForget(()=>{log.push('fire');}),
   Effect.run(dispatch=>{log.push('run');dispatch({type:'done',name:'run'});}),
   Effect.inGroup(Effect.subscription<A>('sub',dispatch=>{log.push('subscribe');subscription=dispatch;return()=>{log.push('cleanup');};}),'group'),
   Effect.cancellable<A>('io',(_dispatch,ownerSignal)=>{log.push('io');signal=ownerSignal;return new Promise<void>(()=>{});}),
   Effect.debounced<A>('debounce',5,dispatch=>{log.push('debounce');dispatch({type:'done',name:'debounce'});}),
   Effect.throttled<A>('throttle',5,dispatch=>{log.push('throttle');dispatch({type:'done',name:'throttle'});}),
   Effect.afterDelay<A>(5,dispatch=>{log.push('delay');dispatch({type:'done',name:'delay'});})
  )];
  if(action.type==='cancel')return [state,Effect.batch(Effect.cancel('io'),Effect.cancelGroup('group'))];
  return [state+1,Effect.none()];
 };
 const config={initialState:0,reducer,execution:{mode:'managed' as const,scheduler}};
 const store=test?createTestStore(config):createStore(config);
 if('exhaustivity' in store)store.exhaustivity='off';
 store.subscribe(state=>{log.push(`state:${state}`);});store.subscribeToActions!((action,state)=>{log.push(`action:${action.type}:${action.name??''}:${state}`);});
 // Identical synchronous dispatch script for both adapters. Assertions run afterwards.
 store.dispatch({type:'start'});await scheduler.advanceTime(5);subscription({type:'done',name:'sub'});store.dispatch({type:'cancel'});expect(signal?.aborted).toBe(true);subscription({type:'done',name:'late'});
 if('finish' in store)await store.finish();store.destroy();return log;
}
it('all effect tags have an explicit production/TestStore semantic transcript',async()=>{
 const expected=['state:0','reduce:start::0','state:1','action:start::1','fire','run','subscribe','io','throttle','reduce:done:run:1','state:2','action:done:run:2','reduce:done:throttle:2','state:3','action:done:throttle:3','debounce','reduce:done:debounce:3','state:4','action:done:debounce:4','delay','reduce:done:delay:4','state:5','action:done:delay:5','reduce:done:sub:5','state:6','action:done:sub:6','reduce:cancel::6','action:cancel::6','cleanup'];
 expect(await allEffects(false)).toEqual(expected);expect(await allEffects(true)).toEqual(expected);
});

it('destroyAndSettle retires managed work synchronously before awaiting its assertion hook',async()=>{
 let signal:AbortSignal|undefined;const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.cancellable<A>('job',(_dispatch,s)=>{signal=s;return new Promise<void>(()=>{});})] as const,execution:{mode:'managed'}});
 await store.send({type:'start'});const done=store.destroyAndSettle();expect(signal?.aborted).toBe(true);await done;
});

it('a shared injected scheduler does not make another root own this test store finish',async()=>{
 const scheduler=new DeterministicScheduler();const other=createStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.afterDelay<A>(100,()=>{})] as const,execution:{mode:'managed',scheduler}});other.dispatch({type:'start'});
 let complete!:()=>void;const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.run<A>(()=>new Promise<void>(resolve=>{complete=resolve;}))] as const,execution:{mode:'managed',scheduler}});await store.send({type:'start'});const finished=store.finish(100);complete();await finished;expect(scheduler.pendingTimersCount).toBe(1);other.destroy();
});
it('late cleanup rejection remains observable after immediate logical cancellation',async()=>{
 let fail!:(error:Error)=>void;const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.subscription<A>('listener',()=>()=>new Promise<void>((_resolve,reject)=>{fail=reject;}))] as const,execution:{mode:'managed'}});await store.send({type:'start'});const settling=store.destroyAndSettle();fail(new Error('cleanup rejected'));await expect(settling).rejects.toThrow('cleanup rejected');
});
it('synchronous self-cancellation cleans up once and late callbacks are ordinary drops',async()=>{
 const log:string[]=[];let callback!:Dispatch<A>;const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>action.type==='start'?[state,Effect.subscription<A>('self',dispatch=>{callback=dispatch;log.push('setup');dispatch({type:'cancel'});log.push('returned');return()=>{log.push('cleanup');};})] as const:[state,Effect.cancel<A>('self')] as const,execution:{mode:'managed'}});
 await store.send({type:'start'});await store.receive({type:'cancel'});callback({type:'done'});expect(log).toEqual(['setup','returned','cleanup']);expect(store._runtime!.diagnostics.some(event=>event.type==='dropped'&&event.reason==='cancelled')).toBe(true);await store.finish();
});
async function ownedScript(test:boolean){
 type S={open:boolean;saved:number};type Action={type:'save'|'close'|'saved'|'trigger'};
 const log:string[]=[];let deliver!:Dispatch<Action>;
 const reducer:Reducer<S,Action>=(state,action)=>{
  log.push(action.type);
  if(action.type==='save')return [state,Effect.subscription<Action>('save',dispatch=>{deliver=dispatch;return()=>{log.push('cleanup');};})];
  if(action.type==='close')return [{...state,open:false},Effect.none()];
  if(action.type==='saved')return [{...state,saved:state.saved+1},Effect.none()];
  return [{...state},Effect.none()];
 };
 const path=[{slot:'editor'}] as const;
 const adapter:ManagedReductionAdapter<S,Action,unknown>=({state,action,dependencies,reducer,lifecycle})=>{const [next,effect]=reducer(state,action,dependencies);const token=ownerAt(lifecycle,path);return [next,token?stampOrigin(effect,token):effect];};
 const config={initialState:{open:true,saved:0},reducer,execution:{mode:'managed' as const,slots:{select:(state:S)=>state.open?[path]:[]},_reduce:adapter}};
 const store=test?createTestStore(config):createStore(config);if('exhaustivity'in store)store.exhaustivity='off';
 store.subscribeToActions!((action)=>{if(action.type==='trigger'){store.dispatch({type:'close'});deliver({type:'saved'});}});
 store.dispatch({type:'save'});store.dispatch({type:'trigger'});deliver({type:'saved'});
 expect(store.state).toEqual({open:false,saved:0});expect(log).toEqual(['save','trigger','close','cleanup']);
 expect(store._runtime!.diagnostics.filter(event=>event.type==='dropped').map(event=>event.phase)).toEqual(['dequeue','callback']);
 if('finish'in store)await store.finish();store.destroy();return log;
}
it('production and TestStore both invalidate saved-work callbacks at dequeue and after close',async()=>{
 expect(await ownedScript(false)).toEqual(['save','trigger','close','cleanup']);expect(await ownedScript(true)).toEqual(['save','trigger','close','cleanup']);
});
it('array receive assertions use the last consumed turn, not later unasserted work',async()=>{
 const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>action.type==='start'?[1,Effect.run<A>(dispatch=>{for(const name of ['one','two','three'])dispatch({type:'done',name});})] as const:[state+1,Effect.none<A>()] as const,execution:{mode:'managed'}});await store.send({type:'start'});await store.receive([{type:'done',name:'two'},{type:'done',name:'one'}],state=>{expect(state).toBe(3);});expect(store.state).toBe(4);await store.receive({type:'done',name:'three'},state=>{expect(state).toBe(4);});await store.finish();
});

it.each([false,true])('uncooperative save completion cannot affect a closed owner (TestStore=%s)',async(test)=>{
 type State={open:boolean;saved:number};type Action={type:'save'|'close'|'saved'};
 let resolve!:()=>void;let signal:AbortSignal|undefined;const path=[{slot:'editor'}] as const;
 const reducer:Reducer<State,Action>=(state,action)=>action.type==='save'?[state,Effect.cancellable<Action>('save',async(dispatch,s)=>{signal=s;await new Promise<void>(done=>{resolve=done;});dispatch({type:'saved'});})]:action.type==='close'?[{...state,open:false},Effect.none()]:[{...state,saved:state.saved+1},Effect.none()];
 const adapter:ManagedReductionAdapter<State,Action,unknown>=({state,action,dependencies,reducer,lifecycle})=>{const [next,effect]=reducer(state,action,dependencies);const token=ownerAt(lifecycle,path);return [next,token?stampOrigin(effect,token):effect];};
 const config={initialState:{open:true,saved:0},reducer,execution:{mode:'managed' as const,slots:{select:(state:State)=>state.open?[path]:[]},_reduce:adapter}};const store=test?createTestStore(config):createStore(config);if('exhaustivity'in store)store.exhaustivity='off';store.dispatch({type:'save'});store.dispatch({type:'close'});expect(signal?.aborted).toBe(true);expect(store._runtime!.pendingWorkCount).toBe(0);resolve();await Promise.resolve();await Promise.resolve();expect(store.state).toEqual({open:false,saved:0});if('finish'in store)await store.finish();store.destroy();
});
it.each([false,true])('same-key replacement starts only new-owner work (TestStore=%s)',async(test)=>{
 type Action={type:'open'|'replace'|'close'|'callback'};const path=[{slot:'dialog'}] as const;const log:string[]=[];const callbacks:Dispatch<Action>[]=[];
 const reducer:Reducer<boolean,Action>=(state,action)=>[action.type==='close'?false:true,Effect.none()];
 const adapter:ManagedReductionAdapter<boolean,Action,unknown>=({state,action,dependencies,reducer,lifecycle})=>{
  const [next,effect]=reducer(state,action,dependencies);const old=ownerAt(lifecycle,path);
  if(action.type==='open'||action.type==='replace')return [next,old?stampOrigin(Effect.fireAndForget(()=>{log.push('outgoing');}),old):effect,old?[{type:'replace',path}]:[],[{path,effect:Effect.subscription<Action>('same',dispatch=>{callbacks.push(dispatch);log.push('setup');return()=>{log.push('cleanup');};})}]];
  return [next,effect];
 };
 const config={initialState:false,reducer,execution:{mode:'managed' as const,slots:{select:(open:boolean)=>open?[path]:[]},_reduce:adapter}};const store=test?createTestStore(config):createStore(config);if('exhaustivity'in store)store.exhaustivity='off';store.dispatch({type:'open'});store.dispatch({type:'replace'});callbacks[0]!({type:'callback'});store.dispatch({type:'close'});expect(log).toEqual(['setup','cleanup','setup','cleanup']);expect(store.state).toBe(false);if('finish'in store)await store.finish();store.destroy();
});
it('frame advancement is distinct from time advancement in the managed adapter',async()=>{
 const scheduler=new DeterministicScheduler();const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>action.type==='start'?[state,Effect.subscription<A>('frame',dispatch=>{const frame=scheduler.requestFrame(()=>dispatch({type:'done'}));return()=>scheduler.cancelFrame(frame);})] as const:action.type==='cancel'?[state,Effect.cancel<A>('frame')] as const:[state+1,Effect.none<A>()] as const,execution:{mode:'managed',scheduler}});
 await store.send({type:'start'});await store.advanceTime(0);expect(store.state).toBe(0);await expect(store.receive({type:'done'},undefined,1)).rejects.toThrow('within 1ms');await scheduler.stepFrame();await store.receive({type:'done'},state=>{expect(state).toBe(1);});await store.send({type:'cancel'});await store.finish();
});

it('throwing turn observers and their diagnostic sinks cannot change acceptance or cleanup',()=>{
 let ran=0,cleaned=0;let queue!:TurnQueue<number,A>;
 const runtime=new EffectRuntime<A>({scheduler:new DeterministicScheduler(),dispatch:(action,origin)=>queue.enqueue({action,origin})});
 queue=new TurnQueue({initialState:0,runtime,reducer:(state,action)=>[state+1,action.type==='cancel'?Effect.cancel<A>('sub'):Effect.subscription<A>('sub',()=>{ran++;return()=>{cleaned++;};})],onTurn:()=>{throw new Error('observer');},onSubscriberError:()=>{throw new Error('sink');}});
 queue.dispatch({type:'start'});queue.dispatch({type:'cancel'});expect(queue.getState()).toBe(2);expect([ran,cleaned]).toEqual([1,1]);queue.destroy();
});
it('TestStore records runtime observer failures instead of silently suppressing them',async()=>{
 const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.run<A>(()=>{})] as const,execution:{mode:'managed'}});const stop=store._runtime!.observe(()=>{stop();throw new Error('diagnostic observer');});await store.send({type:'start'});await expect(store.finish()).rejects.toThrow('diagnostic observer');
});
it('nested group cancellation owns only the declared members in the managed adapter',async()=>{
 const scheduler=new DeterministicScheduler();let cleanup=0,other=0,fired=0;const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>[state,action.type==='start'?Effect.batch(
  Effect.inGroup(Effect.inGroup(Effect.subscription<A>('sub',()=>()=>{cleanup++;}),'inner'),'outer'),
  Effect.inGroup(Effect.inGroup(Effect.afterDelay<A>(5,()=>{fired++;}),'inner'),'outer'),
  Effect.inGroup(Effect.subscription<A>('other',()=>()=>{other++;}),'other')
 ):action.name==='inner'?Effect.cancelGroup<A>('inner'):Effect.cancelGroup<A>('other')] as const,execution:{mode:'managed',scheduler}});
 await store.send({type:'start'});await store.send({type:'cancel',name:'inner'});await store.advanceTime(5);expect([cleanup,other,fired]).toEqual([1,0,0]);await store.send({type:'cancel',name:'other'});expect(other).toBe(1);await store.finish();
});

it('finish accounts for uncooperative work until cancellation, without awaiting abandoned I/O',async()=>{
 const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>[state,action.type==='cancel'?Effect.cancel<A>('work'):Effect.cancellable<A>('work',()=>new Promise<void>(()=>{}))] as const,execution:{mode:'managed'}});
 await store.send({type:'start'});await expect(store.finish(1)).rejects.toThrow('managed resource(s) still pending');await store.send({type:'cancel'});await store.finish();store.destroy();
});
it('cleanup deadline can fail without losing a later successful teardown checkpoint',async()=>{
 let release!:()=>void;const cleanup=new Promise<void>(resolve=>{release=resolve;});const store=createTestStore({initialState:0,reducer:(state:number,_action:A)=>[state,Effect.subscription<A>('listener',()=>()=>cleanup)] as const,execution:{mode:'managed'}});
 await store.send({type:'start'});await expect(store.destroyAndSettle(1)).rejects.toThrow('pending managed cleanup');release();await store.destroyAndSettle();
});
it('a cancelled execution reports genuine late failure but not cooperative abort',async()=>{
 let reject!:(e:unknown)=>void;const failure=new Error('real late failure');const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>[state,action.type==='cancel'?Effect.cancel<A>('work'):Effect.cancellable<A>('work',()=>new Promise<void>((_,r)=>{reject=r;}))] as const,execution:{mode:'managed'}});
 await store.send({type:'start'});await store.send({type:'cancel'});reject(failure);await Promise.resolve();await expect(store.finish()).rejects.toMatchObject({message:'[TestStore] effect rejected: real late failure',cause:failure});store.destroy();
});
it('an effect-origin rejected turn is observable and does not leave a pending receive',async()=>{
 const store=createTestStore({initialState:0,reducer:(state:number,action:A)=>{if(action.type==='done')throw new Error('child reducer');return[state,Effect.run<A>(dispatch=>dispatch({type:'done'}))] as const;},execution:{mode:'managed'}});
 // A synchronous effect queues into the existing external drain. That drain
 // reports its rejected child after accepting the parent, without hanging send.
 await expect(store.send({type:'start'})).rejects.toThrow('child reducer');expect(store.getHistory()).toEqual([{type:'start'}]);store.destroy();
});
