import { it, expect } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import Probe from './fixtures/ManagedExecutorProbe.svelte';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
it('managed select participates in Svelte reactive tracking', () => {
    const store = createStore({ initialState: 0, reducer: (s: number, _a: string) => [s + 1, Effect.none<string>()] as const, execution: { mode: 'managed' } });
    const observed: number[] = [];
    const stop = $effect.root(() => { $effect(() => { observed.push(store.select(state => state)); }); });
    try {
        flushSync();
        store.dispatch('increment');
        flushSync();
        expect(observed).toEqual([0, 1]);
    }
    finally {
        stop();
        store.destroy();
    }
});

it('mounted derived state reflects async managed dispatch and releases resources on unmount',async()=>{
 let resolve!: ()=>void;const ready=new Promise<void>(r=>resolve=r);let cleans=0;
 const target=document.createElement('div');document.body.append(target);
 const instance=mount(Probe,{target,props:{ready,cleaned:()=>{cleans++;}}});
 try {flushSync();instance.store.dispatch('start');expect(target.textContent).toBe('0');resolve();await ready;await tick();flushSync();expect(target.textContent).toBe('1');}
 finally {await unmount(instance);target.remove();}
 expect(cleans).toBe(1);expect(instance.store._runtime!.resourceScope.size).toBe(0);
});
it('unmount retires an async managed execution before its late continuation',async()=>{
 let resolve!: ()=>void;const ready=new Promise<void>(r=>resolve=r);let cleans=0;const target=document.createElement('div');document.body.append(target);
 const instance=mount(Probe,{target,props:{ready,cleaned:()=>{cleans++;}}});flushSync();instance.store.dispatch('start');await unmount(instance);target.remove();resolve();await ready;await tick();expect(cleans).toBe(1);expect(instance.store.state).toBe(0);
});
