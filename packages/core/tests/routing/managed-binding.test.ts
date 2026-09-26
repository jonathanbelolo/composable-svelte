import {afterEach,it,expect,vi} from 'vitest';
import {createStore} from '../../src/lib/store.svelte.js';
import {integrate} from '../../src/lib/navigation/integrate.js';
import {optionalSlot} from '../../src/lib/navigation/managed-integration.js';
import {managedRootAccess,capturedView} from '../../src/lib/execution/store-access.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
import type {PresentationAction} from '../../src/lib/navigation/types.js';
import {bindManagedRoute,planManagedRoute} from '../../src/lib/routing/managed-binding.js';
import {defaultHistoryMetadataCodec, type HistoryPort, type HistorySnapshot} from '../../src/lib/routing/managed-history.js';
type Child={url:string};type CA={type:'go';url:string};type State={route:Child|null;tick:number};type Action={type:'route';action:PresentationAction<CA>}|{type:'tick'}|{type:'replace'};
const slot=optionalSlot<State,Action>()('route');const cleanups:Array<()=>void>=[];afterEach(()=>{for(const stop of cleanups.splice(0).reverse())stop();vi.restoreAllMocks();});
function fixture(initial:'accepted-state'|'request-url'='accepted-state',fragment:'native'|'route'='route'){
 const trace:string[]=[];const child:Reducer<Child,CA>=(state,action)=>{trace.push(action.url);if(action.url==='/throw')throw new Error('declined by throw');return[action.url==='/blocked'?state:{url:action.url.split('?')[0]!},Effect.none()];};
 const core:Reducer<State,Action>=(state,action)=>[action.type==='tick'?{...state,tick:state.tick+1}:action.type==='replace'?{...state,route:{url:'/replacement'}}:state,Effect.none()];
 const composition=integrate(core).managed().with(slot,child,{replaceOn:action=>action.type==='replace'}).build();const store=createStore({initialState:{route:{url:'/home'},tick:0},...composition});cleanups.push(()=>store.destroy());
 let key=0;const keys=['key-0'];let current:HistorySnapshot={url:'/incoming',state:null,entryKey:'key-0'};let listener:(()=>void)|undefined;const port:HistoryPort={read:()=>current,liveEntryKeys:()=>keys,replace:vi.fn((url,state)=>{current={url,state,entryKey:current.entryKey!};}),push:vi.fn((url,state)=>{const entryKey=`key-${++key}`;keys.push(entryKey);current={url,state,entryKey};}),go:vi.fn(),listen:vi.fn(fn=>{listener=fn;return()=>{listener=undefined;};})};const report=vi.fn();let n=0;
 const binding=bindManagedRoute({store,composition,slot,port,initial,fragment,serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url.split('?')[0]!}),id:()=>String(++n),report})!;cleanups.push(()=>binding.dispose());
 return {store,composition,port,trace,report,binding,visit(url:string){const entryKey=`unknown-${++key}`;keys.push(entryKey);current={url,state:null,entryKey};listener?.();},visitSnapshot(snapshot:HistorySnapshot){current=snapshot;listener?.();},get listening(){return listener!==undefined;}};
}
it('accepted application changes write once; traversal canonicalization does not push',()=>{const f=fixture();f.store.dispatch(slot.wrap({type:'go',url:'/one'}));expect(f.port.push).toHaveBeenCalledOnce();f.visit('/two?tracking=1');expect(f.store.state.route?.url).toBe('/two');expect(f.port.read().url).toBe('/two');expect(f.port.push).toHaveBeenCalledOnce();});
it('initial browser authority is an explicit accepted reducer request',()=>{const f=fixture('request-url');expect(f.trace).toEqual(['/incoming']);expect(f.store.state.route?.url).toBe('/incoming');expect(f.port.read().url).toBe('/incoming');});
it('queued traversal acceptance sees its own committed state',()=>{const f=fixture();let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;f.visit('/queued');f.store.dispatch(slot.wrap({type:'go',url:'/after'}));}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual(['/queued','/after']);expect(f.port.read().url).toBe('/after');expect(f.port.push).toHaveBeenCalledTimes(1);});
it('same-key replacement retires listener and queued old-owner turn',()=>{const f=fixture();const stop=f.store.subscribe(state=>{if(state.tick===1&&state.route?.url==='/home'){f.store.dispatch({type:'replace'});f.visit('/stale');}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual([]);expect(f.store.state.route?.url).toBe('/replacement');expect(f.listening).toBe(false);});
it('destruction during queued traversal prevents a response or listener leak',()=>{const f=fixture();const stop=f.store.subscribe(state=>{if(state.tick===1){f.visit('/queued');f.store.destroy();}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual([]);expect(f.listening).toBe(false);expect(f.store._runtime!.resourceScope.size).toBe(0);});
it('pure server URL planning neither dispatches nor touches a browser port',()=>{const request=vi.fn((url:string)=>({action:{type:'go' as const,url},expectedURL:url}));expect(planManagedRoute('/server',request)).toEqual({action:{type:'go',url:'/server'},expectedURL:'/server'});expect(request).toHaveBeenCalledOnce();});
it('exact-envelope observers distinguish reused actions and survive observer exceptions',async()=>{const f=fixture();const access=managedRootAccess(f.store,f.composition.execution);const owner=capturedView(f.composition.bind(f.store,slot)!).origin;const envelopes:object[]=[];const seen:string[]=[];const log=vi.spyOn(console,'error').mockImplementation(()=>{});const action=slot.wrap({type:'go',url:'/same'});let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;access.enqueueObserved(action,owner,event=>{envelopes.push(event.envelope);seen.push(event.type);throw new Error('observer');});access.enqueueObserved(action,owner,event=>{envelopes.push(event.envelope);seen.push(event.type);});}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(seen).toEqual(['committed','committed']);expect(envelopes[0]).not.toBe(envelopes[1]);expect(log).toHaveBeenCalled();});
it('rejected exact turns report original errors and do not strand the next queued request',()=>{
 const f=fixture();const access=managedRootAccess(f.store,f.composition.execution);const owner=capturedView(f.composition.bind(f.store,slot)!).origin;const seen:string[]=[];let error:unknown;let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;access.enqueueObserved(slot.wrap({type:'go',url:'/throw'}),owner,event=>{seen.push(event.type);if(event.type==='rejected')error=event.error;});access.enqueueObserved(slot.wrap({type:'go',url:'/after'}),owner,event=>seen.push(event.type));}});cleanups.push(stop);
 expect(()=>f.store.dispatch({type:'tick'})).toThrow();expect(seen).toEqual(['rejected','committed']);expect(error).toEqual(new Error('declined by throw'));expect(f.store.state.route?.url).toBe('/after');
});
it('destroyed queued turns notify their exact observer once even if it rejects asynchronously',async()=>{
 const f=fixture();const access=managedRootAccess(f.store,f.composition.execution);const owner=capturedView(f.composition.bind(f.store,slot)!).origin;const seen:string[]=[];const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const stop=f.store.subscribe(state=>{if(state.tick===1){access.enqueueObserved(slot.wrap({type:'go',url:'/queued'}),owner,async event=>{seen.push(event.type);throw new Error('async observer');});f.store.destroy();}});cleanups.push(stop);f.store.dispatch({type:'tick'});await Promise.resolve();await Promise.resolve();expect(seen).toEqual(['dropped']);expect(log).toHaveBeenCalled();expect(f.store._runtime!.resourceScope.size).toBe(0);
});
it('initial serialization failure allocates no route resource',()=>{
 const f=fixture();const before=f.store._runtime!.resourceScope.size;expect(()=>bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:()=>{throw new Error('codec');},request:()=>undefined,id:()=> 'id',report:f.report})).toThrow('codec');expect(f.store._runtime!.resourceScope.size).toBe(before);
});
it('typed slot fixes the request action domain',()=>{
 const f=fixture();
 if(false){
  // @ts-expect-error A route slot cannot receive an unrelated child action.
  bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'unrelated',url},expectedURL:url}),id:()=> 'id',report:f.report});
 }
});

import {TurnQueue} from '../../src/lib/execution/turn-queue.js';
import {EffectRuntime} from '../../src/lib/execution/runtime.js';
import {createDeterministicScheduler} from '../../src/lib/execution/scheduler.js';
import {ownerAt} from '../../src/lib/execution/identity.js';
it('one-shot observer is detached before a reentrant reuse of its envelope',()=>{
 const runtime=new EffectRuntime<string>({scheduler:createDeterministicScheduler(),dispatch:()=>{},isServer:()=>false});
 const queue=new TurnQueue<number,string>({initialState:0,reducer:state=>[state+1,Effect.none()],runtime,execution:{mode:'managed',slots:{select:()=>[[{slot:'route'}]]}}});
 const owner=ownerAt(queue.getLifecycle(),[{slot:'route'}])!;let calls=0;
 queue.enqueueObserved('increment',owner,event=>{calls++;if(calls===1)queue.enqueue(event.envelope);});
 expect(calls).toBe(1);expect(queue.getState()).toBe(2);queue.destroy();
});

it('queued older acceptance remains the rollback destination when the newer traversal rejects',()=>{
 const f=fixture();const base=f.port.read();f.store.dispatch(slot.wrap({type:'go',url:'/one'}));const one={...f.port.read(),url:'/one?tracking=x'};f.store.dispatch(slot.wrap({type:'go',url:'/two'}));let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;f.visitSnapshot(one);f.visitSnapshot({...base,url:'/blocked'});}});cleanups.push(stop);
 f.store.dispatch({type:'tick'});expect(f.store.state.route?.url).toBe('/one');expect(f.port.go).toHaveBeenCalledWith(1);expect(f.port.read().url).toBe('/blocked');const calls=f.trace.length;f.visitSnapshot(one);expect(f.trace).toHaveLength(calls);expect(f.port.read().url).toBe('/one');
});

it.each<[string,string,string,number|undefined]>([
 ['/one','/home','/home',undefined],
 ['/blocked','/blocked','/two',2],
 ['/blocked','/home','/home',undefined]
])('queued traversal pair %s then %s preserves accepted state/history', (firstURL,secondURL,finalURL,delta)=>{
 const f=fixture();const base=f.port.read();f.store.dispatch(slot.wrap({type:'go',url:'/one'}));const one=f.port.read();f.store.dispatch(slot.wrap({type:'go',url:'/two'}));let once=false;
 const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;f.visitSnapshot({...one,url:firstURL});f.visitSnapshot({...base,url:secondURL});}});cleanups.push(stop);f.store.dispatch({type:'tick'});
 expect(f.store.state.route?.url).toBe(finalURL);if(delta===undefined){expect(f.port.go).not.toHaveBeenCalled();expect(f.port.read().url).toBe(finalURL);}else expect(f.port.go).toHaveBeenCalledWith(delta);
 expect(f.port.push).toHaveBeenCalledTimes(2);
});

it('a synchronous reducer rejection emits one routing failure diagnostic',()=>{const f=fixture();f.visit('/throw');expect(f.report.mock.calls.filter(([event])=>event.type==='historyFailure')).toHaveLength(1);});
it.each(['serialize','classify'] as const)('a throwing %s is reported and settles the browser response',kind=>{
 const f=fixture();f.binding.dispose();const failure=new Error(kind);let id=0;
 const binding=bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:state=>{if(kind==='serialize'&&state.url==='/bad')throw failure;return state.url;},classify:input=>{if(kind==='classify'&&input.acceptedURL==='/bad')throw failure;return 'accepted';},request:url=>({action:{type:'go',url},expectedURL:url}),id:()=>`failure-${++id}`,report:f.report})!;cleanups.push(()=>binding.dispose());
 f.visit('/bad');expect(f.report).toHaveBeenCalledWith({type:'historyFailure',operation:'traverse',error:failure});expect(f.port.read().url).toBe('/home');f.store.dispatch(slot.wrap({type:'go',url:'/recovered'}));expect(f.port.read().url).toBe('/recovered');
});

it('a pure application write policy can replace instead of push',()=>{
 const f=fixture();f.binding.dispose();let id=0;const binding=bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),writePolicy:()=> 'replace',id:()=>`replace-${++id}`,report:f.report})!;cleanups.push(()=>binding.dispose());f.store.dispatch(slot.wrap({type:'go',url:'/replacement-url'}));expect(f.port.push).not.toHaveBeenCalled();expect(f.port.read().url).toBe('/replacement-url');
});

it('a failed history write retries on a later accepted state update without losing feature authority',()=>{
 const f=fixture();vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('browser write');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));expect(f.store.state.route?.url).toBe('/retry');expect(f.port.read().url).toBe('/home');f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));expect(f.port.read().url).toBe('/retry');expect(f.port.push).toHaveBeenCalledTimes(2);
});
it('a throwing application write policy can recover on a later update',()=>{
 const f=fixture();f.binding.dispose();let fail=true,id=0;const binding=bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),writePolicy:()=>{if(fail)throw new Error('write policy');return 'replace';},id:()=>`policy-${++id}`,report:f.report})!;cleanups.push(()=>binding.dispose());f.store.dispatch(slot.wrap({type:'go',url:'/retry-policy'}));expect(f.port.read().url).toBe('/home');fail=false;f.store.dispatch(slot.wrap({type:'go',url:'/retry-policy'}));expect(f.port.read().url).toBe('/retry-policy');
});

it('rejected traversal after a failed write preserves the committed feature URL',()=>{
 const f=fixture();vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('browser write');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));f.visit('/blocked');expect(f.store.state.route?.url).toBe('/retry');expect(f.port.read().url).toBe('/retry');expect(f.port.go).not.toHaveBeenCalled();
});
it('rejected traversal after a policy failure preserves the committed feature URL',()=>{
 const f=fixture();f.binding.dispose();let id=0;const binding=bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),writePolicy:()=>{throw new Error('policy');},id:()=>`policy-rejection-${++id}`,report:f.report})!;cleanups.push(()=>binding.dispose());f.store.dispatch(slot.wrap({type:'go',url:'/retry-policy'}));f.visit('/blocked');expect(f.store.state.route?.url).toBe('/retry-policy');expect(f.port.read().url).toBe('/retry-policy');expect(f.port.go).not.toHaveBeenCalled();
});

it('a rejected traversal whose rebase succeeds settles the retry without another write',()=>{
 const f=fixture();vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('push');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));f.visit('/blocked');expect(f.port.read().url).toBe('/retry');
 const pushes=vi.mocked(f.port.push).mock.calls.length,replaces=vi.mocked(f.port.replace).mock.calls.length;f.store.dispatch({type:'tick'});f.store.dispatch({type:'tick'});
 expect(f.port.push).toHaveBeenCalledTimes(pushes);expect(f.port.replace).toHaveBeenCalledTimes(replaces);expect(f.port.read().url).toBe('/retry');expect(f.port.go).not.toHaveBeenCalled();
});
it('a failed rejection rebase is retried on the next accepted turn and then stays settled',()=>{
 const f=fixture();const failure=new Error('rebase');vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('push');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));const replace=vi.mocked(f.port.replace).getMockImplementation()!;let writes=0;vi.mocked(f.port.replace).mockImplementation((url,state)=>{if(++writes===2)throw failure;return replace(url,state);});
 f.visit('/blocked');expect(f.store.state.route?.url).toBe('/retry');expect(f.report).toHaveBeenCalledWith({type:'historyFailure',operation:'traverse',error:failure});f.store.dispatch({type:'tick'});expect(f.port.read().url).toBe('/retry');
 const settled=writes,pushes=vi.mocked(f.port.push).mock.calls.length;f.store.dispatch({type:'tick'});expect(writes).toBe(settled);expect(f.port.push).toHaveBeenCalledTimes(pushes);expect(f.port.read().url).toBe('/retry');
});
it.each(['/throw','/blocked'])('an ordinary rejected traversal to %s creates no write retry state',url=>{
 const f=fixture();f.store.dispatch(slot.wrap({type:'go',url:'/one'}));f.visit(url);expect(f.port.read().url).toBe('/one');const pushes=vi.mocked(f.port.push).mock.calls.length,replaces=vi.mocked(f.port.replace).mock.calls.length;f.store.dispatch({type:'tick'});expect(f.port.push).toHaveBeenCalledTimes(pushes);expect(f.port.replace).toHaveBeenCalledTimes(replaces);expect(f.port.read().url).toBe('/one');
});

it('a rejected traversal does not erase retry after its rebase also fails',()=>{
 const f=fixture();vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('push');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));const replace=vi.mocked(f.port.replace).getMockImplementation()!;let writes=0;vi.mocked(f.port.replace).mockImplementation((url,state)=>{if(++writes===2)throw new Error('rebase');return replace(url,state);});
 f.visit('/blocked');f.store.dispatch({type:'tick'});expect(f.port.read().url).toBe('/retry');
});

it('a rejected traversal without rebase failure recovers retry state on next turn control',()=>{ 
 const f=fixture();vi.mocked(f.port.push).mockImplementationOnce(()=>{throw new Error('push');});f.store.dispatch(slot.wrap({type:'go',url:'/retry'}));
 f.visit('/blocked');expect(f.port.read().url).toBe('/retry');
 f.store.dispatch({type:'tick'});expect(f.port.read().url).toBe('/retry');
});

it('native fragment-only inspection has no reducer or action-history entry',()=>{
 const f=fixture('accepted-state','native');const before=f.store.history.length;f.visit('/home#anchor');expect(f.trace).toEqual([]);expect(f.store.state.route?.url).toBe('/home');expect(f.store.history).toHaveLength(before);expect(f.port.read().url).toBe('/home#anchor');
});
it('native fragment inspection resolves at its FIFO position after an earlier queued route',()=>{
 const f=fixture('accepted-state','native');let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;f.visit('/new');f.visit('/home#anchor');f.store.dispatch(slot.wrap({type:'go',url:'/later'}));}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual(['/new','/home','/later']);expect(f.store.state.route?.url).toBe('/later');expect(f.port.read().url).toBe('/later#anchor');
});
it('queued native fragment inspection is dropped with its captured owner',()=>{
 const f=fixture('accepted-state','native');let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;f.store.dispatch({type:'replace'});f.visit('/home#anchor');}});cleanups.push(stop);f.store.dispatch({type:'tick'});expect(f.trace).toEqual([]);expect(f.listening).toBe(false);expect(f.store.state.route?.url).toBe('/replacement');
});
it('inspection failures and observer errors do not prevent later FIFO actions',()=>{
 const f=fixture();const access=managedRootAccess(f.store,f.composition.execution);const origin=capturedView(f.composition.bind(f.store,slot)!).origin;const events:string[]=[];const error=new Error('inspection');vi.spyOn(console,'error').mockImplementation(()=>{});let once=false;const stop=f.store.subscribe(state=>{if(state.tick===1&&!once){once=true;access.enqueueInspection(()=>{throw error;},origin,event=>{events.push(event.type);throw new Error('observer');});f.store.dispatch(slot.wrap({type:'go',url:'/after-inspection'}));}});cleanups.push(stop);expect(()=>f.store.dispatch({type:'tick'})).toThrow(error);expect(events).toEqual(['inspection-rejected']);expect(f.store.state.route?.url).toBe('/after-inspection');
});
it('destroy during inspection resolution drops its result without action history',()=>{
 const f=fixture();const access=managedRootAccess(f.store,f.composition.execution);const origin=capturedView(f.composition.bind(f.store,slot)!).origin;const before=f.store.history.length;const events:string[]=[];access.enqueueInspection(()=>{f.store.destroy();return{action:slot.wrap({type:'go',url:'/dead'})};},origin,event=>events.push(event.type));expect(events).toEqual(['inspection-dropped']);expect(f.store.history).toHaveLength(before);expect(f.trace).toEqual([]);
});

// Non-browser failures must not become retries on unrelated root turns.
it.each(['port-read', 'codec-read', 'codec-write', 'identity'] as const)('%s failure does not arm physical-write retry', kind => {
 const f = fixture(); f.binding.dispose();
 let fail = false, sequence = 0;
 const failure = new Error(kind);
 const read = f.port.read.bind(f.port);
 const readSpy = vi.fn(() => { if (fail && kind === 'port-read') throw failure; return read(); });
 f.port.read = readSpy;
 const codecRead = vi.fn((state: unknown) => { if (fail && kind === 'codec-read') throw failure; return defaultHistoryMetadataCodec.read(state); });
 const codecWrite = vi.fn((...args: Parameters<typeof defaultHistoryMetadataCodec.write>) => { if (fail && kind === 'codec-write') throw failure; return defaultHistoryMetadataCodec.write(...args); });
 const id = vi.fn(() => { if (fail && kind === 'identity') throw failure; return `failure-control-${++sequence}`; });
 const binding = bindManagedRoute({store:f.store, composition:f.composition, slot, port:f.port,
  initial:'accepted-state', serialize:state=>state.url, request:url=>({action:{type:'go',url},expectedURL:url}),
  writePolicy:()=>kind === 'identity' ? 'push' : 'replace', codec:{read:codecRead,write:codecWrite}, id, report:f.report})!;
 cleanups.push(()=>binding.dispose()); f.report.mockClear(); fail = true;
 f.store.dispatch(slot.wrap({type:'go',url:'/failed-preparation'}));
 expect(f.report).toHaveBeenCalledExactlyOnceWith({type:'historyFailure',operation:'write',error:failure});
 const calls = () => [readSpy.mock.calls.length,codecRead.mock.calls.length,codecWrite.mock.calls.length,id.mock.calls.length,vi.mocked(f.port.push).mock.calls.length,vi.mocked(f.port.replace).mock.calls.length,f.report.mock.calls.length];
 const afterFailure = calls();
 f.store.dispatch({type:'tick'}); f.store.dispatch({type:'tick'});
 expect(calls()).toEqual(afterFailure);
 fail = false; f.store.dispatch({type:'tick'});
 expect(calls()).toEqual(afterFailure);
 expect(read().url).toBe('/home');
 f.store.dispatch(slot.wrap({type:'go',url:'/recovered'}));
 expect(read().url).toBe('/recovered');
});

it.each(['push', 'replace'] as const)('physical %s failure retries once on an unrelated root turn', policy => {
 const f=fixture(); f.binding.dispose(); let id=0;
 const binding=bindManagedRoute({store:f.store,composition:f.composition,slot,port:f.port,
  initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),
  writePolicy:()=>policy,id:()=>`physical-control-${++id}`,report:f.report})!;
 cleanups.push(()=>binding.dispose()); f.report.mockClear();
 const write=vi.mocked(f.port[policy]); const before=write.mock.calls.length;
 const failure=new Error(`physical ${policy}`); write.mockImplementationOnce(()=>{throw failure;});
 f.store.dispatch(slot.wrap({type:'go',url:'/physical-retry'}));
 const route=f.store.state.route;
 expect(f.port.read().url).toBe('/home');
 expect(write).toHaveBeenCalledTimes(before+1);
 expect(f.report).toHaveBeenCalledExactlyOnceWith({type:'historyFailure',operation:'write',error:failure});
 f.store.dispatch({type:'tick'});
 expect(f.store.state.route).toBe(route);
 expect(f.port.read().url).toBe('/physical-retry');
 expect(write).toHaveBeenCalledTimes(before+2);
 f.store.dispatch({type:'tick'});
 expect(write).toHaveBeenCalledTimes(before+2);
 expect(f.report).toHaveBeenCalledTimes(1);
});
