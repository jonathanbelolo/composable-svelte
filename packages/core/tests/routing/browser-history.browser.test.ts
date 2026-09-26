import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { syncBrowserHistory } from '../../src/lib/routing/browser-history.js';
import { createURLSyncEffect } from '../../src/lib/routing/sync-effect.js';
import { Effect } from '../../src/lib/effect.js';
const disposers: Array<() => void> = [];
let originalURL: string;
let originalState: unknown;
let originalPush: typeof history.pushState;
let originalReplace: typeof history.replaceState;
beforeEach(() => { originalURL = location.href; originalState = history.state; originalPush = history.pushState; originalReplace = history.replaceState; history.replaceState(null, '', '/routing-base'); });
afterEach(() => { for (const dispose of disposers.splice(0))
    dispose(); vi.restoreAllMocks(); vi.useRealTimers(); history.pushState = originalPush; history.replaceState = originalReplace; history.replaceState(originalState, '', originalURL); });
function owner() { const store = createStore<string, string>({ initialState: '/routing-base', reducer: (_state, path) => [path, Effect.none()] }); disposers.push(() => store.destroy()); return store; }
const config = { parse: (path: string) => path, destinationToAction: (path: string | null) => path };
const traversal = (direction: 'back' | 'forward') => new Promise<void>(resolve => { window.addEventListener('popstate', () => resolve(), { once: true }); history[direction](); });
it('receives real Back and Forward including recently marked library entries', async () => {
    const store = owner();
    disposers.push(syncBrowserHistory(store, config));
    history.replaceState({ composableSvelteSync: true }, '', '/routing-base');
    history.pushState({ composableSvelteSync: true }, '', '/routing-detail');
    store.dispatch('/unset');
    await traversal('back');
    expect(store.state).toBe('/routing-base');
    await traversal('forward');
    expect(store.state).toBe('/routing-detail');
});
it('never replaces global history methods, including with multiple listeners and cleanup order', () => {
    const push = history.pushState, replace = history.replaceState;
    const a = owner(), b = owner();
    const stopA = syncBrowserHistory(a, config), stopB = syncBrowserHistory(b, config);
    disposers.push(stopA, stopB);
    expect(history.pushState).toBe(push);
    expect(history.replaceState).toBe(replace);
    stopA();
    stopA();
    expect(history.pushState).toBe(push);
    stopB();
    expect(history.replaceState).toBe(replace);
});
it('delivers legitimate popstate immediately after a library-marked push', () => {
    const store = owner();
    disposers.push(syncBrowserHistory(store, config));
    history.pushState({ composableSvelteSync: true }, '', '/routing-detail');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { composableSvelteSync: true } }));
    expect(store.state).toBe('/routing-detail');
});
it('does not dispatch for native pushState without traversal', () => {
    const store = owner();
    disposers.push(syncBrowserHistory(store, config));
    history.pushState(null, '', '/routing-detail');
    expect(store.state).toBe('/routing-base');
});
it('parses queries and supports null destinations while null actions skip delivery', () => {
    const store = owner();
    let skip = false;
    const makeAction = vi.fn((_path: string | null, query?: string) => skip ? null : query ?? 'root');
    disposers.push(syncBrowserHistory(store, { parse: () => null, parseQuery: search => search, destinationToAction: makeAction }));
    history.replaceState(null, '', '/unknown?q=value');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(store.state).toBe('?q=value');
    expect(makeAction).toHaveBeenCalledWith(null, '?q=value');
    skip = true;
    history.replaceState(null, '', '/unknown?q=other');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(store.state).toBe('?q=value');
});
it('accepts falsy actions other than the explicit null sentinel', () => {
    const store = createStore<number, number>({ initialState: 1, reducer: (_state, action) => [action, Effect.none()] });
    disposers.push(() => store.destroy());
    disposers.push(syncBrowserHistory(store, { parse: () => 0, destinationToAction: () => 0 }));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(store.state).toBe(0);
});
it('removes only its own listener and cleanup is idempotent', () => {
    const a = owner(), b = owner();
    const stopA = syncBrowserHistory(a, config), stopB = syncBrowserHistory(b, config);
    disposers.push(stopB);
    stopA();
    stopA();
    history.replaceState(null, '', '/routing-new');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(a.state).toBe('/routing-base');
    expect(b.state).toBe('/routing-new');
});
it('Back invalidates actual-store pending URL writes, even without state-to-URL dispatch on traversal', async () => {
    history.replaceState({ base: true }, '', '/routing-base');
    history.pushState({ detail: true }, '', '/routing-detail');
    const sync = createURLSyncEffect<string, string>(path => path, { debounceMs: 50 });
    const store = createStore<string, string>({ initialState: '/routing-detail', reducer: (_state, path) => [path, sync(path)], ssr: { deferEffects: false } });
    disposers.push(() => store.destroy());
    vi.useFakeTimers();
    store.dispatch('/obsolete');
    await traversal('back');
    expect(location.pathname).toBe('/routing-base');
    // After Back, a controlled wait past the exact debounce would reveal an obsolete write.
    await vi.advanceTimersByTimeAsync(50);
    expect(location.pathname).toBe('/routing-base');
    expect(history.state).toEqual({ base: true });
});

it('skips undefined while preserving falsy actions', () => {
 const dispatch=vi.fn();const store=createStore<unknown,unknown>({initialState:'untouched',reducer:(_state,action)=>{dispatch(action);return [action,Effect.none()];}});
 disposers.push(()=>store.destroy());disposers.push(syncBrowserHistory(store,{parse:()=>null,destinationToAction:()=>undefined}));
 window.dispatchEvent(new PopStateEvent('popstate'));expect(dispatch).not.toHaveBeenCalled();expect(store.state).toBe('untouched');
});
it.each([false,true])('integrates real traversal with canonicalization (replace=%s)', async replace => {
 history.replaceState({entry:'earlier'},'','/earlier');history.pushState({entry:'base'},'','/inventory?utm_source=newsletter');
 const sync=createURLSyncEffect<string,string>(path=>path,{replace});
 history.pushState({entry:'detail'},'','/inventory/item-1');
 const store=createStore<string,string>({initialState:'/inventory/item-1',reducer:(_state,path)=>[path,sync(path)]});disposers.push(()=>store.destroy());
 disposers.push(syncBrowserHistory(store,{parse:path=>path,destinationToAction:path=>path}));
 const length=history.length;
 await traversal('back');expect(store.state).toBe('/inventory');expect(location.pathname).toBe('/inventory');
 if(replace){expect(history.length).toBe(length);await traversal('back');expect(store.state).toBe('/earlier');}
 else { // Known F4: correction pushes back over the traversed entry and repeats forever.
  const push=vi.spyOn(history,'pushState');await traversal('back');expect(push).toHaveBeenCalledTimes(1);expect(location.pathname).toBe('/inventory');
 }
});

it.each([false,true])('integrates debounced traversal with observer installed first=%s', observerFirst => {
 // Real traversal promise is returned so Vitest owns the complete browser round trip.
 return (async()=>{
 history.replaceState(null,'','/routing-base');history.pushState(null,'','/routing-detail');
 const sync=createURLSyncEffect<string,string>(path=>path,{debounceMs:100});
 const store=createStore<string,string>({initialState:'/routing-detail',reducer:(_state,path)=>[path,sync(path)]});disposers.push(()=>store.destroy());
 vi.useFakeTimers();
 const attach=()=>disposers.push(syncBrowserHistory(store,config));
 if(observerFirst)attach();store.dispatch('/obsolete');if(!observerFirst)attach();
 const length=history.length;await traversal('back');await vi.advanceTimersByTimeAsync(100);
 expect(store.state).toBe('/routing-base');expect(location.pathname).toBe('/routing-base');expect(history.length).toBe(length);
 await traversal('forward');expect(store.state).toBe('/routing-detail');expect(location.pathname).toBe('/routing-detail');
 })();
});
