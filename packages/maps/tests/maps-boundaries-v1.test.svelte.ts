/**
 * Regression tests for B057-1/2/3/5/6/7 maps boundary repairs.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import Map from '../src/lib/components/Map.svelte';
import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import Popup from '../src/lib/components/Popup.svelte';
import GeoJSONLayer from '../src/lib/components/GeoJSONLayer.svelte';
import HeatmapLayer from '../src/lib/components/HeatmapLayer.svelte';
import { MaplibreAdapter } from '../src/lib/utils/maplibre-adapter';
import { MapboxAdapter } from '../src/lib/mapbox/index';
import { FakeMapAdapter } from './helpers/fake-adapter';
import type { GeoJSON, FlyToOptions } from '../src/lib/types/map.types';

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

describe('B057-1: onMapClick forwarding', () => {
  it('Map forwards onMapClick to MapPrimitive and handles clicks', async () => {
    const store = createStore({
      initialState: createInitialMapState({}),
      reducer: mapReducer,
      dependencies: {}
    });
    const adapter = new FakeMapAdapter();
    let clickedLngLat: [number, number] | null = null;
    const onMapClick = vi.fn((coords: [number, number]) => {
      clickedLngLat = coords;
    });

    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(Map, {
      target,
      props: { store, adapter, onMapClick }
    });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();

    adapter.emit('click', { lngLat: { lng: 4.9, lat: 52.4 } });
    expect(onMapClick).toHaveBeenCalledTimes(1);
    expect(clickedLngLat).toEqual([4.9, 52.4]);

    adapter.emit('click', { lngLat: [10.5, 20.5] });
    expect(onMapClick).toHaveBeenCalledTimes(2);
    expect(clickedLngLat).toEqual([10.5, 20.5]);
  });
});

describe('B057-2: repeated visibility toggles', () => {
  it('MaplibreAdapter toggleLayerVisibility toggles visibility repeatedly', () => {
    const adapter = new MaplibreAdapter();
    const calls: Array<[string, string, string]> = [];
    (adapter as any).map = {
      getLayer: () => true,
      setLayoutProperty: (id: string, prop: string, val: string) => {
        calls.push([id, prop, val]);
      }
    };
    (adapter as any).layers.set('test-layer', {
      id: 'test-layer',
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      style: {},
      visible: true,
      interactive: true
    });

    adapter.toggleLayerVisibility('test-layer');
    expect(calls.slice(-2)).toEqual([['test-layer', 'visibility', 'none'], ['test-layer-stroke', 'visibility', 'none']]);

    adapter.toggleLayerVisibility('test-layer');
    expect(calls.slice(-2)).toEqual([['test-layer', 'visibility', 'visible'], ['test-layer-stroke', 'visibility', 'visible']]);

    adapter.toggleLayerVisibility('test-layer');
    expect(calls.slice(-2)).toEqual([['test-layer', 'visibility', 'none'], ['test-layer-stroke', 'visibility', 'none']]);
  });
});

describe('B057-3: camera completion without snapback', () => {
  it('flyTo updates viewport on completion and avoids snapback on subsequent actions', async () => {
    const store = createStore({
      initialState: createInitialMapState({ center: [0, 0], zoom: 2 }),
      reducer: mapReducer,
      dependencies: {}
    });
    const adapter = new FakeMapAdapter();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();

    store.dispatch({
      type: 'flyTo',
      center: [10, 20],
      zoom: 12,
      duration: 20
    });

    expect(store.state.flyToTarget).toBeDefined();
    adapter.setCenter([10,20]); adapter.setZoom(12); adapter.emit('moveend');
    flushSync();

    expect(store.state.viewport.center).toEqual([10, 20]);
    expect(store.state.viewport.zoom).toBe(12);
    expect(store.state.flyToTarget).toBeUndefined();

    adapter.calls.length = 0;
    store.dispatch({ type: 'setPitch', pitch: 30 });
    flushSync();
    await settle();

    const setCenterCalls = adapter.callsTo('setCenter');
    for (const call of setCenterCalls) {
      expect(call.args[0]).toEqual([10, 20]);
      expect(call.args[0]).not.toEqual([0, 0]);
    }
  });
});

describe('B057-4 and B057-5: popup initial closed state and timer cleanup', () => {
  it('openPopup preserves isOpen: false in reducer', () => {
    const initialState = createInitialMapState({});
    const [state] = mapReducer(
      initialState,
      {
        type: 'openPopup',
        popup: {
          id: 'p1',
          position: [0, 0],
          content: 'text',
          isOpen: false
        }
      },
      {}
    );
    expect(state.popups[0]!.isOpen).toBe(false);
  });

  it('Popup respects initial isOpen={false} and unmount clears timer', async () => {
    const store = createStore({
      initialState: createInitialMapState({}),
      reducer: mapReducer,
      dependencies: {}
    });
    const adapter = new FakeMapAdapter();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const mapInstance = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanup.push(() => {
      unmount(mapInstance);
      target.remove();
    });

    const popupTarget = document.createElement('div');
    document.body.appendChild(popupTarget);
    const popupInstance = mount(Popup, {
      target: popupTarget,
      props: {
        store,
        id: 'closed-pop',
        position: [1, 2] as [number, number],
        isOpen: false
      }
    });
    cleanup.push(() => {
      unmount(popupInstance);
      popupTarget.remove();
    });

    await settle();
    expect(store.state.popups).toHaveLength(1);
    expect(store.state.popups[0]!.isOpen).toBe(false);
    expect(adapter.callsTo('openPopup')).toHaveLength(0);
  });
});

describe('B057-6: reactive layer props', () => {
  it('GeoJSONLayer reactively updates visible, data, and interactive', async () => {
    const store = createStore({
      initialState: createInitialMapState({}),
      reducer: mapReducer,
      dependencies: {}
    });
    const target = document.createElement('div');
    document.body.appendChild(target);

    const data1: GeoJSON = { type: 'FeatureCollection', features: [] };
    const data2: GeoJSON = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }]
    };

    let visible = $state(true);
    let data = $state.raw(data1);
    let interactive = $state(true);

    const instance = mount(GeoJSONLayer, {
      target,
      props: {
        store,
        id: 'reactive-geo',
        get visible() {
          return visible;
        },
        get data() {
          return data;
        },
        get interactive() {
          return interactive;
        }
      }
    });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();
    expect(store.state.layers[0]!.visible).toBe(true);
    expect(store.state.layers[0]!.data).toBe(data1);

    visible = false;
    flushSync();
    await settle();
    expect(store.state.layers[0]!.visible).toBe(false);

    data = data2;
    flushSync();
    await settle();
    expect(store.state.layers[0]!.data).toBe(data2);

    interactive = false;
    flushSync();
    await settle();
    expect(store.state.layers[0]!.interactive).toBe(false);
  });
});

describe('B057-7: style reload layer restoration', () => {
  it('MapPrimitive restores rendered layers after style reload', async () => {
    const emptyFC: GeoJSON = { type: 'FeatureCollection', features: [] };
    const store = createStore({
      initialState: {
        ...createInitialMapState({}),
        layers: [
          {
            id: 'restore-layer-1',
            type: 'geojson' as const,
            data: emptyFC,
            style: { fillColor: '#0080ff' },
            visible: true,
            interactive: true
          }
        ]
      },
      reducer: mapReducer,
      dependencies: {}
    });

    const adapter = new FakeMapAdapter();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();
    expect(adapter.callsTo('addLayer')).toHaveLength(1);

    adapter.calls.length = 0;
    store.dispatch({ type: 'changeTileProvider', provider: 'carto-dark' });
    flushSync();
    await settle();

    expect(adapter.callsTo('changeStyle')).toHaveLength(1);
    expect(adapter.callsTo('addLayer')).toHaveLength(0);
    adapter.emit('style.load');
    const reAdded = adapter.callsTo('addLayer');
    expect(reAdded.length).toBeGreaterThan(0);
    expect((reAdded[0]!.args[0] as { id: string }).id).toBe('restore-layer-1');
  });
});


describe('owned engine completion events', () => {
 async function fixture() {
  const store=createStore({initialState:createInitialMapState({}),reducer:mapReducer,dependencies:{}});
  const adapter=new FakeMapAdapter();const target=document.createElement('div');document.body.append(target);
  const component=mount(MapPrimitive,{target,props:{store,adapter}});
  let mounted=true; const destroy=async()=>{if(mounted){mounted=false;await unmount(component);target.remove();}};
  cleanup.push(()=>{void destroy();store.destroy();});await settle();return {store,adapter,destroy};
 }
 it('restores latest layer state only after the replacement style is ready',async()=>{
  const {store,adapter}=await fixture();
  store.dispatch({type:'changeTileProvider',provider:'carto-dark'});
  store.dispatch({type:'addLayer',layer:{id:'latest',type:'geojson',data:{type:'FeatureCollection',features:[]},style:{},visible:true,interactive:true}});
  store.dispatch({type:'setLayerVisibility',id:'latest',visible:false});
  expect(adapter.callsTo('addLayer')).toHaveLength(0);
  adapter.emit('style.load');
  expect(adapter.callsTo('addLayer')).toHaveLength(1);
  expect(adapter.callsTo('addLayer')[0]!.args[0]).toMatchObject({id:'latest',visible:false});
 });
 it('drops map events after component teardown',async()=>{
  const {store,adapter,destroy}=await fixture();
  store.dispatch({type:'flyTo',center:[10,20]});
  await destroy();const before=store.state;adapter.calls.length=0;
  adapter.setCenter([99,99]);adapter.emit('moveend');adapter.emit('style.load');
  expect(store.state).toBe(before);expect(adapter.callsTo('addLayer')).toHaveLength(0);
 });
 it('does not complete a replacement flight started by a viewport observer',async()=>{
  const {store,adapter}=await fixture();
  store.dispatch({type:'flyTo',center:[10,20]});
  let replaced=false;
  const unsubscribe=store.subscribeToActions!((action)=>{
   if(action.type==='viewportChanged'&&!replaced){replaced=true;store.dispatch({type:'flyTo',center:[30,40]});}
  });
  adapter.setCenter([10,20]);adapter.emit('moveend');
  expect(replaced).toBe(true);
  expect(store.state.flyToTarget?.center).toEqual([30,40]);
  unsubscribe();
  adapter.setCenter([30,40]);adapter.emit('moveend');
  expect(store.state.flyToTarget).toBeUndefined();
 });
 it('survives synchronous unmount from a viewport observer without completing the flight',async()=>{
  const {store,adapter,destroy}=await fixture();
  store.dispatch({type:'flyTo',center:[10,20]});
  let destruction: Promise<void> | undefined;
  const completions: string[]=[];
  const unsubscribe=store.subscribeToActions!((action)=>{
   if(action.type==='viewportChanged') destruction=destroy();
   if(action.type==='flyToCompleted') completions.push(action.type);
  });
  expect(()=>adapter.emit('moveend')).not.toThrow();
  await destruction;
  expect(completions).toEqual([]);
  unsubscribe();
 });
 it('uses the interrupted engine position rather than an intended flight target',async()=>{
  const {store,adapter}=await fixture();
  store.dispatch({type:'flyTo',center:[10,20],duration:1000});
  adapter.setCenter([3,4]);adapter.setZoom(5);adapter.emit('moveend');
  expect(store.state.viewport.center).toEqual([3,4]);expect(store.state.flyToTarget).toBeUndefined();
 });
});


describe('adapter pending layer lifecycle and style readiness', () => {
  for (const [name, AdapterClass] of [
    ['MaplibreAdapter', MaplibreAdapter],
    ['MapboxAdapter', MapboxAdapter]
  ] as const) {
    describe(name, () => {
      function createMockedAdapter() {
        const adapter = new AdapterClass();
        let styleLoaded = false;
        const onHandlers = new globalThis.Map<string, Function[]>();
        const sources = new globalThis.Map<string, any>();
        const layers = new globalThis.Map<string, any>();
        (adapter as any).map = {
          isStyleLoaded: () => styleLoaded,
          once: (event: string, fn: Function) => {
            const list = onHandlers.get(event) ?? [];
            list.push(fn);
            onHandlers.set(event, list);
          },
          on: (event: string, fn: Function) => {
            const list = onHandlers.get(event) ?? [];
            list.push(fn);
            onHandlers.set(event, list);
          },
          off: (event: string, fn: Function) => {
            const list = onHandlers.get(event) ?? [];
            const remaining = list.filter((h) => h !== fn);
            if (remaining.length > 0) onHandlers.set(event, remaining);
            else onHandlers.delete(event);
          },
          getSource: (id: string) => sources.get(id),
          addSource: (id: string, src: any) => sources.set(id, src),
          getLayer: (id: string) => layers.get(id),
          addLayer: (spec: any) => layers.set(spec.id, spec),
          removeLayer: (id: string) => layers.delete(id),
          removeSource: (id: string) => sources.delete(id),
          setStyle: (_url: string) => {},
          remove: () => {}
        };
        return {
          adapter,
          setLoaded: (val: boolean) => {
            styleLoaded = val;
          },
          fireStyleLoad: () => {
            styleLoaded = true;
            for (const fn of [...(onHandlers.get('style.load') ?? [])]) fn();
          },
          onHandlers,
          sources,
          layers
        };
      }

      it('ignores a retired style callback when a new listener owns the same map', () => {
        const {adapter, onHandlers, sources, setLoaded, fireStyleLoad} = createMockedAdapter();
        const layer = {id:'same',type:'geojson' as const,data:{type:'FeatureCollection' as const,features:[]},style:{},visible:true,interactive:true};
        adapter.addLayer(layer);
        const stale = onHandlers.get('style.load')?.[0]!;
        adapter.removeLayer('same');
        adapter.addLayer({...layer,id:'new'});
        const current = onHandlers.get('style.load')?.[0];
        setLoaded(true);
        stale();
        expect(sources.size).toBe(0);
        expect(onHandlers.get('style.load')?.[0]).toBe(current);
        fireStyleLoad();
        expect(sources.has('new')).toBe(true);
        expect(sources.has('same')).toBe(false);
      });

      it('retires an old style completion snapshot when style changes on the same map', () => {
        const {adapter, onHandlers, sources, setLoaded, fireStyleLoad} = createMockedAdapter();
        adapter.addLayer({id:'waiting',type:'geojson',data:{type:'FeatureCollection',features:[]},style:{},visible:true,interactive:true});
        const oldStyleCallback = onHandlers.get('style.load')?.[0]!;
        adapter.changeStyle('replacement');
        expect(onHandlers.get('style.load')?.[0]).not.toBe(oldStyleCallback);
        setLoaded(true);
        oldStyleCallback();
        expect(sources.size).toBe(0);
        fireStyleLoad();
        expect(sources.has('waiting')).toBe(true);
      });

      it('tags actual engine flights before synchronous old and duration-zero completion', () => {
        const adapter = new AdapterClass();
        const observed: Array<{event:unknown,current:unknown}> = [];
        let prior: unknown;
        (adapter as any).map = {
          flyTo: (options: FlyToOptions, data: unknown) => {
            if (prior) observed.push({event:prior,current:adapter.currentFlightId});
            prior = data;
            if (options.duration === 0) observed.push({event:data,current:adapter.currentFlightId});
          }
        };
        adapter.flyTo({center:[1,2],duration:100});
        adapter.flyTo({center:[3,4],duration:0});
        expect(observed).toEqual([{event:{flightId:1},current:2},{event:{flightId:2},current:2}]);
      });

      it('defers multiple pending layers with one owned readiness listener per event', () => {
        const { adapter, fireStyleLoad, onHandlers, sources } = createMockedAdapter();

        adapter.addLayer({
          id: 'pending-1',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: { fillColor: '#111' },
          visible: true,
          interactive: true
        });

        adapter.addLayer({
          id: 'pending-2',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: { fillColor: '#222' },
          visible: true,
          interactive: true
        });

        expect(onHandlers.get('style.load')).toHaveLength(1);
        expect(onHandlers.get('styledata')).toHaveLength(1);
        expect(onHandlers.get('idle')).toHaveLength(1);
        expect(sources.has('pending-1')).toBe(false);
        expect(sources.has('pending-2')).toBe(false);

        fireStyleLoad();

        expect(sources.has('pending-1')).toBe(true);
        expect(sources.has('pending-2')).toBe(true);
      });

      it('handles removed and re-added layer with the same ID correctly', () => {
        const { adapter, fireStyleLoad, sources } = createMockedAdapter();

        adapter.addLayer({
          id: 'same-id',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: { fillColor: '#111' },
          visible: true,
          interactive: true
        });

        adapter.removeLayer('same-id');

        adapter.addLayer({
          id: 'same-id',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: { fillColor: '#999' },
          visible: true,
          interactive: true
        });

        fireStyleLoad();

        expect(sources.has('same-id')).toBe(true);
        const stored = (adapter as any).layers.get('same-id');
        expect(stored.style.fillColor).toBe('#999');
      });

      it('preserves pending layers across changeStyle until replacement style loads', () => {
        const { adapter, fireStyleLoad, sources } = createMockedAdapter();

        adapter.addLayer({
          id: 'replacement-pending',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: {},
          visible: true,
          interactive: true
        });

        adapter.changeStyle('https://example.com/replacement-style.json');
        expect(sources.has('replacement-pending')).toBe(false);

        fireStyleLoad();
        expect(sources.has('replacement-pending')).toBe(true);
      });

      it('unregisters listener and clears pending queue on destroy, ignoring stale callbacks after reinitialize', () => {
        const { adapter, onHandlers, sources } = createMockedAdapter();

        adapter.addLayer({
          id: 'destroy-pending',
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          style: {},
          visible: true,
          interactive: true
        });

        const staleCallback = onHandlers.get('style.load')?.[0];
        expect(staleCallback).toBeDefined();

        adapter.destroy();
        expect(onHandlers.has('style.load')).toBe(false);
        expect(onHandlers.has('styledata')).toBe(false);
        expect(onHandlers.has('idle')).toBe(false);

        const newMapSources = new globalThis.Map<string, any>();
        (adapter as any).map = {
          isStyleLoaded: () => false,
          once: () => {},
          off: () => {},
          addSource: (id: string, src: any) => newMapSources.set(id, src),
          remove: () => {}
        };

        staleCallback?.();

        expect(sources.has('destroy-pending')).toBe(false);
        expect(newMapSources.has('destroy-pending')).toBe(false);
      });
    });
  }
});

describe('camera flight synchronous interruption, duration 0, and eventual completion', () => {
  it('does not clear replacement target when flyTo synchronously emits old flight moveend, and completes on eventual completion', async () => {
    const store = createStore({
      initialState: createInitialMapState({ center: [0, 0], zoom: 2 }),
      reducer: mapReducer,
      dependencies: {}
    });

    class SyncInterruptionAdapter extends FakeMapAdapter {
      private activeFlightId: number | null = null;

      override flyTo(options: FlyToOptions) {
        const oldFlightId = this.activeFlightId;
        super.flyTo(options);
        const newFlightId = this.currentFlightId;
        this.activeFlightId = newFlightId;

        if (oldFlightId !== null) {
          this.emit('moveend', { flightId: oldFlightId });
        }
      }
    }

    const adapter = new SyncInterruptionAdapter();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();

    store.dispatch({ type: 'flyTo', center: [10, 20], duration: 1000 });
    flushSync();
    expect(store.state.flyToTarget?.center).toEqual([10, 20]);
    expect(adapter.currentFlightId).toBe(1);

    store.dispatch({ type: 'flyTo', center: [30, 40], duration: 1000 });
    flushSync();

    expect(store.state.flyToTarget?.center).toEqual([30, 40]);
    expect(adapter.currentFlightId).toBe(2);

    adapter.setCenter([30, 40]);
    adapter.emit('moveend', { flightId: 2 });
    flushSync();

    expect(store.state.flyToTarget).toBeUndefined();
    expect(store.state.viewport.center).toEqual([30, 40]);
  });

  it('completes immediate duration 0 replacement flight synchronously without dropping', async () => {
    const store = createStore({
      initialState: createInitialMapState({ center: [0, 0], zoom: 2 }),
      reducer: mapReducer,
      dependencies: {}
    });

    class Duration0Adapter extends FakeMapAdapter {
      private activeFlightId: number | null = null;

      override flyTo(options: FlyToOptions) {
        const oldFlightId = this.activeFlightId;
        super.flyTo(options);
        const newFlightId = this.currentFlightId;
        this.activeFlightId = newFlightId;

        if (oldFlightId !== null) {
          this.emit('moveend', { flightId: oldFlightId });
        }
        if (options.duration === 0) {
          this.setCenter(options.center);
          this.emit('moveend', { flightId: newFlightId });
        }
      }
    }

    const adapter = new Duration0Adapter();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(MapPrimitive, { target, props: { store, adapter } });
    cleanup.push(() => {
      unmount(instance);
      target.remove();
    });

    await settle();

    store.dispatch({ type: 'flyTo', center: [10, 20], duration: 1000 });
    flushSync();
    expect(store.state.flyToTarget?.center).toEqual([10, 20]);

    store.dispatch({ type: 'flyTo', center: [50, 60], duration: 0 });
    flushSync();

    expect(store.state.viewport.center).toEqual([50, 60]);
    expect(store.state.flyToTarget).toBeUndefined();
  });
});

describe('layer type update in reducer', () => {
  it('updates layer when type changes in mapReducer', () => {
    const initialState = {
      ...createInitialMapState({}),
      layers: [
        {
          id: 'test-layer',
          type: 'geojson' as const,
          data: { type: 'FeatureCollection' as const, features: [] },
          style: {},
          visible: true,
          interactive: true
        }
      ]
    };
    const [state] = mapReducer(
      initialState,
      {
        type: 'updateLayer',
        id: 'test-layer',
        updates: { type: 'heatmap' as const }
      },
      {}
    );
    expect(state.layers[0]!.type).toBe('heatmap');
  });
});
