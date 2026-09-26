import { createResourceScope } from '../src/lib/execution/resources.js';
import { expectConsole } from './helpers/console.js';
import { afterEach, expect, it } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { createDeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { ownerAt, stampOrigin } from '../src/lib/execution/identity.js';
import type { ManagedReductionAdapter, Reducer, Dispatch } from '../src/lib/types.js';
import type { EffectRuntime } from '../src/lib/execution/runtime.js';
const cleanup: Array<() => void> = [];
afterEach(() => { for (const f of cleanup.splice(0))
    f(); });
it('reuses a pure effect description on successive accepted turns', () => {
    let ran = 0;
    const description = Effect.run<string>(() => { ran++; });
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s + 1, description] as const, execution: { mode: 'managed' } });
    cleanup.push(() => store.destroy());
    store.dispatch('one');
    expect(() => store.dispatch('two')).not.toThrow();
    expect(ran).toBe(2);
});
it('shares a pure description across independent roots without global authority', () => {
    let ran = 0;
    const description = Effect.fireAndForget(() => { ran++; });
    const config = { initialState: 0, reducer: (s: number, _a: string) => [s + 1, description] as const, execution: { mode: 'managed' as const } };
    const a = createStore(config), b = createStore(config);
    cleanup.push(() => a.destroy(), () => b.destroy());
    a.dispatch('one');
    expect(() => b.dispatch('two')).not.toThrow();
    expect(ran).toBe(2);
});
it('retains the existing StoreConfig maxHistorySize option in managed stores', () => {
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s + 1, Effect.none<string>()] as const, maxHistorySize: 0, execution: { mode: 'managed' } });
    cleanup.push(() => store.destroy());
    store.dispatch('one');
    expect(store.history).toEqual([]);
});
it('explicit cancellation resets named throttle scheduling authority', async () => {
    const scheduler = createDeterministicScheduler();
    let starts = 0;
    const store = createStore({ initialState: 0, reducer: (s: number, a: string) => [s, a === 'cancel' ? Effect.cancel<string>('throttle') : Effect.throttled<string>('throttle', 100, () => { starts++; })] as const, execution: { mode: 'managed', scheduler } });
    cleanup.push(() => store.destroy());
    store.dispatch('start');
    await Promise.resolve();
    store.dispatch('cancel');
    store.dispatch('start');
    expect(starts).toBe(2);
    expect(scheduler.pendingTimersCount).toBe(0);
});
it('failed reconciliation is absent from accepted action history', () => {
    const store = createStore({ initialState: 0, reducer: (_s: number, _a: string) => [1, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: (state: number) => state === 0 ? [] : [[{ slot: 'same' }], [{ slot: 'same' }]] } } });
    cleanup.push(() => store.destroy());
    expect(() => store.dispatch('invalid')).toThrow();
    expect(store.state).toBe(0);
    expect(store.history).toEqual([]);
});
it('observes pending async fire-and-forget work through the runtime seam', async () => {
    let settle!: () => void;
    const promise = new Promise<void>(resolve => { settle = resolve; });
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s, Effect.fireAndForget(() => promise)] as const, execution: { mode: 'managed' } });
    cleanup.push(() => store.destroy());
    store.dispatch('start');
    const runtime = store._runtime as EffectRuntime<string>;
    expect(runtime.pendingWorkCount).toBe(1);
    settle();
    await promise;
});
type ChildState = {
    child: boolean;
    count: number;
};
type ChildAction = 'start' | 'trigger' | 'remove' | 'replace' | 'callback';
const childPath = [{ slot: 'child' }] as const;
function childStore(onSetup: (dispatch: Dispatch<ChildAction>) => () => void) {
    const reducer: Reducer<ChildState, ChildAction> = (state, action) => {
        if (action === 'remove')
            return [{ ...state, child: false }, Effect.none()];
        if (action === 'callback')
            return [{ ...state, count: state.count + 1 }, Effect.none()];
        if (action === 'start' || action === 'replace')
            return [state, Effect.subscription('same-name', onSetup)];
        return [{ ...state }, Effect.none()];
    };
    const adapter: ManagedReductionAdapter<ChildState, ChildAction, unknown> = ({ state, action, dependencies, reducer, lifecycle }) => {
        const [next, effect] = reducer(state, action, dependencies);
        const token = ownerAt(lifecycle, childPath);
        return [next, token ? stampOrigin(effect, token) : effect, action === 'replace' ? [{ type: 'replace', path: childPath }] : []];
    };
    const store = createStore({ initialState: { child: true, count: 0 }, reducer, execution: { mode: 'managed', slots: { select: (s: ChildState) => s.child ? [childPath] : [] }, _reduce: adapter } });
    cleanup.push(() => store.destroy());
    return store;
}
it('drops actual child callback queued while live but dequeued after removal', () => {
    let send!: Dispatch<ChildAction>;
    let cleans = 0;
    const store = childStore(dispatch => { send = dispatch; return () => { cleans++; }; });
    store.dispatch('start');
    store.subscribeToActions!((action) => { if (action === 'trigger') {
        store.dispatch('remove');
        send('callback');
    } });
    store.dispatch('trigger');
    expect(store.state).toEqual({ child: false, count: 0 });
    expect(cleans).toBe(1);
    expect(store._runtime!.diagnostics.some(e => e.type === 'dropped' && e.phase === 'dequeue')).toBe(true);
});
it('same-key replacement cancels old resources before notifications and drops old-owned effect', () => {
    let setups = 0, cleans = 0;
    let send!: Dispatch<ChildAction>;
    const store = childStore(dispatch => { setups++; send = dispatch; return () => { cleans++; }; });
    store.dispatch('start');
    store.subscribeToActions!((action) => { if (action === 'replace')
        expect(cleans).toBe(1); });
    store.dispatch('replace');
    expect(setups).toBe(1);
    expect(cleans).toBe(1);
    send('callback');
    expect(store.state.count).toBe(0);
    expect(store._runtime!.diagnostics.some(e => e.type === 'dropped' && e.phase === 'callback' && e.reason === 'cancelled')).toBe(true);
    expect(store._runtime!.diagnostics.some(e => e.type === 'dropped' && e.phase === 'execute')).toBe(true);
    store.dispatch('start');
    expect(setups).toBe(2);
});
it('scope cancellation does not await cleanup and observes its late failure', async () => {
    expectConsole('error', 1);
    let fail!: (error: Error) => void;
    let send!: Dispatch<ChildAction>;
    const rejection = new Promise<void>((_resolve, reject) => { fail = reject; });
    const store = childStore(dispatch => { send = dispatch; return () => rejection; });
    store.dispatch('start');
    store.dispatch('remove');
    expect(store.state.child).toBe(false);
    send('callback');
    expect(store.state.count).toBe(0);
    fail(new Error('late cleanup'));
    await store._runtime!.whenCleanupsSettled();
    expect(store._runtime!.pendingWorkCount).toBe(0);
    expect(store._runtime!.diagnostics.some(e => e.type === 'failure' && e.phase === 'cleanup')).toBe(true);
});
it('same local child IDs in sibling slots do not cancel one another', () => {
    let a = 0, b = 0;
    const paths = [[{ slot: 'a' }], [{ slot: 'b' }]] as const;
    const store = createStore({ initialState: 0, reducer: (state: number, _action: string) => [state, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: () => paths }, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => {
                reducer(state, action, dependencies);
                const token = ownerAt(lifecycle, action === 'a' ? paths[0] : paths[1])!;
                return [state, stampOrigin(Effect.subscription('same', () => () => { if (action === 'a')
                        a++;
                    else
                        b++; }), token)];
            } } });
    cleanup.push(() => store.destroy());
    store.dispatch('a');
    store.dispatch('b');
    expect([a, b]).toEqual([0, 0]);
    store.dispatch('a');
    expect([a, b]).toEqual([1, 0]);
});
it('runtime observation sees logical settlement even when abandoned I/O never settles', async () => {
    const store = createStore({ initialState: 0, reducer: (s: number, a: string) => [s, a === 'cancel' ? Effect.cancel<string>('job') : Effect.cancellable<string>('job', () => new Promise<void>(() => { }))] as const, execution: { mode: 'managed' } });
    cleanup.push(() => store.destroy());
    const events: string[] = [];
    store._runtime!.observe(event => events.push(event.type));
    store.dispatch('start');
    expect(store._runtime!.pendingWorkCount).toBe(1);
    store.dispatch('cancel');
    await Promise.resolve();
    expect(events).toEqual(['started', 'settled']);
    expect(store._runtime!.pendingWorkCount).toBe(0);
});
it('a throwing dropped-dispatch hook cannot resurrect a resource or interrupt cleanup', () => {
    const scope = createResourceScope();
    let send!: Dispatch<string>;
    let delivered = 0, cleans = 0, dropped = 0;
    const record = scope.registerSubscription({ id: 'one', setup: dispatch => { send = dispatch; return () => { cleans++; }; }, dispatch: () => { delivered++; }, onDroppedDispatch: () => { dropped++; throw new Error('sink'); } });
    record.dispose();
    send('late');
    expect([delivered, cleans, dropped]).toEqual([0, 1, 1]);
    expect(scope.size).toBe(0);
});
it('new-owner work binds only to the accepted turn and replacement separates outgoing/incoming', () => {
    let starts = 0, cleans = 0;
    const slot = [{ slot: 'child' }] as const;
    const store = createStore({ initialState: false, reducer: (_s: boolean, _a: string) => [true, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: (s: boolean) => s ? [slot] : [] }, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => {
                const [next, effect] = reducer(state, action, dependencies);
                const old = ownerAt(lifecycle, slot);
                return [next, old ? stampOrigin(Effect.fireAndForget(() => { throw new Error('outgoing ran'); }), old) : effect, old ? [{ type: 'replace', path: slot }] : [], [{ path: slot, effect: Effect.subscription('job', () => { starts++; return () => { cleans++; }; }) }]];
            } } });
    cleanup.push(() => store.destroy());
    store.dispatch('open');
    expect([starts, cleans]).toEqual([1, 0]);
    store.dispatch('replace');
    expect([starts, cleans]).toEqual([2, 1]);
});
it('invalid new-owner work fails atomically without publishing state, history, or new lifetime', () => {
    let starts = 0;
    const slot = [{ slot: 'child' }] as const;
    const store = createStore({ initialState: true, reducer: (s: boolean, _a: string) => [s, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: (s: boolean) => s ? [slot] : [] }, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => { reducer(state, action, dependencies); return [state, Effect.none(), [], [{ path: slot, effect: Effect.fireAndForget(() => { starts++; }) }]]; } } });
    cleanup.push(() => store.destroy());
    expect(() => store.dispatch('invalid')).toThrow('allocated by this turn');
    expect(starts).toBe(0);
    expect(store.history).toEqual([]);
    expect(store.state).toBe(true);
});
it('rejects an incoming description already stamped with an outgoing lifetime', () => {
    const slot = [{ slot: 'child' }] as const;
    const store = createStore({ initialState: true, reducer: (s: boolean, _a: string) => [s, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: () => [slot] }, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => { reducer(state, action, dependencies); return [state, Effect.none(), [{ type: 'replace', path: slot }], [{ path: slot, effect: stampOrigin(Effect.none(), ownerAt(lifecycle, slot)!) }]]; } } });
    cleanup.push(() => store.destroy());
    expect(() => store.dispatch('replace')).toThrow('existing origin');
    expect(store.history).toEqual([]);
});
it('expired scheduler timers settle as completed rather than cancelled', async () => {
    const scheduler = createDeterministicScheduler();
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s, Effect.afterDelay<string>(10, () => { })] as const, execution: { mode: 'managed', scheduler } });
    cleanup.push(() => store.destroy());
    store.dispatch('start');
    await scheduler.advanceTime(10);
    const settled = store._runtime!.diagnostics.filter(e => e.type === 'settled');
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every(e => e.record.outcome === 'completed')).toBe(true);
});
it('a retired batch origin does not suppress explicitly owned surviving descendants', () => {
    const starts: string[] = [];
    const a = [{ slot: 'a' }] as const, b = [{ slot: 'b' }] as const;
    const store = createStore({ initialState: true, reducer: (_s: boolean, _a: string) => [false, Effect.none<string>()] as const, execution: { mode: 'managed', slots: { select: (s: boolean) => s ? [a, b] : [b] }, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => { reducer(state, action, dependencies); return [false, { _tag: 'Batch', origin: ownerAt(lifecycle, a)!, effects: [Effect.fireAndForget(() => { starts.push('a'); }), stampOrigin(Effect.fireAndForget(() => { starts.push('b'); }), ownerAt(lifecycle, b)!)] }]; } } });
    cleanup.push(() => store.destroy());
    store.dispatch('remove-a');
    expect(starts).toEqual(['b']);
});
it.each(['debounced', 'throttled'] as const)('%s schedules future starts without cancelling in-flight work', async (kind) => {
    const scheduler = createDeterministicScheduler();
    const signals: AbortSignal[] = [];
    const store = createStore({ initialState: 0, reducer: (state: number, action: string) => [state, action === 'cancel' ? Effect.cancel<string>('same') : Effect[kind]<string>('same', 10, (_dispatch, signal) => { signals.push(signal!); return new Promise<void>(() => { }); })] as const, execution: { mode: 'managed', scheduler } });
    cleanup.push(() => store.destroy());
    store.dispatch('start');
    if (kind === 'debounced')
        await scheduler.advanceTime(10);
    expect(signals).toHaveLength(1);
    store.dispatch('start');
    expect(signals[0]!.aborted).toBe(false);
    await scheduler.advanceTime(10);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(false);
    store.dispatch('cancel');
    expect(signals.every(signal => signal.aborted)).toBe(true);
});
it.each([0, 2])('rejects an adapter invoking feature reduction %i times', calls => {
    let reductions = 0;
    const store = createStore({ initialState: 0, reducer: (state: number, _action: string) => { reductions++; return [state + 1, Effect.none<string>()] as const; }, execution: { mode: 'managed', _reduce: ({ state, action, dependencies, reducer }) => { for (let i = 0; i < calls; i++) {
                try {
                    reducer(state, action, dependencies);
                }
                catch { }
            } return [state + 1, Effect.none()]; } } });
    cleanup.push(() => store.destroy());
    expect(() => store.dispatch('bad-adapter')).toThrow('exactly once');
    expect(reductions).toBe(calls === 0 ? 0 : 1);
    expect(store.state).toBe(0);
    expect(store.history).toEqual([]);
});
it('late callback diagnostics stay bounded without retaining action payloads', () => {
    let send!: Dispatch<ChildAction>;
    const store = childStore(dispatch => { send = dispatch; return () => { }; });
    store.dispatch('start');
    store.dispatch('remove');
    for (let i = 0; i < 1000; i++)
        send('callback');
    expect(store._runtime!.diagnostics.length).toBeLessThanOrEqual(200);
    expect(store._runtime!.diagnostics.filter(event => event.type === 'dropped')).toHaveLength(100);
    expect(store._runtime!.diagnostics.every(event => !('action' in event))).toBe(true);
});
it('one failed effect start is reported without preventing the next declared leaf', () => {
    expectConsole('error', 1);
    let ran = false;
    const scheduler = createDeterministicScheduler();
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s, Effect.batch(Effect.afterDelay<string>(Infinity, () => { }), Effect.fireAndForget(() => { ran = true; }))] as const, execution: { mode: 'managed', scheduler } });
    cleanup.push(() => store.destroy());
    store.dispatch('start');
    expect(ran).toBe(true);
    expect(store._runtime!.diagnostics.some(event => event.type === 'failure' && event.phase === 'execution')).toBe(true);
});

it('publishes registration before synchronous subscription setup failure', async () => {
 expectConsole('error', 1);
 const store=createStore({initialState:0,reducer:(state:number,_action:string)=>[state,Effect.subscription<string>('job',()=>{throw new Error('setup');})] as const,execution:{mode:'managed'}});
 cleanup.push(()=>store.destroy());const events:string[]=[];store._runtime!.observe(event=>events.push(event.type));store.dispatch('start');await Promise.resolve();expect(events).toEqual(['started','failure','settled']);
});

it('throwing registration observers cannot skip setup or cleanup', () => {
 const failures:unknown[]=[];let starts=0,cleans=0;const scope=createResourceScope({onRegistered:()=>{throw new Error('observer');},onExecutionError:error=>{failures.push(error);}});
 scope.registerSubscription({id:'job',dispatch:()=>{},setup:()=>{starts++;return()=>{cleans++;};}});scope.dispose();expect([starts,cleans,failures.length,scope.size]).toEqual([1,1,1,0]);
});
