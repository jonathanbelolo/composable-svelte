import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import type { LngLat, MapAction, MapState, MapStore } from '../src/lib/types/map.types.js';
import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import { createInitialMapState, mapReducer } from '../src/lib/reducers/map.reducer.js';
import { FakeMapAdapter } from './helpers/fake-adapter.js';
import ManagedMapRecipeApp from './fixtures/ManagedMapRecipeApp.svelte';
import type { AppAction, AppState } from './fixtures/managed-map-recipe-model.js';

class SynchronousMoveEndAdapter extends FakeMapAdapter {
  centerSetCalls = 0;

  override setCenter(center: LngLat): void {
    if (++this.centerSetCalls > 12) throw new Error('viewport setter loop exceeded 12 calls');
    super.setCenter(center);
    this.emit('moveend');
  }

  override setZoom(zoom: number): void {
    super.setZoom(zoom);
    this.emit('moveend');
  }

  override setBearing(bearing: number): void {
    super.setBearing(bearing);
    this.emit('moveend');
  }

  override setPitch(pitch: number): void {
    super.setPitch(pitch);
    this.emit('moveend');
  }
}

class ThrowOnceAdapter extends SynchronousMoveEndAdapter {
  throwNextCenter = true;

  override setCenter(center: LngLat): void {
    if (this.throwNextCenter) {
      this.throwNextCenter = false;
      throw new Error('injected setter failure');
    }
    super.setCenter(center);
  }
}

class ClampingAdapter extends SynchronousMoveEndAdapter {
  override setCenter(center: LngLat): void {
    super.setCenter([center[0], Math.max(-85.05, Math.min(85.05, center[1]))]);
  }

  override setZoom(zoom: number): void {
    super.setZoom(Math.max(0, Math.min(22, zoom)));
  }

  override setBearing(bearing: number): void {
    super.setBearing((((bearing + 180) % 360) + 360) % 360 - 180);
  }

  override setPitch(pitch: number): void {
    super.setPitch(Math.max(0, Math.min(60, pitch)));
  }
}

class ReentrantIntentAdapter extends SynchronousMoveEndAdapter {
  afterNextCenter: (() => void) | undefined;
  afterNextZoom: (() => void) | undefined;

  override setCenter(center: LngLat): void {
    super.setCenter(center);
    const callback = this.afterNextCenter;
    this.afterNextCenter = undefined;
    callback?.();
  }

  override setZoom(zoom: number): void {
    super.setZoom(zoom);
    const callback = this.afterNextZoom;
    this.afterNextZoom = undefined;
    callback?.();
  }
}

function synchronousProjection(initial: MapState): MapStore {
  let state = initial;
  const listeners = new Set<(state: MapState | undefined) => void>();
  return {
    get state() { return state; },
    dispatch(action: MapAction) {
      [state] = mapReducer(state, action, {});
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    }
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function managedMap(adapter: FakeMapAdapter) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  const component = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, sidebarAdapter: new FakeMapAdapter(), onApp: value => { app = value; } }
  });
  cleanups.push(() => {
    unmount(component);
    target.remove();
  });
  flushSync();
  if (!app) throw new Error('Managed application did not mount');
  return app;
}

describe('managed viewport synchronization', () => {
  it('handles synchronous moveend from each setter without a feedback loop', () => {
    const adapter = new SynchronousMoveEndAdapter();
    const app = managedMap(adapter);

    app.store.dispatch({ type: 'openBothMaps' });
    flushSync();

    expect(adapter.centerSetCalls).toBeLessThan(5);
    expect(adapter.getCenter()).toEqual([10, 20]);
    expect(adapter.getZoom()).toBe(4);
    expect(app.store.state.map?.viewport).toMatchObject({
      center: [10, 20], zoom: 4, bearing: 0, pitch: 0
    });
  });

  it('releases moveend suppression when a setter throws', () => {
    const adapter = new ThrowOnceAdapter();
    const app = managedMap(adapter);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(() => errorSpy.mockRestore());

    app.store.dispatch({ type: 'openBothMaps' });
    flushSync();
    expect(errorSpy).toHaveBeenCalled();

    adapter.setCenter([7, 8]);
    expect(app.store.state.map?.viewport.center).toEqual([7, 8]);
    expect(adapter.centerSetCalls).toBeLessThan(5);
  });

  it('publishes the engine-clamped viewport once after applying all fields', () => {
    const adapter = new ClampingAdapter();
    const app = managedMap(adapter);

    app.store.dispatch({ type: 'openBothMaps' });
    flushSync();

    // Each action requests one value outside the engine's supported range.
    // A clamped native readback must reconcile the root state in the same tick.
    // Use the root's presented map action route rather than a separate Store.
    app.store.dispatch({ type: 'map', action: { type: 'presented', action: { type: 'setCenter', center: [0, 89] } } });
    app.store.dispatch({ type: 'map', action: { type: 'presented', action: { type: 'setZoom', zoom: 30 } } });
    app.store.dispatch({ type: 'map', action: { type: 'presented', action: { type: 'setBearing', bearing: 270 } } });
    app.store.dispatch({ type: 'map', action: { type: 'presented', action: { type: 'setPitch', pitch: 80 } } });

    // One initial viewport application plus one per clamped action. If the
    // readback triggers a second setter group, this count rises above five.
    expect(adapter.centerSetCalls).toBe(5);
    expect(app.store.state.map?.viewport).toMatchObject({
      center: [0, 85.05], zoom: 22, bearing: -90, pitch: 60
    });
    expect(adapter.getCenter()).toEqual([0, 85.05]);
    expect(adapter.getZoom()).toBe(22);
    expect(adapter.getBearing()).toBe(-90);
    expect(adapter.getPitch()).toBe(60);
  });

  it('finishes a queued core-store intent after the current setter transaction', () => {
    const adapter = new ReentrantIntentAdapter();
    const app = managedMap(adapter);
    adapter.afterNextCenter = () => {
      app.store.dispatch({
        type: 'map',
        action: { type: 'presented', action: { type: 'setZoom', zoom: 9 } }
      });
    };

    app.store.dispatch({ type: 'openBothMaps' });
    flushSync();

    expect(adapter.centerSetCalls).toBeLessThan(5);
    expect(app.store.state.map?.viewport).toMatchObject({ center: [10, 20], zoom: 9 });
    expect(adapter.getCenter()).toEqual([10, 20]);
    expect(adapter.getZoom()).toBe(9);
  });

  it('does not overwrite a synchronously reentrant structural-store intent', () => {
    const adapter = new ReentrantIntentAdapter();
    const store = synchronousProjection(createInitialMapState({ center: [0, 0], zoom: 2 }));
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanups.push(() => { unmount(component); target.remove(); });
    flushSync();

    adapter.afterNextZoom = () => store.dispatch({
      type: 'viewportChanged',
      viewport: { center: [50, 50], zoom: 9, bearing: 0, pitch: 0 }
    });
    store.dispatch({
      type: 'viewportChanged',
      viewport: { center: [10, 20], zoom: 4, bearing: 0, pitch: 0 }
    });

    expect(adapter.centerSetCalls).toBeLessThan(5);
    expect(store.state?.viewport).toMatchObject({ center: [50, 50], zoom: 9 });
    expect(adapter.getCenter()).toEqual([50, 50]);
    expect(adapter.getZoom()).toBe(9);
  });

  it('finishes setters after an equal-value structural-store replacement', () => {
    const adapter = new ReentrantIntentAdapter();
    const store = synchronousProjection(createInitialMapState({ center: [0, 0], zoom: 2 }));
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanups.push(() => { unmount(component); target.remove(); });
    flushSync();

    const viewport = { center: [10, 20] as LngLat, zoom: 4, bearing: 30, pitch: 40 };
    adapter.afterNextZoom = () => store.dispatch({
      type: 'viewportChanged',
      viewport: { ...viewport, center: [...viewport.center] as LngLat }
    });
    store.dispatch({ type: 'viewportChanged', viewport });

    expect(store.state?.viewport).toEqual(viewport);
    expect(adapter.getCenter()).toEqual(viewport.center);
    expect(adapter.getBearing()).toBe(viewport.bearing);
    expect(adapter.getPitch()).toBe(viewport.pitch);
  });

  it('disposes once when a close action is queued during a setter', () => {
    const adapter = new ReentrantIntentAdapter();
    const app = managedMap(adapter);
    adapter.afterNextCenter = () => app.store.dispatch({ type: 'closeMap' });

    app.store.dispatch({ type: 'openBothMaps' });
    flushSync();

    expect(app.store.state.map).toBeNull();
    expect(adapter.callsTo('destroy').length).toBe(1);
    const destroyIndex = adapter.calls.findIndex(call => call.method === 'destroy');
    expect(destroyIndex).toBeGreaterThan(0);
    expect(adapter.calls.slice(destroyIndex + 1)).toEqual([]);
  });
});
