import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { counterReducer, initialState, type CounterState, type CounterAction, type CounterDependencies } from '../src/counter.js';
import { defaultFactService, createHttpFactService, type FactService } from '../src/facts.js';
const stores: TestStore<CounterState, CounterAction, CounterDependencies>[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.destroy(); });
function make(factService: FactService, count = 2) {
 const store = new TestStore({initialState:{...initialState,count},reducer:counterReducer,dependencies:{factService},execution:{mode:'managed'}});
 stores.push(store); return store;
}
function deferred() {
 let resolve!: (value:string)=>void;
 const promise = new Promise<string>(yes => {resolve=yes;});
 return {resolve,promise};
}
describe('counter decisions and managed effects', () => {
 it('legacy-compatible regression: HTTP status errors are not facts',async()=>{
  const fetch = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('bad gateway',{status:502}));
  try {const store=make(createHttpFactService({baseUrl:'/api/facts'}));await store.send({type:'loadFactTapped'});await store.receive({type:'factLoadFailed'});await store.finish();expect(store.state.fact).toBeNull();}
  finally {fetch.mockRestore();}
 });
 it('legacy-compatible regression: reset retires a pending fetch',async()=>{
  let resolve!:(response:Response)=>void;
  const pending=new Promise<Response>(yes=>{resolve=yes;});
  const fetch=vi.spyOn(globalThis,'fetch').mockReturnValue(pending);
  try {
   const store=make(createHttpFactService({baseUrl:'/api/facts'}));await store.send({type:'loadFactTapped'});await store.send({type:'resetTapped'});
   resolve(new Response('stale fact'));
   expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
   await store.finish();expect(store.state.fact).toBeNull();
  } finally {resolve(new Response('stale fact'));fetch.mockRestore();}
 });
 it('rejects HTTP error bodies as facts', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('proxy error',{status:500}));
  const store=make(createHttpFactService({baseUrl:'/api/facts',fetch}));
  await store.send({type:'loadFactTapped'});
  await store.receive({type:'factLoadFailed',error:'HTTP 500: Request failed'}, state=>{expect(state.fact).toBeNull();expect(state.isLoading).toBe(false);});
  expect(fetch).toHaveBeenCalledWith('/api/facts/2/trivia',expect.objectContaining({signal:expect.any(AbortSignal)}));
  await store.finish();
 });
 it.each(['resetTapped','incrementTapped','decrementTapped'] as const)('cancels outstanding facts on %s', async type => {
  const result=deferred();let signal:AbortSignal|undefined;
  const store=make({getFact:(_count,s)=>{signal=s;return result.promise;}});
  await store.send({type:'loadFactTapped'});await store.send({type});
  expect(signal?.aborted).toBe(true);result.resolve('stale');await result.promise;
  await store.finish();expect(store.state.fact).toBeNull();expect(store.state.error).toBeNull();expect(store.state.isLoading).toBe(false);
 });
 it('supersedes an outstanding request',async()=>{
  const first=deferred(), second=deferred();const signals:AbortSignal[]=[];
  const service:FactService={getFact:(_count,signal)=>{signals.push(signal!);return signals.length===1?first.promise:second.promise;}};
  const store=make(service);await store.send({type:'loadFactTapped'});await store.send({type:'loadFactTapped'});
  expect(signals[0]?.aborted).toBe(true);expect(signals[1]?.aborted).toBe(false);
  first.resolve('old');second.resolve('new');await store.receive({type:'factLoaded',fact:'new'});await store.finish();expect(store.state.fact).toBe('new');
 });
 it('uses the local demo dependency without network',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('unexpected network'));
  try {const store=make(defaultFactService);await store.send({type:'loadFactTapped'});await store.receive({type:'factLoaded'});await store.finish();expect(store.state.fact).toContain('even prime');expect(fetch).not.toHaveBeenCalled();}
  finally {fetch.mockRestore();}
 });
 it('displays dependency failures',async()=>{
  const store=make({getFact:async()=>{throw new Error('service offline');}});await store.send({type:'loadFactTapped'});await store.receive({type:'factLoadFailed',error:'service offline'});await store.finish();expect(store.state.error).toBe('service offline');
 });
 it.each(['http://example.test','//example.test','relative-path','/\\example.test'])('refuses insecure or non-local endpoint %s',baseUrl=>{expect(()=>createHttpFactService({baseUrl})).toThrow(TypeError);});
 it('supports an explicitly configured HTTPS dependency',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response('valid fact'));const controller=new AbortController();
  await expect(createHttpFactService({baseUrl:'https://example.test/facts/',fetch}).getFact(5,controller.signal)).resolves.toBe('valid fact');
  expect(fetch).toHaveBeenCalledWith('https://example.test/facts/5/trivia',{signal:controller.signal});
 });
 it.each([['/api/facts?lang=en','/api/facts/2/trivia?lang=en'],['/','/2/trivia'],['https://example.test/api?lang=en','https://example.test/api/2/trivia?lang=en']])('preserves endpoint path/query for %s', async (baseUrl,target)=>{
  const fetch=vi.fn().mockResolvedValue(new Response('fact'));await createHttpFactService({baseUrl,fetch}).getFact(2);expect(fetch).toHaveBeenCalledWith(target,{});
 });
 it('cancels a non-success response body before reporting its HTTP error',async()=>{
  const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({cancel});const fetch=vi.fn().mockResolvedValue(new Response(body,{status:503}));
  await expect(createHttpFactService({baseUrl:'/api',fetch}).getFact(2)).rejects.toThrow('HTTP 503');expect(cancel).toHaveBeenCalledTimes(1);expect(body.locked).toBe(false);
 });

});
