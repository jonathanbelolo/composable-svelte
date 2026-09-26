import {expect,it,vi} from 'vitest';
import {planManagedRoute} from '../../src/lib/routing/managed-binding.js';
import {createURLSyncEffect} from '../../src/lib/routing/sync-effect.js';
import {syncBrowserHistory} from '../../src/lib/routing/browser-history.js';
import {createStore} from '../../src/lib/store.svelte.js';
it('managed route server planning uses only the injected URL',()=>{
 expect(typeof window).toBe('undefined');
 expect(planManagedRoute('/server?tab=2',url=>({action:{type:'open',url},expectedURL:url}))).toEqual({action:{type:'open',url:'/server?tab=2'},expectedURL:'/server?tab=2'});
});

it('URL effect construction serializes state without consulting browser globals',()=>{
 expect(typeof window).toBe('undefined');
 const serialize=vi.fn((path:string)=>path);
 const query=vi.fn(()=> 'tab=2');
 const timer=vi.spyOn(globalThis,'setTimeout');
 const browserRead=vi.fn(()=>{throw new Error('browser access during reduction');});
 try {
  const sync=createURLSyncEffect<string,string>(serialize,{debounceMs:100,serializeQuery:query});
  // Absence must work, and a present but inaccessible browser must not be read.
  const absent=sync('/server');
  vi.stubGlobal('window',new Proxy({}, {get:browserRead}));
  const present=sync('/next');
  expect(serialize.mock.calls).toEqual([['/server'],['/next']]);
  expect(query).toHaveBeenCalledTimes(2);
  expect(absent._tag).toBe('Cancellable');
  expect(present._tag).toBe('Cancellable');
  expect(browserRead).not.toHaveBeenCalled();
  expect(timer).not.toHaveBeenCalled();
 } finally {vi.unstubAllGlobals();timer.mockRestore();}
});

it.each([true,false])('URL sync is resource-free on SSR with deferEffects=%s',async(deferEffects)=>{
 expect(typeof window).toBe('undefined');
 expect(typeof document).toBe('undefined');
 const sync=createURLSyncEffect<string,string>(path=>path,{debounceMs:100});
 const store=createStore<string,string>({initialState:'/',reducer:(_state,path)=>[path,sync(path)],ssr:{deferEffects}});
 const timer=vi.spyOn(globalThis,'setTimeout');
 const parse=vi.fn((path:string)=>path);
 try {
  store.dispatch('/target');
  await Promise.resolve();
  expect(store.state).toBe('/target');
  const cleanup=syncBrowserHistory(store,{parse,destinationToAction:path=>path});
  cleanup();cleanup();
  expect(parse).not.toHaveBeenCalled();
  expect(timer).not.toHaveBeenCalled();
 } finally {store.destroy();timer.mockRestore();}
});
