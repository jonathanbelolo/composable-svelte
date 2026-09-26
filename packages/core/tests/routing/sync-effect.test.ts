import { TestStore } from '../../src/lib/test/test-store.js';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { createURLSyncEffect, type URLSyncOptions } from '../../src/lib/routing/sync-effect.js';
import { Effect } from '../../src/lib/effect.js';
import type { Effect as EffectType } from '../../src/lib/types.js';
interface State {
    path: string;
    query?: string;
}
type Action = {
    type: 'sync';
    state: State;
};
const dispose: Array<() => void> = [];
let originalURL: string;
let originalState: unknown;
beforeEach(() => { originalURL = location.href; originalState = history.state; history.replaceState({ consumer: 'kept' }, '', '/routing-start'); vi.useFakeTimers(); });
afterEach(() => { for (const cleanup of dispose.splice(0))
    cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); history.replaceState(originalState, '', originalURL); });
const factory = (options: URLSyncOptions = {}) => createURLSyncEffect<State, Action>(state => state.path, options);
function owner(sync: (state: State) => EffectType<Action>) {
    const store = createStore<State, Action>({ initialState: { path: '/routing-start' }, reducer: (_state, action) => [action.state, sync(action.state)] });
    dispose.push(() => store.destroy());
    return store;
}
const send = (store: ReturnType<typeof owner>, path: string, query?: string) => store.dispatch({ type: 'sync', state: { path, ...(query === undefined ? {} : { query }) } });
it('keeps matching URLs unchanged while executing the cancellation boundary', () => {
    const push = vi.spyOn(history, 'pushState');
    send(owner(factory()), '/routing-start');
    expect(push).not.toHaveBeenCalled();
});
it.each(['/detail/123', '/detail/123/edit', '/add', '/'])('writes serialized destination %s', path => {
    const store = owner(factory());
    send(store, path);
    expect(location.pathname).toBe(path);
    expect(history.state).toBe(null);
});
it('uses replaceState without adding a history entry and preserves primitive history state', () => {
    history.replaceState('consumer-token', '', '/routing-start');
    const length = history.length;
    send(owner(factory({ replace: true })), '/replaced');
    expect(location.pathname).toBe('/replaced');
    expect(history.length).toBe(length);
    expect(history.state).toBe('consumer-token');
});
it('retains original query order on write and compares normalized query order', () => {
    const sync = factory({ serializeQuery: state => (state as State).query ?? '' });
    const store = owner(sync);
    const push = vi.spyOn(history, 'pushState');
    send(store, '/query', 'b=2&a=1');
    expect(location.search).toBe('?b=2&a=1');
    send(store, '/query', 'a=1&b=2');
    expect(push).toHaveBeenCalledTimes(1);
});
it('debounces rapid updates and releases timer and popstate listener after settlement', async () => {
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
    const store = owner(factory({ debounceMs: 100 }));
    const push = vi.spyOn(history, 'pushState');
    send(store, '/one');
    send(store, '/two');
    send(store, '/three');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(location.pathname).toBe('/three');
    expect(vi.getTimerCount()).toBe(0);
    const added = add.mock.calls.filter(call => call[0] === 'popstate');
    const removed = remove.mock.calls.filter(call => call[0] === 'popstate');
    expect(added).toHaveLength(3);
    for (const call of added)
        expect(removed.some(other => other[1] === call[1])).toBe(true);
});
it('returning to the current URL retires an obsolete debounced write', async () => {
    const store = owner(factory({ debounceMs: 100 }));
    send(store, '/obsolete');
    send(store, '/routing-start');
    await vi.advanceTimersByTimeAsync(100);
    expect(location.pathname).toBe('/routing-start');
    expect(vi.getTimerCount()).toBe(0);
});
it('store destruction retires a pending write', async () => {
    const store = owner(factory({ debounceMs: 100 }));
    send(store, '/obsolete');
    store.destroy();
    await vi.advanceTimersByTimeAsync(100);
    expect(location.pathname).toBe('/routing-start');
    expect(vi.getTimerCount()).toBe(0);
});
it('traversal retires pending work without waiting for the debounce deadline', async () => {
    const store = owner(factory({ debounceMs: 100 }));
    send(store, '/obsolete');
    history.replaceState({ foreign: 1 }, '', '/traversed');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(location.pathname).toBe('/traversed');
    expect(history.state).toEqual({ foreign: 1 });
});
it('the same factory has independent timer lifetimes in separate actual stores', async () => {
    const shared = factory({ debounceMs: 100 });
    const a = owner(shared), b = owner(shared);
    send(a, '/owner-a');
    send(b, '/owner-b');
    expect(vi.getTimerCount()).toBe(2);
    a.destroy();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(location.pathname).toBe('/owner-b');
});
it('different factory identities do not cancel each other inside one store', async () => {
    const a = factory({ debounceMs: 100 }), b = factory({ debounceMs: 100 });
    const store = owner(state => Effect.batch(a(state), b({ ...state, path: '/other' })));
    const push = vi.spyOn(history, 'pushState');
    send(store, '/first');
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls.map(call => call[2])).toEqual(expect.arrayContaining(['/first', '/other']));
});
it('reads replacement history state at execution settlement so consumer changes are preserved', async () => {
    const store = owner(factory({ debounceMs: 100, replace: true }));
    send(store, '/target');
    history.replaceState({ consumer: 'new' }, '', location.href);
    await vi.advanceTimersByTimeAsync(100);
    expect(location.pathname).toBe('/target');
    expect(history.state).toEqual({ consumer: 'new' });
});

it.each([-1, NaN, Infinity, -Infinity])('rejects malformed debounce %s at factory time', delay => {
 expect(()=>factory({debounceMs:delay})).toThrow(TypeError);
});
it('preserves the fragment present at settlement', async () => {
 const store=owner(factory({debounceMs:100}));send(store,'/target');
 history.replaceState(null,'','/routing-start#later');await vi.advanceTimersByTimeAsync(100);
 expect(location.pathname).toBe('/target');expect(location.hash).toBe('#later');
});
it('does not add a duplicate entry if another writer reached the target during debounce', async () => {
 const store=owner(factory({debounceMs:100}));const push=vi.spyOn(history,'pushState');send(store,'/target');
 history.replaceState({other:1},'','/target');await vi.advanceTimersByTimeAsync(100);
 expect(push).not.toHaveBeenCalled();expect(history.state).toEqual({other:1});
});

it('TestStore tracks the debounce until clock settlement', async () => {
 const sync=factory({debounceMs:100});
 const store=new TestStore<State,Action>({initialState:{path:'/routing-start'},reducer:(_state,action)=>[action.state,sync(action.state)]});
 await store.send({type:'sync',state:{path:'/test-store'}});
 await expect(store.finish(5)).rejects.toThrow('still running');
 await vi.advanceTimersByTimeAsync(100);await store.finish();expect(location.pathname).toBe('/test-store');
 await store.destroyAndSettle();
});
it('TestStore destroyAndSettle cancels an unfinished URL write', async () => {
 const sync=factory({debounceMs:100});
 const store=new TestStore<State,Action>({initialState:{path:'/routing-start'},reducer:(_state,action)=>[action.state,sync(action.state)]});
 await store.send({type:'sync',state:{path:'/obsolete'}});await store.destroyAndSettle();
 await vi.advanceTimersByTimeAsync(100);expect(location.pathname).toBe('/routing-start');
});
it('explicit cancellation by factory effect identity retires its URL write', async () => {
 const sync=factory({debounceMs:100});const description=sync({path:'/target'});
 expect(description._tag).toBe('Cancellable');if(description._tag!=='Cancellable')throw Error('wrong tag');
 const store=owner(state=>state.path==='cancel' ? Effect.cancel(description.id) : sync(state));
 send(store,'/target');send(store,'cancel');await vi.advanceTimersByTimeAsync(100);
 expect(location.pathname).toBe('/routing-start');expect(vi.getTimerCount()).toBe(0);
});

it('an explicit fragment overrides preservation and does not repeatedly push', () => {
 const store=owner(factory());const push=vi.spyOn(history,'pushState');send(store,'/target#chosen');send(store,'/target#chosen');
 expect(location.hash).toBe('#chosen');expect(push).toHaveBeenCalledTimes(1);
});

it('cancelling the containing group retires the pending URL write', async () => {
 const sync=factory({debounceMs:100});
 const store=owner(state=>state.path==='cancel' ? Effect.cancelGroup('route') : Effect.inGroup(sync(state),'route'));
 send(store,'/target');send(store,'cancel');await vi.advanceTimersByTimeAsync(100);
 expect(location.pathname).toBe('/routing-start');expect(vi.getTimerCount()).toBe(0);
});
