import {it,expect,vi} from 'vitest';
import {TurnQueue} from '../src/lib/execution/turn-queue.js';
import {EffectRuntime} from '../src/lib/execution/runtime.js';
import {DeterministicScheduler} from '../src/lib/execution/scheduler.js';
import {Effect} from '../src/lib/effect.js';
import type {ResourceRecord} from '../src/lib/execution/resources.js';
type S={route:string;booted:string[]};type A={type:'go';route:string}|{type:'boot';route:string}|{type:'tick'};type D={suffix:string};
function setup(decide:(state:S,deps:D)=>A|undefined,started?:(record:ResourceRecord)=>void,server=false){
 const trace:string[]=[];const runtime=new EffectRuntime<A>({scheduler:new DeterministicScheduler(),dispatch:()=>{},isServer:()=>server,onEvent:event=>{if(event.type==='started')started?.(event.record);}});
 const queue=new TurnQueue<S,A,D>({initialState:{route:'/server',booted:[]},dependencies:{suffix:'!'},runtime,reducer:(state,action)=>{trace.push(action.type+(action.type==='tick'?'':action.route));return[action.type==='go'?{...state,route:action.route}:action.type==='boot'?{...state,booted:[...state.booted,action.route]}:state,Effect.none()];},execution:{mode:'managed',_initialization:{mode:'attached',startupDecision:decide}}});return{queue,runtime,trace};
}
it('startup decision remains unevaluated until activation and receives accepted state/dependencies once',()=>{
 const decide=vi.fn((state:S,deps:D):A=>({type:'boot',route:state.route+deps.suffix}));const f=setup(decide);expect(decide).not.toHaveBeenCalled();f.queue.dispatch({type:'go',route:'/client'});f.queue.activateInitialization({live:true});expect(f.queue.getState().booted).toEqual(['/client!']);f.queue.activateInitialization({live:true});expect(decide).toHaveBeenCalledOnce();expect(f.runtime.pendingWorkCount).toBe(0);f.queue.destroy();
});
it('decision resolves at its reserved FIFO position, ahead of subsequently queued work',()=>{
 const f=setup(state=>({type:'boot',route:state.route}));let queued=false;f.queue.subscribeToActions(action=>{if(action.type==='tick'&&!queued){queued=true;f.queue.activateInitialization({live:true});f.queue.dispatch({type:'go',route:'/before'});}else if(action.type==='go'&&action.route==='/before')f.queue.dispatch({type:'go',route:'/after'});});f.queue.dispatch({type:'tick'});expect(f.trace).toEqual(['tick','go/before','boot/before','go/after']);f.queue.destroy();
});
it('claim loss during pending record settlement restages the unevaluated decision',()=>{
 const claim={live:true};let released=false;let f:ReturnType<typeof setup>;const decide=vi.fn((state:S):A=>({type:'boot',route:state.route}));f=setup(decide,record=>{if(record.description==='Pending root startup')record.addCleanup(()=>{if(!released){released=true;claim.live=false;f.queue.releaseInitialization(claim);}});});f.queue.activateInitialization(claim);expect(decide).not.toHaveBeenCalled();f.queue.dispatch({type:'go',route:'/new'});f.queue.activateInitialization({live:true});expect(decide).toHaveBeenCalledOnce();expect(f.queue.getState().booted).toEqual(['/new']);f.queue.destroy();
});
it('impure decision claim retirement cannot preserve a stale computed action',()=>{
 const claim={live:true};let retire=true;let f:ReturnType<typeof setup>;const decide=vi.fn((state:S):A=>{if(retire){retire=false;claim.live=false;f.queue.releaseInitialization(claim);}return{type:'boot',route:state.route};});f=setup(decide);f.queue.activateInitialization(claim);expect(f.queue.getState().booted).toEqual([]);f.queue.dispatch({type:'go',route:'/new'});f.queue.activateInitialization({live:true});expect(f.queue.getState().booted).toEqual(['/new']);expect(decide).toHaveBeenCalledTimes(2);f.queue.destroy();
});
it('undefined decision settles without a business action or later replay',()=>{const decide=vi.fn(()=>undefined);const f=setup(decide);f.queue.activateInitialization({live:true});f.queue.activateInitialization({live:true});expect(decide).toHaveBeenCalledOnce();expect(f.queue.history).toEqual([]);expect(f.runtime.pendingWorkCount).toBe(0);f.queue.destroy();});
it('throwing decision is terminal and surfaced without stranding pending work',()=>{const decide=vi.fn(()=>{throw new Error('startup decision');});const f=setup(decide);expect(()=>f.queue.activateInitialization({live:true})).toThrow('startup decision');f.queue.activateInitialization({live:true});expect(decide).toHaveBeenCalledOnce();expect(f.runtime.pendingWorkCount).toBe(0);f.queue.destroy();});
it('server and destroyed roots never evaluate a startup decision',()=>{const decide=vi.fn(()=>undefined);const server=setup(decide,undefined,true);server.queue.activateInitialization({live:true});server.queue.destroy();const dead=setup(decide);dead.queue.destroy();dead.queue.activateInitialization({live:true});expect(decide).not.toHaveBeenCalled();});
