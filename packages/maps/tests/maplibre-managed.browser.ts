import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { MaplibreAdapter } from '../src/lib/utils/maplibre-adapter.js';
import maplibregl from 'maplibre-gl';
import type { MapInitOptions } from '../src/lib/types/map.types.js';
import type { ApplicationInstance, ChildView } from '@composable-svelte/core/application';
import ManagedMapRecipeApp from './fixtures/ManagedMapRecipeApp.svelte';
import type { AppAction, AppState } from './fixtures/managed-map-recipe-model.js';
import type { MapAction, MapState } from '../src/lib/types/map.types.js';

const localStyle = `data:application/json,${encodeURIComponent(JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }]
}))}`;
const alternateLocalStyle = `data:application/json,${encodeURIComponent(JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000' } }]
}))}`;

class LocalStyleMapAdapter extends MaplibreAdapter {
  destroyCount = 0;
  viewportSetCount = 0;
  retainedMoveHandlers: Function[] = [];

  override initialize(container: HTMLElement, options: MapInitOptions): void {
    super.initialize(container, { ...options, style: localStyle });
  }

  override destroy(): void {
    this.destroyCount++;
    super.destroy();
  }

  override on(event: string, handler: Function): void {
    if (event === 'moveend') this.retainedMoveHandlers.push(handler);
    super.on(event, handler);
  }

  override setCenter(center: [number, number]): void {
    if (++this.viewportSetCount > 20) {
      throw new Error('MapLibre viewport setter reentered more than 20 times');
    }
    super.setCenter(center);
  }

  hasNativeLayer(id: string): boolean {
    const nativeMap: unknown = Reflect.get(this, 'map');
    return nativeMap instanceof maplibregl.Map && nativeMap.getLayer(id) !== undefined;
  }

  pendingLayerIds(): string[] {
    const pending: Map<string, unknown> = Reflect.get(this, 'pendingLayers');
    return [...pending.keys()];
  }

  nativeSourceData(id: string): unknown {
    const nativeMap: unknown = Reflect.get(this, 'map');
    if (!(nativeMap instanceof maplibregl.Map)) return undefined;
    const source: unknown = nativeMap.getSource(id);
    if (!source || typeof source !== 'object') return undefined;
    const serialize: unknown = Reflect.get(source, 'serialize');
    if (typeof serialize !== 'function') return undefined;
    const serialized: unknown = serialize.call(source);
    return serialized && typeof serialized === 'object' ? Reflect.get(serialized, 'data') : undefined;
  }

  nativeVisibility(id: string): unknown {
    const nativeMap: unknown = Reflect.get(this, 'map');
    return nativeMap instanceof maplibregl.Map ? nativeMap.getLayoutProperty(id, 'visibility') : undefined;
  }

  reloadNativeStyle(): void {
    const nativeMap: unknown = Reflect.get(this, 'map');
    if (!(nativeMap instanceof maplibregl.Map)) throw new Error('Native map unavailable');
    nativeMap.setStyle({
      version: 8, sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eee' } }]
    }, { diff: false });
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const waitForStyle = (adapter: MaplibreAdapter) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Native style did not load')), 10_000);
  adapter.on('style.load', () => { clearTimeout(timer); resolve(); });
});
const waitForNativeLayer = async (adapter: LocalStyleMapAdapter, id: string) => {
  const deadline = Date.now() + 10_000;
  while (!adapter.hasNativeLayer(id)) {
    if (Date.now() > deadline) throw new Error(`Native layer ${id} did not load`);
    await nextFrame();
  }
};
const waitForCondition = async (condition: () => boolean, description: string) => {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(description);
    await nextFrame();
  }
};
const pointData = (x: number, y: number) => ({
  type: 'FeatureCollection' as const,
  features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [x, y] } }]
});

it('restores managed layers after a public changeStyle and flushes an immediate addition', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, showDeclarativeControls: true, onCaptureMap: value => { view = value; } }
  });
  try {
    flushSync();
    await waitForNativeLayer(adapter, 'managed-geojson');
    const reloaded = waitForStyle(adapter);
    view!.dispatch({ type: 'changeStyle', style: alternateLocalStyle });
    view!.dispatch({ type: 'addLayer', layer: {
      id: 'after-change', type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      style: {}, visible: true, interactive: false
    } });
    await reloaded;
    await waitForNativeLayer(adapter, 'managed-geojson');
    await waitForNativeLayer(adapter, 'managed-heatmap');
    await waitForNativeLayer(adapter, 'after-change');
    const laterId = 'after-reload-completed';
    view!.dispatch({ type: 'addLayer', layer: {
      id: laterId, type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      style: {}, visible: true, interactive: false
    } });
    await waitForNativeLayer(adapter, laterId);
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('does not resurrect a pending layer removed during a style change', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, showDeclarativeControls: true, onCaptureMap: value => { view = value; } }
  });
  try {
    flushSync();
    await waitForNativeLayer(adapter, 'managed-geojson');
    view!.dispatch({ type: 'addLayer', layer: {
      id: 'ghost', type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      style: {}, visible: true, interactive: false
    } });
    flushSync();
    expect(adapter.pendingLayerIds()).toContain('ghost');
    const reloaded = waitForStyle(adapter);
    view!.dispatch({ type: 'changeStyle', style: alternateLocalStyle });
    view!.dispatch({ type: 'removeLayer', id: 'ghost' });
    flushSync();
    await reloaded;
    await waitForNativeLayer(adapter, 'managed-geojson');
    expect(view!.state?.layers.some(layer => layer.id === 'ghost')).toBe(false);
    expect(adapter.hasNativeLayer('ghost')).toBe(false);
    expect(adapter.pendingLayerIds()).not.toContain('ghost');
  } finally {
    await unmount(instance);
    target.remove();
  }
});

async function runPendingLayerChange(change: (view: ChildView<MapState, MapAction>) => void,
  assertNative: (adapter: LocalStyleMapAdapter) => Promise<void>) {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, showDeclarativeControls: true, onCaptureMap: value => { view = value; } }
  });
  try {
    flushSync();
    await waitForNativeLayer(adapter, 'managed-geojson');
    view!.dispatch({ type: 'addLayer', layer: {
      id: 'changing', type: 'geojson', data: pointData(1, 1),
      style: {}, visible: true, interactive: false
    } });
    flushSync();
    expect(adapter.pendingLayerIds()).toContain('changing');
    const reloaded = waitForStyle(adapter);
    view!.dispatch({ type: 'changeStyle', style: alternateLocalStyle });
    change(view!);
    flushSync();
    await reloaded;
    await waitForNativeLayer(adapter, 'changing');
    await assertNative(adapter);
  } finally {
    await unmount(instance);
    target.remove();
  }
}

it('restores changed pending GeoJSON data after a public style reload', async () => {
  await runPendingLayerChange(
    view => view.dispatch({ type: 'updateLayer', id: 'changing', updates: { data: pointData(9, 9) } }),
    async adapter => {
      await waitForCondition(() => JSON.stringify(adapter.nativeSourceData('changing')).includes('[9,9]'),
        'Updated pending GeoJSON data did not reach the native source');
      expect(adapter.nativeSourceData('changing')).toMatchObject({
        features: [{ geometry: { coordinates: [9, 9] } }]
      });
    }
  );
});

it('restores changed pending visibility after a public style reload', async () => {
  await runPendingLayerChange(
    view => view.dispatch({ type: 'toggleLayerVisibility', id: 'changing' }),
    async adapter => {
      await waitForCondition(() => adapter.nativeVisibility('changing') === 'none',
        'Hidden pending layer remained visible in the native engine');
      expect(adapter.nativeVisibility('changing')).toBe('none');
    }
  );
});

it('flushes layers queued while another GeoJSON source loads and survives a reactive data update', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, showDeclarativeControls: true, onCaptureMap: value => { view = value; } }
  });
  try {
    flushSync();
    await waitForNativeLayer(adapter, 'managed-geojson');
    for (const id of ['during-source-x1', 'during-source-x2']) {
      view!.dispatch({ type: 'addLayer', layer: {
        id, type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        style: {}, visible: true, interactive: false
      } });
    }
    flushSync();
    expect(adapter.pendingLayerIds()).toEqual(expect.arrayContaining(['during-source-x1', 'during-source-x2']));
    await waitForNativeLayer(adapter, 'during-source-x1');
    await waitForNativeLayer(adapter, 'during-source-x2');
    const button = target.querySelector<HTMLButtonElement>('[data-testid="update-managed-geojson"]');
    expect(button).not.toBeNull();
    button!.click();
    flushSync();
    await waitForNativeLayer(adapter, 'managed-geojson');
    expect(view!.state?.layers.find(layer => layer.id === 'managed-geojson')?.data).toMatchObject({
      features: [{ geometry: { coordinates: [13, 42] } }]
    });
    expect(adapter.nativeSourceData('managed-geojson')).toMatchObject({
      features: [{ geometry: { coordinates: [13, 42] } }]
    });
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('completes a native managed flight and isolates a fresh adapter after replacement', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const first = new LocalStyleMapAdapter();
  const second = new LocalStyleMapAdapter();
  let active = first;
  const captured: Array<ChildView<MapState, MapAction>> = [];
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: {
      adapter: () => active,
      onCaptureMap: value => { captured.push(value); },
      onApp: value => { app = value; }
    }
  });

  try {
    flushSync();
    const firstView = captured[0]!;
    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Native flight did not complete')), 10_000);
      first.on('moveend', () => { clearTimeout(timer); resolve(); });
    });
    firstView.dispatch({ type: 'flyTo', center: [2, 3], zoom: 7, duration: 0 });
    await completed;
    expect(firstView.state?.flyToTarget).toBeUndefined();
    expect(firstView.state?.viewport.center).toEqual([2, 3]);
    expect(firstView.state?.viewport.zoom).toBe(7);

    firstView.dispatch({ type: 'flyTo', center: [15, 16], zoom: 8, duration: 2000 });
    const oldFlightId = first.currentFlightId;
    active = second;
    app!.store.dispatch({ type: 'replaceMap' });
    flushSync();

    const secondView = captured[1]!;
    expect(secondView).not.toBe(firstView);
    expect(first.destroyCount).toBe(1);
    expect(second.destroyCount).toBe(0);
    expect(secondView.state?.viewport.center).toEqual([50, 50]);
    expect(target.querySelectorAll('canvas')).toHaveLength(1);
    for (const handler of first.retainedMoveHandlers) handler({ flightId: oldFlightId });
    expect(secondView.state?.viewport.center).toEqual([50, 50]);
    expect(secondView.state?.viewport.zoom).toBe(10);
    expect(second.getCenter()).toEqual([50, 50]);
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('replays managed declarative and pending layers after a native style reload', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, showDeclarativeControls: true, onCaptureMap: value => { view = value; } }
  });

  try {
    flushSync();
    expect(view).toBeDefined();
    await waitForNativeLayer(adapter, 'managed-geojson');
    expect(adapter.hasNativeLayer('managed-geojson')).toBe(true);
    expect(adapter.hasNativeLayer('managed-heatmap')).toBe(true);

    const reloaded = waitForStyle(adapter);
    adapter.reloadNativeStyle();
    view!.dispatch({ type: 'addLayer', layer: {
      id: 'managed-pending', type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      style: { fillColor: '#123456' }, visible: true, interactive: false
    } });
    await reloaded;
    await nextFrame();
    expect(adapter.hasNativeLayer('managed-geojson')).toBe(true);
    expect(adapter.hasNativeLayer('managed-heatmap')).toBe(true);
    expect(adapter.hasNativeLayer('managed-pending')).toBe(true);
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('retires a managed MapPrimitive and its real MapLibre canvas before DOM removal', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, onApp: (value) => { app = value; } }
  });

  try {
    flushSync();
    expect(app).toBeDefined();
    const feature = target.querySelector('[data-testid="managed-map-feature"]');
    expect(feature).not.toBeNull();
    const canvas = feature?.querySelector('canvas');
    expect(canvas).not.toBeNull();
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl') ?? null;
    expect(context).not.toBeNull();

    app!.store.dispatch({ type: 'closeMap' });
    // The owner is retired synchronously while the outgoing DOM is still present.
    expect(target.contains(feature)).toBe(true);
    expect(adapter.destroyCount).toBe(1);
    expect(feature?.querySelector('canvas')).toBeNull();
    expect(context?.isContextLost()).toBe(true);

    flushSync();
    await nextFrame();
    expect(adapter.destroyCount).toBe(1);
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('leaves a sibling native map running when one managed owner retires during load', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  const primary = new LocalStyleMapAdapter();
  const sidebar = new LocalStyleMapAdapter();
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  const subscriberErrors: unknown[][] = [];
  const originalError = console.error;
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('Subscriber error')) subscriberErrors.push(args);
    else originalError(...args);
  });
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: {
      adapter: primary,
      sidebarAdapter: sidebar,
      onApp: (value) => { app = value; }
    }
  });

  try {
    flushSync();
    expect(app).toBeDefined();
    app!.store.dispatch({ type: 'openBothMaps' });
    flushSync();
    expect(primary.viewportSetCount).toBeLessThan(5);
    expect(primary.getCenter()).toEqual([10, 20]);
    expect(primary.getZoom()).toBe(4);
    expect(primary.getBearing()).toBeCloseTo(0);
    expect(primary.getPitch()).toBeCloseTo(0);
    expect(subscriberErrors).toEqual([]);
    // Native movement after programmatic sync must still flow back to state.
    primary.setCenter([11, 21]);
    expect(app!.store.state.map?.viewport.center).toEqual([11, 21]);
    expect(target.querySelectorAll('canvas').length).toBe(2);
    const siblingLoaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sibling map did not load')), 10_000);
      sidebar.on('load', () => { clearTimeout(timer); resolve(); });
    });
    app!.store.dispatch({ type: 'closeMapA' });
    expect(primary.destroyCount).toBe(1);
    expect(sidebar.destroyCount).toBe(0);
    await siblingLoaded;
    expect(target.querySelectorAll('canvas').length).toBe(1);
    expect(sidebar.getCenter()).toEqual([30, 40]);
  } finally {
    errorSpy.mockRestore();
    await unmount(instance);
    target.remove();
  }
});

it('reconciles a real MapLibre-clamped viewport to the managed state', async () => {
  const target = document.createElement('div');
  target.style.width = '320px';
  target.style.height = '240px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, onCaptureMap: value => { view = value; } }
  });

  try {
    flushSync();
    expect(view).toBeDefined();
    view!.dispatch({ type: 'setCenter', center: [0, 89] });
    view!.dispatch({ type: 'setZoom', zoom: 30 });
    view!.dispatch({ type: 'setBearing', bearing: 270 });
    view!.dispatch({ type: 'setPitch', pitch: 80 });

    const viewport = view!.state?.viewport;
    expect(viewport).toBeDefined();
    expect(viewport!.center[1]).toBeCloseTo(adapter.getCenter()[1], 3);
    expect(viewport!.zoom).toBeCloseTo(adapter.getZoom(), 3);
    expect(viewport!.bearing).toBeCloseTo(adapter.getBearing(), 3);
    expect(viewport!.pitch).toBeCloseTo(adapter.getPitch(), 3);
    expect(viewport!.center[1]).toBeLessThan(89);
    expect(viewport!.zoom).toBeLessThan(30);
    expect(viewport!.bearing).not.toBe(270);
    expect(viewport!.pitch).toBeLessThan(80);

    // A later engine event still flows back after the setter group finishes.
    adapter.setCenter([2, 3]);
    expect(view!.state?.viewport.center).toEqual([2, 3]);
  } finally {
    await unmount(instance);
    target.remove();
  }
});

it('applies zoom before center for a world-view to high-latitude jump', async () => {
  const target = document.createElement('div');
  target.style.width = '320px';
  target.style.height = '240px';
  document.body.append(target);
  const adapter = new LocalStyleMapAdapter();
  let view: ChildView<MapState, MapAction> | undefined;
  const instance = mount(ManagedMapRecipeApp, {
    target,
    props: { adapter, onCaptureMap: value => { view = value; } }
  });

  try {
    flushSync();
    expect(view).toBeDefined();
    view!.dispatch({ type: 'setZoom', zoom: 0 });
    view!.dispatch({ type: 'setCenter', center: [0, 0] });
    expect(adapter.getZoom()).toBe(0);
    expect(adapter.getCenter()).toEqual([0, 0]);

    view!.dispatch({
      type: 'viewportChanged',
      viewport: { center: [0, 80], zoom: 5, bearing: 0, pitch: 0 }
    });

    expect(adapter.getZoom()).toBe(5);
    expect(adapter.getCenter()[1]).toBeCloseTo(80, 3);
    expect(view!.state?.viewport.zoom).toBe(5);
    expect(view!.state?.viewport.center[1]).toBeCloseTo(80, 3);
  } finally {
    await unmount(instance);
    target.remove();
  }
});
