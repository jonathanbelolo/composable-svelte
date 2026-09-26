import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import Popup from '../src/lib/components/Popup.svelte';

describe.each(['legacy', 'managed'] as const)('Popup deferred initialization lifetime (%s)', (mode) => {
  it('cancels pending initialization when unmounted before the next task', async () => {
    vi.useFakeTimers();
    const store = createStore({ initialState: createInitialMapState({}), reducer: mapReducer, dependencies: {}, ...(mode === 'managed' ? { execution: { mode: 'managed' as const } } : {}) });
    const target = document.createElement('div');
    document.body.appendChild(target);
    let instance: ReturnType<typeof mount> | undefined;
    try {
      const timersBefore = vi.getTimerCount();
      instance = mount(Popup, { target, props: { store, id: 'retired', position: [1, 2] } });
      flushSync();
      expect(vi.getTimerCount()).toBe(timersBefore + 1);
      expect(store.state.popups).toEqual([]);
      await unmount(instance);
      instance = undefined;
      expect(vi.getTimerCount()).toBe(timersBefore);
      await vi.runAllTimersAsync();
      expect(store.state.popups).toEqual([]);
    } finally {
      if (instance) await unmount(instance);
      store.destroy();
      target.remove();
      vi.useRealTimers();
    }
  });

  it('initializes a live popup and closes it on unmount', async () => {
    vi.useFakeTimers();
    const store = createStore({ initialState: createInitialMapState({}), reducer: mapReducer, dependencies: {}, ...(mode === 'managed' ? { execution: { mode: 'managed' as const } } : {}) });
    const target = document.createElement('div');
    document.body.appendChild(target);
    let instance: ReturnType<typeof mount> | undefined;
    try {
      instance = mount(Popup, { target, props: { store, id: 'live', position: [1, 2] } });
      flushSync();
      await vi.runAllTimersAsync();
      expect(store.state.popups).toHaveLength(1);
      expect(store.state.popups[0]).toMatchObject({ id: 'live', isOpen: true });
      await unmount(instance);
      instance = undefined;
      expect(store.state.popups[0]).toMatchObject({ id: 'live', isOpen: false });
    } finally {
      if (instance) await unmount(instance);
      store.destroy();
      target.remove();
      vi.useRealTimers();
    }
  });
});
