import { it, expect } from 'vitest';
import { EffectRuntime, RootThrottleCapacityError, type RuntimeEvent } from '../src/lib/execution/runtime.js';
import { DeterministicScheduler, type TimerHandle } from '../src/lib/execution/scheduler.js';
import { Effect } from '../src/lib/effect.js';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { createLifecycle, reconcile, stampOrigin } from '../src/lib/execution/identity.js';
import { expectConsole } from './helpers/console.js';
const work = (id: string, ms = 100) => Effect.throttled<string>(id, ms, d => d(id));
function setup(capacity = 2) { const scheduler = new DeterministicScheduler(); const trace: string[] = []; const errors: unknown[] = []; const events: RuntimeEvent[] = []; const runtime = new EffectRuntime<string>({ scheduler, rootThrottleCapacity: capacity, dispatch: a => trace.push(a), onError: e => errors.push(e), onEvent: e => events.push(e), isServer: () => false }); return { runtime, scheduler, trace, errors, events }; }
it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capacity %s', capacity => { expect(() => setup(capacity)).toThrow(/positive safe integer/); });
it('keeps existing channels usable at capacity and explicit cancel releases one slot', async () => { const { runtime, scheduler, trace, errors, events } = setup(1); try {
    runtime.executeEffect(work('a'));
    runtime.executeEffect(work('b'));
    expect(trace).toEqual(['a']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RootThrottleCapacityError);
    expect(errors[0]).toMatchObject({ name: 'RootThrottleCapacityError', capacity: 1 });
    expect(events.some(e => e.type === 'failure' && e.phase === 'execution')).toBe(true);
    await scheduler.advanceTime(100);
    runtime.executeEffect(work('a'));
    expect(trace).toEqual(['a', 'a']);
    runtime.cancel('a');
    runtime.executeEffect(work('b'));
    expect(trace).toEqual(['a', 'a', 'b']);
}
finally {
    runtime.dispose();
} });
it('group cancellation keeps admission and variable interval history', async () => { const { runtime, scheduler, trace, errors } = setup(1); try {
    runtime.executeEffect(Effect.inGroup(work('a', 10), 'g'));
    await scheduler.advanceTime(100);
    runtime.cancelGroup('g');
    runtime.executeEffect(work('b'));
    runtime.executeEffect(Effect.inGroup(work('a', 1000), 'g'));
    expect(trace).toEqual(['a']);
    expect(errors).toHaveLength(1);
    runtime.cancelGroup('g');
    runtime.executeEffect(work('a', 1000));
    await scheduler.advanceTime(900);
    expect(trace).toEqual(['a', 'a']);
}
finally {
    runtime.dispose();
} });
it('excludes feature-owned identities and reclaims them on owner retirement', () => { const { runtime, trace, errors } = setup(1); const lifecycle = reconcile(createLifecycle(), false, true, { select: open => open ? [[{ slot: 'child' }]] : [] }).lifecycle; try {
    const owner = lifecycle.owners[0]!.token;
    runtime.executeEffect(work('root'));
    for (let i = 0; i < 20; i++)
        runtime.executeEffect(stampOrigin(work(`owned${i}`), owner), lifecycle);
    expect(errors).toEqual([]);
    expect(trace).toHaveLength(21);
    runtime.cancelOwner(owner);
    runtime.executeEffect(work('other'));
    expect(errors).toHaveLength(1);
    runtime.cancel('root');
    runtime.executeEffect(work('other'));
    expect(trace.at(-1)).toBe('other');
}
finally {
    runtime.dispose();
} });
it('continues a batch after rejection without evicting history or unbounded diagnostics', () => { const { runtime, trace, errors } = setup(1); try {
    runtime.executeEffect(work('a'));
    runtime.executeEffect(Effect.batch(work('b'), Effect.run(d => d('after'))));
    expect(trace).toEqual(['a', 'after']);
    for (let i = 0; i < 1200; i++)
        runtime.executeEffect(work(`new${i}`));
    expect(trace).toEqual(['a', 'after']);
    expect(errors).toHaveLength(1201);
    expect((runtime as unknown as {
        throttleState: Map<string, unknown>;
    }).throttleState.size).toBe(1);
    expect(runtime.diagnostics.length).toBeLessThanOrEqual(200);
    runtime.cancel('a');
    runtime.executeEffect(work('last'));
    expect(trace.at(-1)).toBe('last');
}
finally {
    runtime.dispose();
} });
it('uses default1024 and rejects only the next distinct root channel', () => { const scheduler = new DeterministicScheduler(); let starts = 0; const errors: unknown[] = []; const runtime = new EffectRuntime<never>({ scheduler, dispatch() { }, onError: e => errors.push(e), isServer: () => false }); try {
    for (let i = 0; i < 1025; i++)
        runtime.executeEffect(Effect.throttled(`id${i}`, 100, () => { starts++; }));
    expect(starts).toBe(1024);
    expect(errors).toHaveLength(1);
}
finally {
    runtime.dispose();
} });
it('managed store commits its turn, reports the typed failure and continues unrelated batch work', () => { let ran = 0; const store = createStore({ initialState: 0, reducer: (s: number, id: string) => [s + 1, Effect.batch(Effect.throttled(id, 100, () => { ran++; }), Effect.run(() => { ran++; }))] as const, execution: { mode: 'managed', rootThrottleCapacity: 1 }, ssr: { deferEffects: false } }); try {
    store.dispatch('a');
    expectConsole('error', 1);
    store.dispatch('b');
    expect(store.state).toBe(2);
    expect(ran).toBe(3);
    expect(store._runtime!.diagnostics.some(e => e.type === 'failure' && e.error.name === 'RootThrottleCapacityError')).toBe(true);
}
finally {
    store.destroy();
} });
it('TestStore surfaces capacity failure and finish ignores cooldown-only history', async () => { const store = new TestStore({ initialState: 0, reducer: (s: number, id: string) => [s + 1, Effect.throttled<string>(id, 100, () => { })] as const, execution: { mode: 'managed', rootThrottleCapacity: 1 } }); try {
    await store.send('a');
    await store.finish();
    await store.send('b');
    await expect(store.finish()).rejects.toMatchObject({ cause: { name: 'RootThrottleCapacityError', capacity: 1 } });
    await store.finish();
}
finally {
    await store.destroyAndSettle();
} });
it('rejects managed-only capacity config in legacy adapters', () => { const config = { initialState: 0, reducer: (s: number, _a: string) => [s, Effect.none<string>()] as const, execution: { rootThrottleCapacity: 1 } }; expect(() => createStore(config)).toThrow(/managed/); expect(() => new TestStore(config)).toThrow(/managed/); });
class ReentrantScheduler extends DeterministicScheduler {
    onClear: (() => void) | undefined;
    override clearTimer(handle: TimerHandle) { super.clearTimer(handle); const callback = this.onClear; this.onClear = undefined; callback?.(); }
}
it.each(['cancel', 'cancelGroup'] as const)('%s cannot resurrect retired history during reentrant timer cleanup', async (kind) => {
    const scheduler = new ReentrantScheduler();
    const trace: string[] = [];
    const errors: unknown[] = [];
    const runtime = new EffectRuntime<string>({ scheduler, rootThrottleCapacity: 1, dispatch: a => trace.push(a), onError: e => errors.push(e), isServer: () => false });
    try {
        runtime.executeEffect(Effect.inGroup(work('a'), 'g'));
        await scheduler.advanceTime(1);
        runtime.executeEffect(Effect.inGroup(work('a'), 'g'));
        scheduler.onClear = () => { runtime.cancel('a'); runtime.executeEffect(work('b')); };
        if (kind === 'cancel')
            runtime.cancel('a');
        else
            runtime.cancelGroup('g');
        expect(trace).toEqual(['a', 'b']);
        runtime.executeEffect(work('c'));
        expect(errors).toHaveLength(1);
        runtime.cancel('b');
        runtime.executeEffect(work('c'));
        expect(trace).toEqual(['a', 'b', 'c']);
    }
    finally {
        runtime.dispose();
    }
});
it('revalidates admission after immediate replacement cleanup runs reentrant work', async () => {
    const scheduler = new ReentrantScheduler();
    const trace: string[] = [];
    const errors: unknown[] = [];
    const runtime = new EffectRuntime<string>({ scheduler, rootThrottleCapacity: 1, dispatch: a => trace.push(a), onError: e => errors.push(e), isServer: () => false });
    try {
        runtime.executeEffect(work('a', 10));
        await scheduler.advanceTime(1);
        runtime.executeEffect(work('a', 1000));
        scheduler.onClear = () => { runtime.cancel('a'); runtime.executeEffect(work('b')); };
        runtime.executeEffect(work('a', 0));
        expect(trace).toEqual(['a', 'b']);
        expect(errors).toHaveLength(1);
        runtime.cancel('b');
        runtime.executeEffect(work('a', 0));
        expect(trace).toEqual(['a', 'b', 'a']);
    }
    finally {
        runtime.dispose();
    }
});
it('destroy during reentrant timer cleanup does not resurrect history or execute replacement', async () => {
    const scheduler = new ReentrantScheduler();
    const trace: string[] = [];
    const runtime = new EffectRuntime<string>({ scheduler, rootThrottleCapacity: 1, dispatch: a => trace.push(a), isServer: () => false });
    runtime.executeEffect(work('a'));
    await scheduler.advanceTime(1);
    runtime.executeEffect(work('a'));
    scheduler.onClear = () => runtime.dispose();
    runtime.executeEffect(work('a', 0));
    expect(trace).toEqual(['a']);
    expect(runtime.isDisposed).toBe(true);
    await runtime.resourceScope.whenCleanupsSettled();
    expect(runtime.pendingWorkCount).toBe(0);
    runtime.dispose();
});
it('TestStore distinguishes trailing work from retained cooldown history', async () => {
    const scheduler = new DeterministicScheduler();
    let ran = 0;
    const store = new TestStore({ initialState: 0, reducer: (s: number, _a: string) => [s, Effect.throttled<string>('a', 100, () => { ran++; })] as const, execution: { mode: 'managed', scheduler, rootThrottleCapacity: 1 } });
    try {
        await store.send('run');
        await store.finish();
        await store.send('run');
        await expect(store.finish(1)).rejects.toThrow(/pending|settle|finish|timed/i);
        await scheduler.advanceTime(100);
        await store.finish();
        expect(ran).toBe(2);
    }
    finally {
        await store.destroyAndSettle();
    }
});
it('legacy execution retains its existing uncapped semantics', async () => { let ran = 0; const store = new TestStore({ initialState: 0, reducer: (s: number, id: string) => [s, Effect.throttled<string>(id, 100, () => { ran++; })] as const }); try {
    for (let i = 0; i < 1025; i++)
        await store.send(`legacy${i}`);
    await store.finish();
    expect(ran).toBe(1025);
}
finally {
    await store.destroyAndSettle();
} });
it('owned replacement and sibling histories stay isolated from root admission', async () => {
    const { runtime, scheduler, trace, errors } = setup(1);
    const slots = { select: (keys: string[]) => keys.map(key => [{ key }] as const) };
    let lifecycle = reconcile(createLifecycle(), [], ['a', 'b'], slots).lifecycle;
    const a = lifecycle.owners[0]!.token, b = lifecycle.owners[1]!.token;
    try {
        runtime.executeEffect(work('root'));
        runtime.executeEffect(stampOrigin(work('local'), a), lifecycle);
        runtime.executeEffect(stampOrigin(work('local'), b), lifecycle);
        lifecycle = reconcile(lifecycle, ['a', 'b'], ['b', 'a'], slots).lifecycle;
        runtime.executeEffect(stampOrigin(work('local'), a), lifecycle);
        expect(trace).toEqual(['root', 'local', 'local']);
        const removed = reconcile(lifecycle, ['b', 'a'], ['b'], slots);
        removed.invalidated.forEach(owner => runtime.cancelOwner(owner));
        lifecycle = reconcile(removed.lifecycle, ['b'], ['b', 'a'], slots).lifecycle;
        const next = lifecycle.owners.find(owner => owner.path[0] && 'key' in owner.path[0] && owner.path[0].key === 'a')!.token;
        runtime.executeEffect(stampOrigin(work('local'), next), lifecycle);
        expect(trace).toEqual(['root', 'local', 'local', 'local']);
        await scheduler.advanceTime(100);
        expect(trace).toHaveLength(4);
        expect(errors).toEqual([]);
    }
    finally {
        runtime.dispose();
    }
});
it('rejects null capacity supplied by untyped consumers', () => { expect(() => setup(null as unknown as number)).toThrow(/positive safe integer/); });

it('retains the newly recreated cancelled ID and its admission slot', async () => {
  const scheduler = new ReentrantScheduler();
  const trace: string[] = [];
  const errors: unknown[] = [];
  const runtime = new EffectRuntime<string>({ scheduler, rootThrottleCapacity: 1, dispatch: a => trace.push(a), onError: error => errors.push(error), isServer: () => false });
  try {
    runtime.executeEffect(work('a'));
    await scheduler.advanceTime(1);
    runtime.executeEffect(work('a'));
    scheduler.onClear = () => runtime.executeEffect(work('a'));
    runtime.cancel('a');
    expect(trace).toEqual(['a', 'a']);
    runtime.executeEffect(work('b'));
    expect(errors).toHaveLength(1);
    runtime.cancel('a');
    runtime.executeEffect(work('b'));
    expect(trace).toEqual(['a', 'a', 'b']);
  } finally { runtime.dispose(); }
});
