/**
 * Layer components must mount without a runaway effect.
 *
 * `GeoJSONLayer` and `HeatmapLayer` build their `style` prop with
 * `$derived({...})` and then dispatch it from an `$effect`. `dispatch` reads
 * store state inside that effect's tracking scope, so a reducer case that
 * returns a fresh object on every dispatch re-triggers the effect forever —
 * `effect_update_depth_exceeded`, on mount, with no workaround for the consumer.
 *
 * The `mounted` flag both components carry does not help: after the first run
 * it is a constant `true`. Nor can a reference guard help, because the derived
 * style object is a new identity every render. The fix has to make the reducer
 * case idempotent *by value*, which is what these tests pin.
 *
 * Both are public exports that no example or test rendered, which is why they
 * shipped broken.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import GeoJSONLayer from '../src/lib/components/GeoJSONLayer.svelte';
import HeatmapLayer from '../src/lib/components/HeatmapLayer.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

const makeStore = () =>
  createStore({
    initialState: createInitialMapState({ provider: 'maplibre', center: [0, 0], zoom: 2 }),
    reducer: mapReducer,
    dependencies: {}
  });

const emptyFeatureCollection = { type: 'FeatureCollection', features: [] } as const;

let cleanup: Array<() => void> = [];

afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

/** Mounts into a real detached node; a runaway effect throws before we assert. */
function mountComponent(Component: any, props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Component, { target, props });
  cleanup.push(() => {
    unmount(instance);
    target.remove();
  });
  return target;
}

describe('layer components mount cleanly', () => {
  it('GeoJSONLayer mounts with inline style props', async () => {
    const target = mountComponent(GeoJSONLayer, {
      store: makeStore(),
      id: 'geo-1',
      data: emptyFeatureCollection,
      fillColor: '#0080ff',
      fillOpacity: 0.5,
      strokeWidth: 2
    });

    await settle();
    expect(target).toBeTruthy();
  });

  it('HeatmapLayer mounts with an inline colorGradient array', async () => {
    // colorGradient is `[number, string][]` written as a literal — a fresh
    // nested identity per render, so value comparison must recurse into it.
    const target = mountComponent(HeatmapLayer, {
      store: makeStore(),
      id: 'heat-1',
      data: emptyFeatureCollection,
      intensity: 0.8,
      radius: 20,
      colorGradient: [
        [0, 'blue'],
        [1, 'red']
      ]
    });

    await settle();
    expect(target).toBeTruthy();
  });
});

describe('updateLayerStyle is idempotent by value', () => {
  it('returns the identical state object when nothing changes', () => {
    const store = makeStore();
    store.dispatch({
      type: 'addLayer',
      layer: {
        id: 'layer-1',
        type: 'geojson',
        data: emptyFeatureCollection,
        style: { fillColor: '#0080ff', colorGradient: [[0, 'blue']] },
        visible: true,
        interactive: true
      }
    });

    const before = store.state;
    // A structurally-equal but referentially-fresh style, exactly what the
    // components' `$derived` produces on each render.
    const [after] = mapReducer(
      before,
      { type: 'updateLayerStyle', id: 'layer-1', style: { fillColor: '#0080ff', colorGradient: [[0, 'blue']] } },
      {}
    );

    expect(after).toBe(before);
  });

  it('still applies a genuine change', () => {
    const store = makeStore();
    store.dispatch({
      type: 'addLayer',
      layer: {
        id: 'layer-1',
        type: 'geojson',
        data: emptyFeatureCollection,
        style: { fillColor: '#0080ff' },
        visible: true,
        interactive: true
      }
    });

    const [after] = mapReducer(
      store.state,
      { type: 'updateLayerStyle', id: 'layer-1', style: { fillColor: '#ff0000' } },
      {}
    );

    expect(after.layers[0]!.style.fillColor).toBe('#ff0000');
  });
});
