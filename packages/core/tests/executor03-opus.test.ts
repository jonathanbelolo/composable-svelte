import { TurnQueue, type TurnEvent } from '../src/lib/execution/turn-queue.js';
import { ownerAt, stampOrigin } from '../src/lib/execution/identity.js';
import { expectConsole } from './helpers/console.js';
import { describe, it, expect } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { DeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { EffectRuntime } from '../src/lib/execution/runtime.js';
import { ResourceScope, type SubscriptionRegistrationOptions } from '../src/lib/execution/resources.js';
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
describe('executor03 hostile review resource contracts', () => {
 it('ignores cooperative AbortError only after framework cancellation', async () => {
  const errors: unknown[]=[]; const scope=new ResourceScope({onExecutionError:e=>errors.push(e)});
  scope.runCancellable({id:'work',dispatch() {},execute(_dispatch,signal){ return new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true})); }});
  scope.cancel('work'); await flush(); expect(errors).toEqual([]); expect(scope.size).toBe(0);
  const actual=new DOMException('unrelated','AbortError');
  scope.runCancellable({dispatch() {},execute(){return Promise.reject(actual);}});
  await flush(); expect(errors).toEqual([actual]);
 });
 it('still reports a genuine late failure after cancellation', async () => {
  const errors: unknown[]=[]; const scope=new ResourceScope({onExecutionError:e=>errors.push(e)});
  let reject!: (e:unknown)=>void;
  scope.runCancellable({id:'work',dispatch() {},execute(){return new Promise<void>((_,r)=>reject=r);}});
  scope.cancel('work'); const failure=new Error('late failure');reject(failure);await flush();expect(errors).toEqual([failure]);
 });
 it('rejects async subscription setup immediately and disposes its eventual cleanup exactly once', async () => {
  const errors: unknown[]=[]; const scope=new ResourceScope({onExecutionError:e=>errors.push(e)});
  let finish!: (cleanup:()=>void)=>void; let calls=0;
  const setup=(()=>new Promise<()=>void>(r=>finish=r)) as unknown as SubscriptionRegistrationOptions<never>['setup'];
  const record=scope.registerSubscription({id:'async',dispatch() {},setup});
  expect(record.live).toBe(false); expect(scope.size).toBe(0);expect(errors).toHaveLength(1);expect(errors[0]).toBeInstanceOf(TypeError);
  finish(()=>{calls++;});await flush();record.dispose();scope.dispose();await scope.whenCleanupsSettled();expect(calls).toBe(1);
 });
 it('observes rejected async subscription setup without leaking its registration',async()=>{
  const errors:unknown[]=[];const scope=new ResourceScope({onExecutionError:e=>errors.push(e)});const failure=new Error('async setup');
  const setup=(()=>Promise.reject(failure)) as unknown as SubscriptionRegistrationOptions<never>['setup'];
  const record=scope.registerSubscription({dispatch() {},setup}); await flush();expect(record.live).toBe(false);expect(errors).toHaveLength(2);expect(errors[0]).toBeInstanceOf(TypeError);expect(errors[1]).toBe(failure);
 });
});

it('executes timers from a synchronous scheduler after registration, including throttle bookkeeping',async()=>{
 class Immediate extends DeterministicScheduler { override setTimer(_delay:number,callback:()=>void) { callback(); return {kind:'timer' as const,id:Symbol()}; } }
 const scheduler=new Immediate(); const trace:string[]=[];
 const runtime=new EffectRuntime<string>({scheduler,dispatch:a=>trace.push(a)});
 runtime.executeEffect(Effect.afterDelay(0,d=>d('delay')));
 runtime.executeEffect(Effect.debounced('d',0,d=>d('debounce')));
 runtime.executeEffect(Effect.throttled('t',10,d=>d('leading')));
 runtime.executeEffect(Effect.throttled('t',10,d=>d('trailing')));
 expect(trace).toEqual(['delay','debounce','leading','trailing']);await flush();expect(runtime.pendingWorkCount).toBe(0);runtime.dispose();
});
it('managed executor callbacks expire at promise settlement; subscriptions remain until explicit teardown',async()=>{
 const trace:string[]=[];const runtime=new EffectRuntime<string>({scheduler:new DeterministicScheduler(),dispatch:a=>trace.push(a)});
 let run!: (a:string)=>void; let subscription!: (a:string)=>void;let cleaned=0;
 runtime.executeEffect(Effect.run(d=>{run=d;d('during');}));
 runtime.executeEffect(Effect.subscription('events',d=>{subscription=d;return()=>{cleaned++;};}));
 await flush();run('late');subscription('live');expect(trace).toEqual(['during','live']);
 runtime.cancel('events');subscription('retired');expect(cleaned).toBe(1);expect(trace).toEqual(['during','live']);runtime.dispose();
});

it('warns once for public dispatch after managed store destruction',()=>{
 const store=createStore({initialState:0,reducer:(s:number,_a:string)=>[s+1,Effect.none<string>()] as const,execution:{mode:'managed'}});
 store.destroy();expectConsole('warn',1);store.dispatch('one');store.dispatch('two');expect(store.state).toBe(0);
});
it('rejects managed-only configuration when managed mode was omitted',()=>{
 for(const execution of [{scheduler:new DeterministicScheduler()},{slots:{select:()=>[]}},{_reduce:()=>[0,Effect.none()] as const}]) {
 expect(()=>createStore({initialState:0,reducer:(s:number,_a:string)=>[s,Effect.none<string>()] as const,execution})).toThrow(/managed/);
 }
});
it('group cancellation preserves a throttle window while removing its pending work',async()=>{
 const scheduler=new DeterministicScheduler();const trace:string[]=[];const runtime=new EffectRuntime<string>({scheduler,dispatch:a=>trace.push(a)});
 const work=(value:string)=>Effect.inGroup(Effect.throttled<string>('t',100,d=>d(value)),'g');
 runtime.executeEffect(work('first'));await scheduler.advanceTime(20);runtime.executeEffect(work('cancelled'));runtime.cancelGroup('g');runtime.executeEffect(work('replacement'));
 expect(trace).toEqual(['first']);await scheduler.advanceTime(80);expect(trace).toEqual(['first','replacement']);runtime.dispose();
});

it('retains bounded diagnostic projections separately from full live observation',async()=>{
 const runtime=new EffectRuntime<string>({scheduler:new DeterministicScheduler(),dispatch() {}});
 let observed:unknown;runtime.observe(event=>{if(event.type==='failure')observed=event.error;});
 const failure=Object.assign(new Error('x'.repeat(4000)),{huge:{payload:'private'}});runtime.reportFailure(failure,'execution');
 for(let i=0;i<120;i++)runtime.executeEffect(Effect.run(()=>{}));await flush();
 const history=runtime.diagnostics;expect(observed).toBe(failure);expect(history.length).toBeLessThanOrEqual(200);
 const issue=history.find(event=>event.type==='failure');expect(issue?.type).toBe('failure');
 if(issue?.type==='failure'){expect(issue.error).not.toBe(failure);expect(issue.error.message).toHaveLength(2048);expect(Object.keys(issue.error)).toEqual(['name','message']);expect(Object.isFrozen(issue.error)).toBe(true);}
 for(const event of history)if(event.type==='started'||event.type==='settled'){expect(event.record).not.toHaveProperty('controller');expect(event.record).not.toHaveProperty('logicalSettlement');expect(Object.isFrozen(event.record)).toBe(true);}
 runtime.dispose();
});
it('reports effect-origin reducer failures without throwing into host callbacks',()=>{
 let callback!: (a:string)=>void;
 const store=createStore({initialState:0,reducer:(s:number,a:string)=>{if(a==='bad')throw new Error('reducer failed');return[s+1,a==='start'?Effect.subscription<string>('source',d=>{callback=d;return()=>{};}):Effect.none<string>()] as const;},execution:{mode:'managed'}});
 store.dispatch('start');expectConsole('error',1);expect(()=>callback('bad')).not.toThrow();expect(store.state).toBe(1);store.dispatch('good');expect(store.state).toBe(2);expect(store._runtime!.diagnostics.some(e=>e.type==='failure'&&e.phase==='reduction')).toBe(true);store.destroy();
});

it('drops a still-live sibling callback at enqueue while its owner is being torn down',()=>{
 const path=[{slot:'child'}] as const;let sibling!: (a:string)=>void;const trace:string[]=[];
 const store=createStore({initialState:{open:true,count:0},reducer:(s:{open:boolean;count:number},a:string)=>[
 a==='close'?{...s,open:false}:a==='callback'?{...s,count:s.count+1}:s,
 a==='start'?Effect.batch(Effect.subscription<string>('first',()=>()=>{trace.push('first-cleanup');sibling('callback');}),Effect.subscription<string>('second',d=>{sibling=d;return()=>{trace.push('second-cleanup');};})):Effect.none<string>()] as const,
 execution:{mode:'managed',slots:{select:s=>s.open?[path]:[]},_reduce:({state,action,dependencies,reducer,lifecycle})=>{const[next,effect]=reducer(state,action,dependencies);const token=ownerAt(lifecycle,path);return[next,token?stampOrigin(effect,token):effect];}}});
 store.dispatch('start');store.dispatch('close');expect(trace).toEqual(['first-cleanup','second-cleanup']);expect(store.state.count).toBe(0);expect(store._runtime!.diagnostics.some(e=>e.type==='dropped'&&e.phase==='enqueue')).toBe(true);store.destroy();
});
it('owner invalidation disposes deferred work before its executor can start',async()=>{
 const scheduler=new DeterministicScheduler();const path=[{slot:'child'}] as const;let starts=0;
 const store=createStore({initialState:true,reducer:(s:boolean,a:string)=>[a==='close'?false:s,a==='start'?Effect.afterDelay<string>(5,()=>{starts++;}):Effect.none<string>()] as const,
 execution:{mode:'managed',scheduler,slots:{select:s=>s?[path]:[]},_reduce:({state,action,dependencies,reducer,lifecycle})=>{const[next,effect]=reducer(state,action,dependencies);const token=ownerAt(lifecycle,path);return[next,token?stampOrigin(effect,token):effect];}}});
 store.dispatch('start');store.dispatch('close');await scheduler.advanceTime(5);expect(starts).toBe(0);expect(scheduler.pendingTimersCount).toBe(0);store.destroy();
});
it('new-owner work without a declared slot fails atomically',()=>{
 const store=createStore({initialState:0,reducer:(s:number,_a:string)=>[s+1,Effect.none<string>()] as const,execution:{mode:'managed',_reduce:({state,action,dependencies,reducer})=>{const[next,effect]=reducer(state,action,dependencies);return[next,effect,[],[{path:[{slot:'missing'}],effect:Effect.none<string>()}]];}}});
 expect(()=>store.dispatch('bad')).toThrow();expect(store.state).toBe(0);expect(store.history).toEqual([]);store.destroy();
});

it('turn observation preserves original envelopes and failures without controlling acceptance',()=>{
 let queue!:TurnQueue<number,string>;const events:TurnEvent<number,string>[]=[];const failure=new Error('reduction');let cleanups=0;
 const runtime=new EffectRuntime<string>({scheduler:new DeterministicScheduler(),dispatch:(action,origin)=>queue.enqueue({action,origin})});
 queue=new TurnQueue({initialState:0,runtime,reducer:(state,action)=>{if(action==='bad')throw failure;return[state+1,Effect.subscription<string>('source',()=>()=>{cleanups++;})];},onTurn:event=>{events.push(event);throw new Error('observer');},onSubscriberError:()=>{throw new Error('observer sink');}});
 const good={action:'good'},bad={action:'bad'};queue.enqueue(good);expect(()=>queue.enqueue(bad)).toThrow(failure);expect(events[0]).toMatchObject({type:'committed',state:1});expect(events[0]!.envelope).toBe(good);expect(events[1]).toMatchObject({type:'rejected',error:failure});expect(events[1]!.envelope).toBe(bad);expect(queue.getState()).toBe(1);queue.destroy();expect(cleanups).toBe(1);
});
