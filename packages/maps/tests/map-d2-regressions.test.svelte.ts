import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import type { ApplicationInstance, ChildView } from '@composable-svelte/core/application';
import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import GeoJSONLayer from '../src/lib/components/GeoJSONLayer.svelte';
import HeatmapLayer from '../src/lib/components/HeatmapLayer.svelte';
import Popup from '../src/lib/components/Popup.svelte';
import TileProviderControl from '../src/lib/components/TileProviderControl.svelte';
import { createInitialMapState, mapReducer } from '../src/lib/reducers/map.reducer.js';
import type { LngLat, MapAction, MapState, MapStore } from '../src/lib/types/map.types.js';
import { FakeMapAdapter } from './helpers/fake-adapter.js';
import ManagedMapRecipeApp from './fixtures/ManagedMapRecipeApp.svelte';
import type { AppAction, AppState } from './fixtures/managed-map-recipe-model.js';

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0).reverse()) { try { c(); } catch {} } vi.restoreAllMocks(); });

class ReentrantZoom extends FakeMapAdapter {
  afterNextZoom: (() => void) | undefined;
  override setZoom(z: number) { super.setZoom(z); const cb = this.afterNextZoom; this.afterNextZoom = undefined; cb?.(); }
}

function retirableProjection(initial: MapState) {
  let state: MapState | undefined = initial;
  const listeners = new Set<(s: MapState | undefined) => void>();
  const dispatched: MapAction[] = [];
  const store: MapStore = {
    get state() { return state; },
    dispatch(action: MapAction) {
      dispatched.push(action);
      if (state === undefined) return;
      [state] = mapReducer(state, action, {});
      for (const l of [...listeners]) l(state);
    },
    subscribe(l) { listeners.add(l); l(state); return () => { listeners.delete(l); }; }
  };
  return { store, dispatched, retire() { state = undefined; for (const l of [...listeners]) l(undefined); } };
}

describe('P1 Popup prop reactivity (standalone Store)', () => {
  it('propagates isOpen and position changes after initialization', async () => {
    const store = createStore({ initialState: createInitialMapState({}), reducer: mapReducer, dependencies: {} });
    const adapter = new FakeMapAdapter();
    const t = document.createElement('div'); document.body.append(t);
    const m = mount(MapPrimitive, { target: t, props: { store, adapter } });
    let isOpen = $state(true);
    let position = $state<LngLat>([1, 2]);
    const p = mount(Popup, { target: t, props: { store, id: 'p', get isOpen() { return isOpen; }, get position() { return position; } } });
    cleanups.push(() => { unmount(p); unmount(m); t.remove(); });
    await settle();
    expect(store.state.popups[0]).toMatchObject({ id: 'p', isOpen: true, position: [1, 2] });
    isOpen = false; flushSync(); await settle();
    const afterClose = store.state.popups[0]?.isOpen;
    position = [5, 6]; isOpen = true; flushSync(); await settle();
    const afterMove = store.state.popups[0]?.position;
    expect({ afterClose, afterMove }).toEqual({ afterClose: false, afterMove: [5, 6] });
  });
});

describe('P2 managed same-ID replacement with declarative controls', () => {
  it('rebinds all four components to the successor and leaves predecessor inert', async () => {
    const errors = vi.spyOn(console, 'error');
    const a1 = new FakeMapAdapter(); const a2 = new FakeMapAdapter(); let active = a1;
    const views: Array<ChildView<MapState, MapAction>> = [];
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const t = document.createElement('div'); document.body.append(t);
    const c = mount(ManagedMapRecipeApp, { target: t, props: { adapter: () => active, showDeclarativeControls: true, onCaptureMap: v => { views.push(v); }, onApp: v => { app = v; } } });
    cleanups.push(() => { unmount(c); t.remove(); });
    flushSync(); await settle();
    active = a2;
    app!.store.dispatch({ type: 'replaceMap' });
    expect(views[0]!.state).toBeUndefined();
    expect(a1.callsTo('destroy')).toHaveLength(1);
    flushSync(); await settle();
    const v2 = views.at(-1)!;
    expect(v2).not.toBe(views[0]);
    expect(v2.state?.viewport.center).toEqual([50, 50]);
    expect(v2.state?.layers.map(l => l.id)).toEqual(['managed-geojson', 'managed-heatmap']);
    expect(v2.state?.popups.map(p => [p.id, p.isOpen])).toEqual([['managed-popup', true]]);
    expect(a2.initialized).toBe(true);
    expect(a2.callsTo('destroy')).toHaveLength(0);
    expect(a1.callsTo('destroy')).toHaveLength(1);
    expect(t.querySelectorAll('select').length).toBe(1);
    expect(t.querySelector('select')!.disabled).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('P3 managed retirement before popup timer', () => {
  it('retires synchronously after mount without late popup dispatch or errors', async () => {
    const errors = vi.spyOn(console, 'error');
    const a1 = new FakeMapAdapter();
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const t = document.createElement('div'); document.body.append(t);
    const c = mount(ManagedMapRecipeApp, { target: t, props: { adapter: a1, showDeclarativeControls: true, onApp: v => { app = v; } } });
    cleanups.push(() => { unmount(c); t.remove(); });
    flushSync();
    app!.store.dispatch({ type: 'closeMap' });
    await settle();
    flushSync();
    expect(app!.store.state.map).toBeNull();
    expect(a1.callsTo('destroy')).toHaveLength(1);
    expect(a1.callsTo('openPopup')).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('P4 structural store terminal for each declarative component', () => {
  it('dispatches nothing after terminal undefined, disables control', async () => {
    vi.useFakeTimers();
    try {
      const { store, dispatched, retire } = retirableProjection(createInitialMapState({}));
      const t = document.createElement('div'); document.body.append(t);
      let visible = $state(true);
      const data = { type: 'FeatureCollection' as const, features: [] };
      const g = mount(GeoJSONLayer, { target: t, props: { store, id: 'g', data, get visible() { return visible; } } });
      const h = mount(HeatmapLayer, { target: t, props: { store, id: 'h', data, get visible() { return visible; } } });
      const p = mount(Popup, { target: t, props: { store, id: 'p', position: [0, 0] } });
      const tc = mount(TileProviderControl, { target: t, props: { store } });
      flushSync();
      const before = dispatched.length;
      expect(dispatched.map(a => a.type)).toContain('addLayer');
      retire(); flushSync();
      const select = t.querySelector('select')!;
      expect(select.disabled).toBe(true);
      select.value = 'carto-dark'; select.dispatchEvent(new Event('change', { bubbles: true }));
      visible = false; flushSync();
      await vi.runAllTimersAsync();
      unmount(g); unmount(h); unmount(p); unmount(tc); t.remove();
      expect(dispatched.slice(before)).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});

describe('P5 viewport guard: equal value in different key order', () => {
  it('ends with engine == store', () => {
    const { store } = retirableProjection(createInitialMapState({ center: [0, 0], zoom: 2 }));
    const adapter = new ReentrantZoom();
    const t = document.createElement('div'); document.body.append(t);
    const c = mount(MapPrimitive, { target: t, props: { store, adapter } });
    cleanups.push(() => { unmount(c); t.remove(); });
    flushSync();
    const requested = { zoom: 4, center: [10, 20] as LngLat, bearing: 30, pitch: 40 };
    adapter.afterNextZoom = () => store.dispatch({ type: 'viewportChanged', viewport: { center: [10, 20], zoom: 4, bearing: 30, pitch: 40 } });
    store.dispatch({ type: 'viewportChanged', viewport: requested });
    expect([adapter.getCenter(), adapter.getZoom(), adapter.getBearing(), adapter.getPitch()]).toEqual([[10, 20], 4, 30, 40]);
    expect(store.state?.viewport).toEqual(requested);
  });
});
