import {afterEach,expect,it,vi} from 'vitest';
import {createStore} from '../../src/lib/store.svelte.js';
import {integrate} from '../../src/lib/navigation/integrate.js';
import {optionalSlot} from '../../src/lib/navigation/managed-integration.js';
import {managedRootAccess} from '../../src/lib/execution/store-access.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
import type {PresentationAction} from '../../src/lib/navigation/types.js';
import {bindManagedRootRoute} from '../../src/lib/routing/managed-binding.js';
import type {HistoryPort,HistorySnapshot} from '../../src/lib/routing/managed-history.js';
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();vi.restoreAllMocks();});
type State={url:string;child:{count:number}|null;tick:number};
type Action={type:'go';url:string}|{type:'replace'}|{type:'tick'}|{type:'startup';url:string}|{type:'child';action:PresentationAction<{type:'inc'}>};
const slot=optionalSlot<State,Action>()('child');
function fixture(){
 const trace:string[]=[];
 const reducer:Reducer<State,Action>=(state,action)=>{
  trace.push(action.type==='go'||action.type==='startup'?`${action.type}:${action.url}`:action.type);
  if(action.type==='go'&&action.url==='/throw')throw new Error('route reducer failed');
  return[action.type==='go'&&action.url!=='/blocked'?{...state,url:action.url}:action.type==='replace'?{...state,child:{count:0}}:action.type==='tick'?{...state,tick:state.tick+1}:state,Effect.none()];
 };
 const child:Reducer<{count:number},{type:'inc'}>=(state)=>[{count:state.count+1},Effect.none()];
 const composition=integrate(reducer).managed().with(slot,child,{replaceOn:action=>action.type==='replace'}).build();
 const store=createStore({initialState:{url:'/server',child:{count:0},tick:0},...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:(state):Action=>({type:'startup',url:state.url})}}});
 cleanups.push(()=>store.destroy());
 let current:HistorySnapshot={url:'/incoming',state:null,entryKey:'key-0'},id=0;let listener:(()=>void)|undefined;
 const port:HistoryPort={read:()=>current,replace:vi.fn((url,state)=>{current={...current,url,state};}),push:vi.fn((url,state)=>{current={url,state,entryKey:`key-${++id}`};}),go:vi.fn(),listen:vi.fn(fn=>{listener=fn;return()=>{listener=undefined;};})};
 const report=vi.fn(),ready=vi.fn(),failed=vi.fn();
 const options={store,execution:composition.execution,port,initial:'request-url' as const,serialize:(state:State)=>state.url,request:(url:string)=>({action:{type:'go' as const,url},expectedURL:url}),id:()=>`id-${++id}`,report,_attachment:{ready,failed}};
 return {store,composition,trace,port,report,ready,failed,options,get listening(){return !!listener;},setURL(url:string,state:unknown=null){current={url,state,entryKey:`key-${++id}`};},visit(url:string){current={url,state:null,entryKey:`key-${++id}`};listener?.();}};
}
it('root route accepts one ordinary root turn then becomes ready with listener installed',()=>{
 const f=fixture();f.ready.mockImplementation(()=>expect(f.listening).toBe(true));const binding=bindManagedRootRoute(f.options)!;
 expect(f.trace).toEqual(['go:/incoming']);expect(f.store.state.url).toBe('/incoming');expect(f.ready).toHaveBeenCalledOnce();expect(f.failed).not.toHaveBeenCalled();
 f.store.dispatch({type:'replace'});expect(f.listening).toBe(true);f.visit('/next');expect(f.store.state.url).toBe('/next');binding.dispose();expect(f.listening).toBe(false);
});
it('root attachment canceled while queued cannot dispatch despite root remaining live',()=>{
 const f=fixture();let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;const binding=bindManagedRootRoute(f.options)!;binding.dispose();}});cleanups.push(stop);f.store.dispatch({type:'tick'});
 expect(f.trace).toEqual(['tick']);expect(f.store.state.url).toBe('/server');expect(f.ready).not.toHaveBeenCalled();expect(f.failed).not.toHaveBeenCalled();expect(f.listening).toBe(false);f.store.dispatch({type:'go',url:'/alive'});expect(f.store.state.url).toBe('/alive');
});
it('root destruction drops queued initial route without installing listener or readiness',()=>{
 const f=fixture();const stop=f.store.subscribe(state=>{if(state.tick===1){bindManagedRootRoute(f.options);f.store.destroy();}});cleanups.push(stop);f.store.dispatch({type:'tick'});
 expect(f.trace).toEqual(['tick']);expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);expect(f.store._runtime!.resourceScope.size).toBe(0);
});
it('readiness activates lazy startup only after the accepted initial URL',()=>{
 const f=fixture();const claim={live:true};const access=managedRootAccess(f.store,f.composition.execution);f.ready.mockImplementation(()=>access.activateInitialization(claim));
 bindManagedRootRoute(f.options);expect(f.trace).toEqual(['go:/incoming','startup:/incoming']);
});
it('queued readiness preserves root FIFO ordering rather than running startup directly',()=>{
 const f=fixture();const claim={live:true};f.ready.mockImplementation(()=>managedRootAccess(f.store,f.composition.execution).activateInitialization(claim));let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;bindManagedRootRoute(f.options);f.store.dispatch({type:'go',url:'/later'});}});cleanups.push(stop);f.store.dispatch({type:'tick'});
 expect(f.trace).toEqual(['tick','go:/incoming','go:/later','startup:/later']);expect(f.ready).toHaveBeenCalledOnce();expect(f.port.read().url).toBe('/later');
});
it('explicit route rejection can ready the accepted state',()=>{const f=fixture();f.setURL('/blocked');bindManagedRootRoute(f.options);expect(f.store.state.url).toBe('/server');expect(f.port.read().url).toBe('/server');expect(f.ready).toHaveBeenCalledOnce();expect(f.failed).not.toHaveBeenCalled();});
it.each([false,true])('initial reducer exception fails attachment once, queued=%s',queued=>{
 const f=fixture();f.setURL('/throw');let once=false;
 if(queued){const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;bindManagedRootRoute(f.options);}});cleanups.push(stop);expect(()=>f.store.dispatch({type:'tick'})).toThrow('route reducer failed');}
 else bindManagedRootRoute(f.options);
 expect(f.failed).toHaveBeenCalledOnce();expect(f.failed.mock.calls[0]![0]).toEqual(new Error('route reducer failed'));expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);
});
it('unsupported metadata fails before listener enrollment and reports exact initialization error',()=>{
 const f=fixture();f.setURL('/incoming',new Date());bindManagedRootRoute(f.options);expect(f.failed).toHaveBeenCalledOnce();expect(f.ready).not.toHaveBeenCalled();expect(f.port.listen).not.toHaveBeenCalled();expect(f.report.mock.calls.some(([event])=>event.type==='historyFailure'&&event.error===f.failed.mock.calls[0]![0])).toBe(true);
});
it('shared composition across roots never cross-targets routing',()=>{
 const f=fixture();const other=createStore({initialState:{url:'/other',child:null,tick:0},...f.composition});cleanups.push(()=>other.destroy());bindManagedRootRoute({...f.options,store:other});expect(other.state.url).toBe('/incoming');expect(f.store.state.url).toBe('/server');
});
it('failure observer exceptions cannot prevent root queue draining',()=>{
 const f=fixture();f.setURL('/throw');f.failed.mockImplementation(()=>{throw new Error('failure observer');});let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;bindManagedRootRoute(f.options);f.store.dispatch({type:'go',url:'/after'});}});cleanups.push(stop);expect(()=>f.store.dispatch({type:'tick'})).toThrow('route reducer failed');expect(f.store.state.url).toBe('/after');expect(f.listening).toBe(false);expect(f.report.mock.calls.some(([event])=>event.error?.message==='failure observer')).toBe(true);
});
it('undefined is a valid live root state rather than an absent child',()=>{
 const reducer:Reducer<undefined,{type:'noop'}>=state=>[state,Effect.none()];const composition=integrate(reducer).managed().build();const store=createStore({initialState:undefined,...composition});cleanups.push(()=>store.destroy());const f=fixture();bindManagedRootRoute({...f.options,store,execution:composition.execution,initial:'accepted-state',serialize:()=>'/undefined',request:():{action:{type:'noop'};expectedURL:string}=>({action:{type:'noop'},expectedURL:'/undefined'})});expect(f.ready).toHaveBeenCalledOnce();expect(f.port.read().url).toBe('/undefined');
});
it('destroyed root cannot acquire another connection',()=>{const f=fixture();f.store.destroy();expect(bindManagedRootRoute(f.options)).toBeUndefined();expect(f.port.listen).not.toHaveBeenCalled();expect(f.ready).not.toHaveBeenCalled();});
it('foreign composition authority is rejected before touching the browser',()=>{const f=fixture(),other=fixture();expect(()=>bindManagedRootRoute({...f.options,execution:other.composition.execution})).toThrow('does not belong');expect(f.port.listen).not.toHaveBeenCalled();});
it('initial request exception fails attachment without readiness',()=>{const f=fixture();const error=new Error('parse failed');bindManagedRootRoute({...f.options,request:()=>{throw error;}});expect(f.failed).toHaveBeenCalledExactlyOnceWith(error);expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);});
it('retirement inside the request resolver cannot commit its action',()=>{
 const f=fixture();let binding:ReturnType<typeof bindManagedRootRoute<State,Action,unknown>>;let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;binding=bindManagedRootRoute({...f.options,request:url=>{binding?.dispose();return{action:{type:'go',url},expectedURL:url};}});}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual(['tick']);expect(f.listening).toBe(false);expect(f.ready).not.toHaveBeenCalled();
});
it('root destroyed by metadata diagnostics cannot receive readiness or retain listeners',()=>{
 const f=fixture();f.setURL('/incoming',new Date());f.report.mockImplementation(()=>f.store.destroy());bindManagedRootRoute(f.options);expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);expect(f.store._runtime!.resourceScope.size).toBe(0);
});
it('queued readiness failure retires the captured root before diagnostics without harming another root',()=>{
 const f=fixture(),other=fixture();const error=new Error('startup activation failed');f.ready.mockImplementation(()=>{throw error;});f.failed.mockImplementation(()=>f.store.destroy());const disposedAtReport:boolean[]=[];f.report.mockImplementation(()=>disposedAtReport.push(f.store._runtime!.isDisposed));let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;bindManagedRootRoute(f.options);}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.ready).toHaveBeenCalledOnce();expect(f.failed).toHaveBeenCalledExactlyOnceWith(error);expect(disposedAtReport).toEqual([true]);expect(f.listening).toBe(false);expect(f.store._runtime!.resourceScope.size).toBe(0);other.store.dispatch({type:'go',url:'/unrelated'});expect(other.store.state.url).toBe('/unrelated');
});
it('malformed asynchronous readiness rejection follows the same owned failure path',async()=>{
 const f=fixture();const error=new Error('async readiness');f.ready.mockImplementation(async()=>{throw error;});f.failed.mockImplementation(()=>f.store.destroy());bindManagedRootRoute(f.options);await Promise.resolve();await Promise.resolve();expect(f.failed).toHaveBeenCalledExactlyOnceWith(error);expect(f.listening).toBe(false);expect(f.store._runtime!.resourceScope.size).toBe(0);
});
it('late readiness rejection cannot invalidate an already retired attachment replacement',async()=>{
 const f=fixture();let reject:(error:unknown)=>void=()=>{};const late=new Promise<void>((_resolve,fail)=>{reject=fail;});f.ready.mockImplementation(()=>late);const first=bindManagedRootRoute(f.options)!;first.dispose();const nextReady=vi.fn();const next=bindManagedRootRoute({...f.options,_attachment:{ready:nextReady,failed:()=>f.store.destroy()}})!;reject(new Error('old readiness'));await Promise.resolve();await Promise.resolve();expect(f.failed).not.toHaveBeenCalled();expect(nextReady).toHaveBeenCalledOnce();expect(f.listening).toBe(true);next.dispose();
});
it.each(['decision','action'] as const)('queued startup %s failure reaches exact attachment and retires root resources',kind=>{
 const f=fixture();const error=new Error(`startup ${kind}`);const reducer:Reducer<State,Action>=(state,action)=>{if(action.type==='startup')throw error;return[action.type==='go'?{...state,url:action.url}:action.type==='tick'?{...state,tick:1}:state,Effect.none()];};
 const composition=integrate(reducer).managed().build();const store=createStore({initialState:{url:'/server',child:null,tick:0},...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:(state):Action=>{if(kind==='decision')throw error;return{type:'startup',url:state.url};}}}});cleanups.push(()=>store.destroy());
 const failure=vi.fn(()=>{claim.live=false;store.destroy();});const claim={live:true,onFailure:failure};let once=false;const stop=store.subscribe(state=>{if(state.tick===1&&!once){once=true;bindManagedRootRoute({...f.options,store,execution:composition.execution,_attachment:{ready:()=>managedRootAccess(store,composition.execution).activateInitialization(claim),failed:failure}});}});cleanups.push(stop);
 expect(()=>store.dispatch({type:'tick'})).toThrow(error);expect(failure).toHaveBeenCalledExactlyOnceWith(error);expect(f.listening).toBe(false);expect(store._runtime!.resourceScope.size).toBe(0);expect(f.store._runtime!.isDisposed).toBe(false);
});
it('initialization failure observer exceptions do not stop unrelated queued turns or reactivate failed claim',()=>{
 const errors:unknown[]=[];const original=new Error('startup decision');const observer=new Error('failure observer');const reducer:Reducer<number,{type:'tick'}>=(state)=>[state+1,Effect.none()];const composition=integrate(reducer).managed().build();const store=createStore({initialState:0,...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:()=>{throw original;}}}});cleanups.push(()=>store.destroy());const access=managedRootAccess(store,composition.execution);const claim={live:true,onFailure:vi.fn(()=>{store.dispatch({type:'tick'});throw observer;})};vi.spyOn(console,'error').mockImplementation((...args)=>{errors.push(...args);});expect(()=>access.activateInitialization(claim)).toThrow(original);expect(store.state).toBe(1);access.activateInitialization(claim);expect(claim.onFailure).toHaveBeenCalledOnce();expect(errors).toContain(observer);
});
it('retired claim cannot route its startup error into a replacement attachment',()=>{
 const failure=vi.fn();const replacementFailure=vi.fn();const claim={live:true,onFailure:failure},replacement={live:true,onFailure:replacementFailure};let replace:()=>void=()=>{};const error=new Error('retired impure startup');const reducer:Reducer<number,{type:'noop'}>=state=>[state,Effect.none()];const composition=integrate(reducer).managed().build();const store=createStore({initialState:0,...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:()=>{replace();throw error;}}}});cleanups.push(()=>store.destroy());const access=managedRootAccess(store,composition.execution);replace=()=>{claim.live=false;access.releaseInitialization(claim);access.activateInitialization(replacement);};expect(()=>access.activateInitialization(claim)).toThrow(error);expect(failure).not.toHaveBeenCalled();expect(replacementFailure).not.toHaveBeenCalled();
});
it('initial listener failure cannot declare readiness',()=>{const f=fixture();const error=new Error('listener refused');vi.mocked(f.port.listen).mockImplementation(()=>{throw error;});bindManagedRootRoute(f.options);expect(f.failed).toHaveBeenCalledExactlyOnceWith(error);expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);});
it('reentrant state change during listener setup must synchronize successfully before readiness',()=>{
 const f=fixture();const error=new Error('initial resynchronization');const listen=vi.mocked(f.port.listen).getMockImplementation()!;vi.mocked(f.port.listen).mockImplementation(listener=>{const stop=listen(listener);f.store.dispatch({type:'go',url:'/newer'});return stop;});vi.mocked(f.port.push).mockImplementation(()=>{throw error;});bindManagedRootRoute({...f.options,initial:'accepted-state'});expect(f.store.state.url).toBe('/newer');expect(f.failed).toHaveBeenCalledExactlyOnceWith(error);expect(f.ready).not.toHaveBeenCalled();expect(f.listening).toBe(false);
});
import {TestStore} from '../../src/lib/test/test-store.js';
it('TestStore uses the same captured startup failure observer and terminal cleanup',()=>{
 const error=new Error('test startup');const failure=vi.fn();const store=new TestStore<number,{type:'noop'}>({initialState:0,reducer:state=>[state,Effect.none()],execution:{mode:'managed',_initialization:{mode:'attached',startupDecision:()=>{throw error;}}}});const claim={live:true,onFailure:failure};try{expect(()=>store._activateInitialization(claim)).toThrow(error);expect(failure).toHaveBeenCalledExactlyOnceWith(error);store._activateInitialization(claim);expect(failure).toHaveBeenCalledOnce();}finally{store.destroy();}
});
it('rejected initialization-failure observer is observed without replacing the original aggregate',async()=>{
 const original=new Error('original startup'),observer=new Error('async failure observer');const errors:unknown[]=[];vi.spyOn(console,'error').mockImplementation((...args)=>{errors.push(...args);});const reducer:Reducer<number,{type:'noop'}>=state=>[state,Effect.none()];const composition=integrate(reducer).managed().build();const store=createStore({initialState:0,...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:()=>{throw original;}}}});cleanups.push(()=>store.destroy());const claim={live:true,onFailure:vi.fn(async()=>{throw observer;})};const access=managedRootAccess(store,composition.execution);expect(()=>access.activateInitialization(claim)).toThrow(original);await Promise.resolve();await Promise.resolve();expect(errors).toContain(observer);access.activateInitialization(claim);expect(claim.onFailure).toHaveBeenCalledOnce();
});
