import { describe, it, expect, vi } from 'vitest';
import { connectManagedHistory, browserHistoryPort, defaultHistoryMetadataCodec, type HistoryPort, type HistorySnapshot, type TraversalResult } from '../src/lib/routing/managed-history.js';
function fixture(initialState: unknown = null, deferGo = false, policy: {fragment?: 'native' | 'route'} = {}) {
 const entries: HistorySnapshot[] = [{url:'/home',state:initialState,entryKey:'key-0'}];let cursor=0;let listener:(()=>void)|undefined;let serial=0;let keySerial=0;const scheduled:number[]=[];
 const port:HistoryPort={read:()=>entries[cursor]!,liveEntryKeys:()=>entries.map(entry=>entry.entryKey!).filter(Boolean),replace:vi.fn((url,state)=>{entries[cursor]={url,state,entryKey:entries[cursor]!.entryKey!};}),push:vi.fn((url,state)=>{entries.splice(cursor+1);entries.push({url,state,entryKey:`key-${++keySerial}`});cursor++;}),go:vi.fn((delta)=>{if(deferGo)scheduled.push(cursor+delta);else cursor+=delta;}),listen:vi.fn(fn=>{listener=fn;return()=>{listener=undefined;};})};
 const requests:Array<{url:string;settle:(result:TraversalResult)=>void}>=[];const report=vi.fn();
 const connection=connectManagedHistory({...policy,port,acceptedURL:'/home',id:()=>String(++serial),report,traverse:(url,settle)=>requests.push({url,settle})});
 return {entries,port,requests,report,connection,flushGo(){cursor=scheduled.shift()!;listener?.();},event(){listener?.();},visit(index:number){cursor=index;listener?.();},get cursor(){return cursor;}};
}
describe('internal managed history protocol',()=>{
 it.each([0,'opaque',[],new Date()])('refuses unsupported initial state before writes/listeners',state=>{const f=fixture(state);expect(f.connection).toBeUndefined();expect(f.port.replace).not.toHaveBeenCalled();expect(f.port.listen).not.toHaveBeenCalled();expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyFailure',operation:'initialize'}));});
 it('preserves unrelated metadata and refuses namespace collisions',()=>{const f=fixture({user:{draft:1}});expect(f.port.read().state).toMatchObject({user:{draft:1}});const bad=fixture({__composableRoute:'occupied'});expect(bad.connection).toBeUndefined();expect(bad.port.replace).not.toHaveBeenCalled();});
 it('canonicalized repeated Back does not create new entries',()=>{const f=fixture();f.connection!.accepted('/one?noise=1');f.connection!.accepted('/two');f.visit(1);f.requests[0]!.settle({outcome:'redirected',acceptedURL:'/one'});expect(f.entries).toHaveLength(3);expect(f.port.read().url).toBe('/one');f.visit(0);f.requests[1]!.settle({outcome:'accepted',acceptedURL:'/home'});expect(f.cursor).toBe(0);expect(f.port.push).toHaveBeenCalledTimes(2);});
 it('known rejected traversal returns by delta and exact acknowledgment is not a business request',()=>{const f=fixture();f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});expect(f.port.go).toHaveBeenCalledWith(2);f.event();expect(f.requests).toHaveLength(1);expect(f.port.read().url).toBe('/two');});
 it('unrelated traversal is not swallowed by a pending correction',()=>{const f=fixture();f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.visit(1);expect(f.requests).toHaveLength(2);f.requests[1]!.settle({outcome:'accepted',acceptedURL:'/one'});expect(f.port.read().url).toBe('/one');});
 it('newer traversal supersedes an unsettled older response',()=>{const f=fixture();f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(1);f.visit(0);f.requests[0]!.settle({outcome:'redirected',acceptedURL:'/stale'});expect(f.port.read().url).toBe('/home');f.requests[1]!.settle({outcome:'accepted',acceptedURL:'/home'});expect(f.port.read().url).toBe('/home');});
 it('unknown-chain rejection rebases without losing unrelated fields',()=>{const f=fixture();f.connection!.accepted('/two');f.entries[0]={url:'/foreign',state:{other:4},entryKey:'foreign'};f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});expect(f.port.read().url).toBe('/two');expect(f.port.read().state).toMatchObject({other:4});expect(f.report).toHaveBeenCalledWith({type:'historyRebased',visitedURL:'/foreign',acceptedURL:'/two'});const chain=defaultHistoryMetadataCodec.read(f.port.read().state)!.chain;expect(chain).not.toBe(defaultHistoryMetadataCodec.read(f.entries[1]!.state)!.chain);f.visit(1);f.requests[1]!.settle({outcome:'rejected',acceptedURL:'/two'});expect(f.report).toHaveBeenCalledTimes(2);});
 it('a same-URL external entry cannot receive a queued unknown-entry correction',()=>{const f=fixture();f.connection!.accepted('/two');f.entries[0]={url:'/unknown',state:{draft:1},entryKey:'unknown-1'};f.visit(0);f.entries[0]={url:'/unknown',state:{draft:2},entryKey:'unknown-2'};f.requests[0]!.settle({outcome:'redirected',acceptedURL:'/late'});expect(f.port.read()).toEqual({url:'/unknown',state:{draft:2},entryKey:'unknown-2'});});
 it('competing connection is rejected before writing and disposal releases authority',()=>{const f=fixture();const count=vi.mocked(f.port.replace).mock.calls.length;const options={port:f.port,acceptedURL:'/home',id:()=> 'new',report:f.report,traverse:()=>{}};expect(connectManagedHistory(options)).toBeUndefined();expect(f.port.replace).toHaveBeenCalledTimes(count);f.connection!.dispose();const next=connectManagedHistory(options);expect(next).toBeDefined();next!.dispose();});
 it('distinct wrappers over one injected surface share claim authority',()=>{const f=fixture();f.connection!.dispose();const identity={};const one={...f.port,identity},two={...f.port,identity};const options={acceptedURL:'/home',id:()=> 'claim',report:f.report,traverse:()=>{}};const first=connectManagedHistory({...options,port:one});expect(first).toBeDefined();expect(connectManagedHistory({...options,port:two})).toBeUndefined();first!.dispose();const next=connectManagedHistory({...options,port:two});expect(next).toBeDefined();next!.dispose();});
 it('disposal retires listener and late settlement authority',()=>{const f=fixture();f.connection!.accepted('/one');f.visit(0);f.connection!.dispose();f.requests[0]!.settle({outcome:'redirected',acceptedURL:'/late'});f.event();expect(f.port.read().url).toBe('/home');expect(f.requests).toHaveLength(1);});
});

it('copied serialized metadata at a different physical entry is unknown',()=>{
 const f=fixture();const base=f.port.read();f.connection!.accepted('/one');f.entries[0]={url:'/copy',state:base.state,entryKey:'copied-physical-entry'};f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});expect(f.port.go).not.toHaveBeenCalled();expect(f.port.read().url).toBe('/one');expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyRebased'}));
});
it('absence of platform entry keys uses the explicit unknown/rebase policy',()=>{
 const f=fixture();f.connection!.accepted('/one');delete f.port.liveEntryKeys;f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});expect(f.port.go).not.toHaveBeenCalled();expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyRebased'}));
});
it('a pending correction acknowledgment never becomes a fake request after a newer acceptance',()=>{
 const f=fixture(null,true);f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.visit(1);f.requests[1]!.settle({outcome:'accepted',acceptedURL:'/one'});f.flushGo();expect(f.requests).toHaveLength(2);expect(f.port.go).toHaveBeenLastCalledWith(-1);f.flushGo();expect(f.requests).toHaveLength(2);expect(f.port.read().url).toBe('/one');
});

it('ambiguous platform keys cannot authorize a delta',()=>{const f=fixture();f.connection!.accepted('/one');f.port.liveEntryKeys=()=>['same','same'];f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});expect(f.port.go).not.toHaveBeenCalled();expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyRebased'}));});

it('forward pruning retires an obsolete correction target before another rejection',()=>{
 const f=fixture(null,true);f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.connection!.accepted('/branch');f.visit(0);f.requests[1]!.settle({outcome:'rejected',acceptedURL:'/branch'});expect(f.port.go).toHaveBeenCalledTimes(2);expect(f.port.go).toHaveBeenLastCalledWith(1);
});

it('exact-key correction rejection is observed and does not strand a later request',async()=>{
 const f=fixture();f.connection!.accepted('/one');const target=f.port.read().entryKey;let reject!:(error:unknown)=>void;f.port.traverseTo=vi.fn(()=>new Promise<void>((_resolve,no)=>{reject=no;}));f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});expect(f.port.traverseTo).toHaveBeenCalledWith(target);expect(f.port.go).not.toHaveBeenCalled();reject(new Error('pruned'));await Promise.resolve();await Promise.resolve();expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyFailure'}));f.visit(0);f.requests[1]!.settle({outcome:'rejected',acceptedURL:'/one'});expect(f.port.traverseTo).toHaveBeenCalledTimes(1);expect(f.port.read().url).toBe('/one');
});
it('a pruned exact correction observes its rejection without reporting into a retired transaction',async()=>{
 const f=fixture();f.connection!.accepted('/one');let reject!:(error:unknown)=>void;f.port.traverseTo=()=>new Promise<void>((_resolve,no)=>{reject=no;});f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});f.connection!.accepted('/branch');reject(new Error('pruned'));await Promise.resolve();await Promise.resolve();expect(f.report).not.toHaveBeenCalled();
});
it('accepted traversal without platform keys preserves its URL without claiming old chain continuity',()=>{
 const f=fixture();f.connection!.accepted('/one');delete f.port.liveEntryKeys;f.visit(0);f.requests[0]!.settle({outcome:'accepted',acceptedURL:'/home'});expect(f.port.read().url).toBe('/home');expect(f.port.go).not.toHaveBeenCalled();expect(f.port.push).toHaveBeenCalledTimes(1);
});
it('two deferred rejected traversals share the outstanding correction and reach accepted entry',()=>{
 const f=fixture(null,true);f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(1);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.visit(0);f.requests[1]!.settle({outcome:'rejected',acceptedURL:'/two'});expect(f.port.go).toHaveBeenCalledTimes(1);f.flushGo();expect(f.requests).toHaveLength(2);expect(f.port.read().url).toBe('/two');
});

it('replacement during correction keeps distinct physical entries uniquely identified',()=>{
 const f=fixture(null,true);f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.connection!.accepted('/replacement',true);expect(defaultHistoryMetadataCodec.read(f.entries[0]!.state)?.id).not.toBe(defaultHistoryMetadataCodec.read(f.entries[2]!.state)?.id);f.flushGo();expect(f.requests).toHaveLength(1);expect(f.port.go).toHaveBeenLastCalledWith(-2);f.flushGo();expect(f.port.read().url).toBe('/replacement');expect(f.requests).toHaveLength(1);
});
it('failed exact-key correction rebases the still-active rejected entry',async()=>{
 const f=fixture();f.connection!.accepted('/one');f.port.traverseTo=()=>Promise.reject(new Error('navigation denied'));f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});await Promise.resolve();await Promise.resolve();expect(f.port.read().url).toBe('/one');expect(f.report).toHaveBeenCalledWith({type:'historyRebased',visitedURL:'/home',acceptedURL:'/one'});
});

it('browser correction observes physical commit independently of post-commit finish failure',async()=>{
 const finished=Promise.reject(new Error('interceptor finished failure'));const browser={navigation:{entries:()=>[],traverseTo:()=>({committed:Promise.resolve({}),finished})}} as unknown as Window;await expect(browserHistoryPort(browser).traverseTo!('target')).resolves.toBeUndefined();
});
it('failed correction recovery cannot overwrite a newer accepted transaction',async()=>{
 const f=fixture(null,true);f.connection!.accepted('/one');let reject!:(error:unknown)=>void;f.port.traverseTo=()=>new Promise<void>((_ok,no)=>{reject=no;});f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/one'});f.connection!.accepted('/newer',true);reject(new Error('denied'));await Promise.resolve();await Promise.resolve();expect(f.port.read().url).toBe('/newer');expect(f.report.mock.calls.filter(([event])=>event.type==='historyRebased')).toHaveLength(0);
});

it('native fragment-only acceptance retains physical entry and hash on later writes',()=>{
 const f=fixture(null,false,{fragment:'native'});f.entries.push({url:'/home#anchor',state:null,entryKey:'fragment'});f.visit(1);expect(f.requests[0]!.url).toBe('/home');f.requests[0]!.settle({outcome:'accepted',acceptedURL:'/home'});expect(f.port.read().url).toBe('/home#anchor');f.connection!.accepted('/next');expect(f.port.read().url).toBe('/next#anchor');
});
it('native fragment survives canonicalization of a route traversal',()=>{
 const f=fixture(null,false,{fragment:'native'});f.entries.push({url:'/next?noise=1#anchor',state:null,entryKey:'fragment'});f.visit(1);expect(f.requests[0]!.url).toBe('/next?noise=1');f.requests[0]!.settle({outcome:'redirected',acceptedURL:'/next'});expect(f.port.read().url).toBe('/next#anchor');
});
it('route-owned fragment remains an ordinary feature request',()=>{
 const f=fixture(null,false,{fragment:'route'});f.entries.push({url:'/home#anchor',state:null,entryKey:'fragment'});f.visit(1);expect(f.requests[0]!.url).toBe('/home#anchor');
});
it('keyless browser event pairs deduplicate only matching old/new URL transactions',()=>{
 const target=new EventTarget();const browser={location:new URL('https://example.test/base'),addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)} as unknown as Window;const listener=vi.fn();const stop=browserHistoryPort(browser).listen(listener);browser.location.href='https://example.test/base#one';target.dispatchEvent(new Event('popstate'));target.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:'https://example.test/base',newURL:'https://example.test/base#one'}));expect(listener).toHaveBeenCalledTimes(1);target.dispatchEvent(new Event('popstate'));expect(listener).toHaveBeenCalledTimes(2);browser.location.href='https://example.test/base#two';target.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:'https://example.test/base#one',newURL:'https://example.test/base#two'}));expect(listener).toHaveBeenCalledTimes(3);stop();browser.location.href='https://example.test/base#three';target.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:'https://example.test/base#two',newURL:'https://example.test/base#three'}));expect(listener).toHaveBeenCalledTimes(3);
});
it('newer native fragment acceptance survives an older correction acknowledgment',()=>{
 const f=fixture(null,true,{fragment:'native'});f.connection!.accepted('/one');f.connection!.accepted('/two');f.visit(0);f.requests[0]!.settle({outcome:'rejected',acceptedURL:'/two'});f.entries.push({url:'/two#new-fragment',state:null,entryKey:'new-fragment'});f.visit(3);f.requests[1]!.settle({outcome:'accepted',acceptedURL:'/two'});f.flushGo();expect(f.requests).toHaveLength(2);expect(f.port.read().url).toBe('/two#new-fragment');expect(f.report).toHaveBeenCalledWith(expect.objectContaining({type:'historyRebased'}));
});
it('accepted unknown entry is claimed once without a redundant metadata replacement',()=>{
 const f=fixture();f.entries.push({url:'/unknown',state:{retained:1},entryKey:'unknown'});vi.mocked(f.port.replace).mockClear();f.visit(1);const claimed=defaultHistoryMetadataCodec.read(f.port.read().state);f.requests[0]!.settle({outcome:'accepted',acceptedURL:'/unknown'});expect(f.port.replace).toHaveBeenCalledOnce();expect(defaultHistoryMetadataCodec.read(f.port.read().state)).toEqual(claimed);expect(f.port.read().state).toMatchObject({retained:1});
});
it('explicit rejected decision URL preserves feature authority and the previously accepted native hash',()=>{
 const f=fixture(null,false,{fragment:'native'});f.entries.push({url:'/home#retained',state:null,entryKey:'fragment'});f.visit(1);f.requests[0]!.settle({outcome:'accepted',acceptedURL:'/home'});f.entries.push({url:'/blocked#visited',state:null,entryKey:'unknown'});f.visit(2);f.requests[1]!.settle({outcome:'rejected',acceptedURL:'/committed'});expect(f.port.read().url).toBe('/committed#retained');
});
it('keyless paired events still deduplicate after a framework-owned silent history write',()=>{
 const target=new EventTarget();const location=new URL('https://example.test/base');const browser={location,history:{pushState:(_state:unknown,_title:string,url:string)=>{location.href=new URL(url,location.href).href;}},addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)} as unknown as Window;const port=browserHistoryPort(browser);const listener=vi.fn();const stop=port.listen(listener);port.push('/next',null);location.hash='anchor';target.dispatchEvent(new Event('popstate'));target.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:'https://example.test/next',newURL:'https://example.test/next#anchor'}));expect(listener).toHaveBeenCalledOnce();stop();
});
it('a failed reconciliation rebase write signals the binding seam and stays retryable through accepted()',()=>{
 const f=fixture();f.connection!.dispose();const rebaseFailed=vi.fn();const failure=new Error('rebase');const settles:Array<(result:TraversalResult)=>void>=[];let serial=0;
 const connection=connectManagedHistory({port:f.port,acceptedURL:'/home',id:()=>`retry-${++serial}`,report:f.report,rebaseFailed,traverse:(_url,settle)=>settles.push(settle)})!;
 connection.accepted('/two');f.entries[0]={url:'/foreign',state:{other:4},entryKey:'foreign'};f.visit(0);vi.mocked(f.port.replace).mockImplementationOnce(()=>{throw failure;});settles[0]!({outcome:'rejected',acceptedURL:'/two'});
 expect(rebaseFailed).toHaveBeenCalledOnce();expect(f.report).toHaveBeenCalledWith({type:'historyFailure',operation:'traverse',error:failure});expect(f.port.read().url).toBe('/foreign');
 expect(connection.accepted('/two',true)).toBe(true);expect(f.port.read().url).toBe('/two');expect(f.port.read().state).toMatchObject({other:4});connection.dispose();
});
it('a codec failure during rejection rebase stays an ordinary traversal failure without a retry signal',()=>{
 const f=fixture();f.connection!.dispose();const rebaseFailed=vi.fn();const failure=new Error('codec');let broken=false,serial=0;const settles:Array<(result:TraversalResult)=>void>=[];
 const codec={read:defaultHistoryMetadataCodec.read,write:(state:unknown,entry:Parameters<typeof defaultHistoryMetadataCodec.write>[1])=>{if(broken)throw failure;return defaultHistoryMetadataCodec.write(state,entry);}};
 const connection=connectManagedHistory({port:f.port,acceptedURL:'/home',codec,id:()=>`codec-${++serial}`,report:f.report,rebaseFailed,traverse:(_url,settle)=>settles.push(settle)})!;
 connection.accepted('/two');f.entries[0]={url:'/foreign',state:null,entryKey:'foreign'};f.visit(0);const writes=vi.mocked(f.port.replace).mock.calls.length;broken=true;settles[0]!({outcome:'rejected',acceptedURL:'/two'});
 expect(f.report).toHaveBeenCalledWith({type:'historyFailure',operation:'traverse',error:failure});expect(rebaseFailed).not.toHaveBeenCalled();expect(f.port.replace).toHaveBeenCalledTimes(writes);connection.dispose();
});
it.each(['push','replace'] as const)('same-URL keyless %s retains only valid prior event identity',kind=>{
 const target=new EventTarget();const location=new URL('https://example.test/base');const write=(_state:unknown,_title:string,url:string)=>{location.href=new URL(url,location.href).href;};const browser={location,history:{pushState:write,replaceState:write},addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)} as unknown as Window;const port=browserHistoryPort(browser),listener=vi.fn();const stop=port.listen(listener);location.hash='one';target.dispatchEvent(new Event('popstate'));port[kind]('/base#one',null);target.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:'https://example.test/base',newURL:'https://example.test/base#one'}));expect(listener).toHaveBeenCalledTimes(kind==='push'?2:1);stop();
});
