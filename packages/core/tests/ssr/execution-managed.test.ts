import {it,expect} from 'vitest';
import {createStore} from '../../src/lib/store.svelte.js';
import {Effect} from '../../src/lib/effect.js';
import {createDeterministicScheduler} from '../../src/lib/execution/scheduler.js';
it('managed SSR reduces feature state without acquiring or replaying deferred effects',async()=>{
 const scheduler=createDeterministicScheduler();let fired=0;
 const store=createStore({initialState:0,reducer:(s:number,_a:string)=>[s+1,Effect.afterDelay<string>(10,()=>{fired++;})] as const,execution:{mode:'managed',scheduler}});
 store.dispatch('request');expect(store.state).toBe(1);expect(scheduler.pendingTimersCount).toBe(0);expect(store._runtime!.pendingWorkCount).toBe(0);await scheduler.advanceTime(100);expect(fired).toBe(0);store.destroy();
});
it('explicit SSR execution is request-owned and destruction cancels its timers',async()=>{
 const scheduler=createDeterministicScheduler();let fired=0;
 const store=createStore({initialState:0,reducer:(s:number,_a:string)=>[s+1,Effect.afterDelay<string>(10,()=>{fired++;})] as const,execution:{mode:'managed',scheduler},ssr:{deferEffects:false}});
 store.dispatch('request');expect(scheduler.pendingTimersCount).toBe(1);store.destroy();expect(scheduler.pendingTimersCount).toBe(0);await scheduler.advanceTime(100);expect(fired).toBe(0);
});
