/**
 * @file map-managed-proof.test.svelte.ts
 * Batch B2 Map Managed Proof Tests for Maps/Graphics/Charts lane.
 *
 * Verifies:
 * 1. Production-captured ChildView from actual defineViews/FeatureViews/FeatureOutlet
 *    drives MapPrimitive / Map via narrow structural MapStore with zero root per-widget
 *    store, zero fabricated authority, and fully typed capture pipeline.
 * 2. Strict ComponentProps typing check against actual public component props.
 * 3. Terminal notification timing and prompt native adapter destruction on owner retirement
 *    (BEFORE DOM unmount) with exact disposal count = 1.
 * 4. Idempotent cleanup: subsequent DOM unmount does not destroy adapter a second time.
 * 5. One business route: native click dispatches typed action via map feature ChildView/root action.
 *    Full gating of all native callbacks and actions after owner retirement.
 * 6. Same-ID replacement: captures new view, destroys old adapter, isolates state,
 *    and stale callbacks from old adapter cannot mutate new view or store.
 * 7. Two siblings isolation: two managed maps mount simultaneously under a single root store,
 *    state/dispatches are isolated, retiring one cleans up its adapter while the other continues unaffected.
 * 8. Delayed style `load` under removal, replacement, and sibling continuation tested in real managed app.
 * 9. Regressions for 0 listeners after retirement and unmount in component-owned mode.
 * 10. Capture-then-retire-then-mount view gives 0 initialize calls.
 * 11. Reentrant retirement during moveend gives single destroy and no throw.
 * 12. Stale flightId moveend after same-ID replacement cannot mutate new view/root.
 * 13. Preserved standalone Store API with createStore.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, type ComponentProps } from 'svelte';
import { createStore } from '@composable-svelte/core';
import type { ChildView, ApplicationInstance } from '@composable-svelte/core/application';

import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import Map from '../src/lib/components/Map.svelte';
import GeoJSONLayer from '../src/lib/components/GeoJSONLayer.svelte';
import HeatmapLayer from '../src/lib/components/HeatmapLayer.svelte';
import Popup from '../src/lib/components/Popup.svelte';
import TileProviderControl from '../src/lib/components/TileProviderControl.svelte';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer.js';
import type {
  MapState,
  MapAction,
  MapAdapter,
  MapInitOptions,
  MapStore
} from '../src/lib/types/map.types.js';

import { FakeMapAdapter } from './helpers/fake-adapter.js';
import ManagedMapRecipeApp from './fixtures/ManagedMapRecipeApp.svelte';
import type { AppState, AppAction } from './fixtures/managed-map-recipe-model.js';

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

// Top-level class declarations avoiding nested class warnings in Svelte compiler
class DelayedStyleAdapter extends FakeMapAdapter {
  pendingStyleLoad = false;

  override changeStyle(styleURL: string) {
    super.changeStyle(styleURL);
    this.pendingStyleLoad = true;
  }

  flushStyleLoad() {
    if (this.pendingStyleLoad) {
      this.pendingStyleLoad = false;
      this.emit('style.load');
    }
  }
}

let cleanupFns: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch {
      // ignore in cleanup
    }
  }
  cleanupFns = [];
});

describe('Batch B2 Map Managed Proof', () => {
  it('binds all declarative map components to one genuine managed view', async () => {
    const adapter = new FakeMapAdapter();
    let view: ChildView<MapState, MapAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ManagedMapRecipeApp, {
      target,
      props: {
        adapter,
        showDeclarativeControls: true,
        onCaptureMap: value => { view = value; },
        onApp: value => { app = value; }
      }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    await settle();

    expect(view).toBeDefined();
    const _geo: ComponentProps<typeof GeoJSONLayer>['store'] = view!;
    const _heat: ComponentProps<typeof HeatmapLayer>['store'] = view!;
    const _popup: ComponentProps<typeof Popup>['store'] = view!;
    const _control: ComponentProps<typeof TileProviderControl>['store'] = view!;
    expect([_geo, _heat, _popup, _control]).toEqual([view, view, view, view]);
    expect(view!.state?.layers.map(layer => layer.id)).toEqual(['managed-geojson', 'managed-heatmap']);
    expect(view!.state?.popups.map(popup => popup.id)).toEqual(['managed-popup']);
    expect(target.querySelector('select')?.disabled).toBe(false);

    app!.store.dispatch({ type: 'closeMap' });
    expect(view!.state).toBeUndefined();
    expect(adapter.callsTo('destroy')).toHaveLength(1);
    flushSync();
    expect(adapter.callsTo('destroy')).toHaveLength(1);
  });

  it('cancels pending managed popup creation on owner retirement', async () => {
    const adapter = new FakeMapAdapter();
    let view: ChildView<MapState, MapAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ManagedMapRecipeApp, {
      target,
      props: {
        adapter,
        showDeclarativeControls: true,
        onCaptureMap: value => { view = value; },
        onApp: value => { app = value; }
      }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    app!.store.dispatch({ type: 'closeMap' });
    expect(view!.state).toBeUndefined();
    await settle();
    expect(app!.store.state.map).toBeNull();
    expect(adapter.callsTo('addPopup')).toHaveLength(0);
    expect(adapter.callsTo('destroy')).toHaveLength(1);
  });
  // ==========================================================================
  // Proof 1: Production ChildView drives Map / MapPrimitive
  // ==========================================================================
  describe('Proof 1: Production ChildView drives Map / MapPrimitive via narrow structural MapStore', () => {
    it('captures genuine ChildView from FeatureOutlet and drives MapPrimitive with zero casts', async () => {
      const adapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // 1. Verify captured view is a genuine ChildView
      expect(capturedView).not.toBeNull();
      const view = capturedView!;

      // Conforms to ChildView: has state, dispatch, select, subscribe
      expect(typeof view.dispatch).toBe('function');
      expect(typeof view.select).toBe('function');
      expect(typeof view.subscribe).toBe('function');
      expect(view.state).toBeDefined();

      // Deliberately lacks root Store authority: NO destroy, NO history
      expect('destroy' in view).toBe(false);
      expect('history' in view).toBe(false);

      // 2. Verify ComponentProps typing
      // This is a compile-time and runtime proof that ComponentProps accepts ChildView
      type PrimitiveProps = ComponentProps<typeof MapPrimitive>;
      type MapProps = ComponentProps<typeof Map>;
      const _testAssignPrimitive: PrimitiveProps['store'] = view;
      const _testAssignMap: MapProps['store'] = view;
      expect(_testAssignPrimitive).toBe(view);
      expect(_testAssignMap).toBe(view);

      // 3. Verify adapter initialization from managed state
      expect(adapter.initialized).toBe(true);
      expect(adapter.getCenter()).toEqual([12.4924, 41.8902]);
      expect(adapter.getZoom()).toBe(10);

      // 4. Verify dispatch through ChildView updates adapter
      view.dispatch({ type: 'setZoom', zoom: 14 });
      flushSync();
      await settle();

      expect(view.state?.viewport.zoom).toBe(14);
      expect(adapter.getZoom()).toBe(14);

      // 5. Verify marker dispatch through ChildView
      view.dispatch({
        type: 'addMarker',
        marker: { id: 'marker-colosseum', position: [12.4924, 41.8902] }
      });
      flushSync();
      await settle();

      expect(adapter.callsTo('addMarker').length).toBe(1);
      expect(view.state?.markers.length).toBe(1);
    });
  });

  // ==========================================================================
  // Proof 2: Terminal notification timing & prompt destruction BEFORE DOM unmount
  // ==========================================================================
  describe('Proof 2: Terminal notification timing and exact disposal count', () => {
    it('destroys native adapter promptly on owner retirement BEFORE DOM unmount with exact disposal count = 1', async () => {
      const adapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      expect(adapter.initialized).toBe(true);
      expect(adapter.callsTo('destroy').length).toBe(0);

      // 1. Dispatch action to retire owner (close map)
      appInstance!.store.dispatch({ type: 'closeMap' });
      // Svelte has not flushed the outgoing DOM yet. Resource ownership has
      // already ended, so disposal must be synchronous with the root action.
      expect(target.querySelector('[data-testid="managed-map-feature"]')).not.toBeNull();
      expect(adapter.callsTo('destroy').length).toBe(1);
      expect(adapter.initialized).toBe(false);

      // 3. ChildView.state is now undefined
      expect(capturedView!.state).toBeUndefined();

      flushSync();
      await settle();

      // 4. Now unmount the Svelte application
      unmount(app);
      app = null;

      // 5. Cleanup is strictly IDEMPOTENT: destroy was not called a second time
      expect(adapter.callsTo('destroy').length).toBe(1);
    });
  });

  // ==========================================================================
  // Proof 3: One business route (typed click) & complete callback gating after retirement
  // ==========================================================================
  describe('Proof 3: One business route (typed click) and gating after retirement', () => {
    it('dispatches typed click action to root and gates callbacks after retirement with zero leaked dispatches', async () => {
      const adapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // Part A: Live mode — native click dispatches typed action via map feature ChildView to root store
      adapter.emit('click', { lngLat: [12.4924, 41.8902] });
      flushSync();
      await settle();

      expect(appInstance!.store.state.lastClickedCoords).toEqual([12.4924, 41.8902]);

      // Part B: Capture all adapter handlers registered by MapPrimitive before retirement
      const clickHandlers = [...(adapter.handlers.get('click') ?? [])];
      const dragStartHandlers = [...(adapter.handlers.get('dragstart') ?? [])];
      const dragEndHandlers = [...(adapter.handlers.get('dragend') ?? [])];
      const moveEndHandlers = [...(adapter.handlers.get('moveend') ?? [])];
      const loadHandlers = [...(adapter.handlers.get('load') ?? [])];
      const styleLoadHandlers = [...(adapter.handlers.get('style.load') ?? [])];
      const errorHandlers = [...(adapter.handlers.get('error') ?? [])];

      expect(clickHandlers.length).toBeGreaterThan(0);
      expect(moveEndHandlers.length).toBeGreaterThan(0);

      // Track any state changes on root store after retirement
      let retired = false;
      let stateChangesAfterRetirement = 0;
      const unsubState = appInstance!.store.subscribe(() => {
        if (retired) {
          stateChangesAfterRetirement++;
        }
      });
      cleanupFns.push(unsubState);

      // Retire the owner
      appInstance!.store.dispatch({ type: 'closeMap' });
      flushSync();
      await settle();
      retired = true;

      expect(capturedView!.state).toBeUndefined();
      expect(adapter.callsTo('destroy').length).toBe(1);

      // Now fire every single native handler with simulated engine events
      for (const h of clickHandlers) {
        h({ lngLat: [99.9999, 99.9999] });
      }
      for (const h of dragStartHandlers) h();
      for (const h of dragEndHandlers) h();
      for (const h of moveEndHandlers) h();
      for (const h of loadHandlers) h();
      for (const h of styleLoadHandlers) h();
      for (const h of errorHandlers) h({ error: { message: 'Late engine error' } });

      // Negative assertions:
      // 1. Root state's lastClickedCoords was NOT mutated by the late click
      expect(appInstance!.store.state.lastClickedCoords).toEqual([12.4924, 41.8902]);

      // 2. Zero state changes occurred on the root store after retirement
      expect(stateChangesAfterRetirement).toBe(0);
    });
  });

  // ==========================================================================
  // Proof 4: Same-ID Replacement
  // ==========================================================================
  describe('Proof 4: Same-ID replacement captures new view without stale mutation', () => {
    it('captures a new view on same-ID replacement and isolates against stale old callbacks', async () => {
      let adapter1 = new FakeMapAdapter();
      let adapter2 = new FakeMapAdapter();
      let activeAdapter = adapter1;

      let capturedViews: Array<ChildView<MapState, MapAction>> = [];
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: () => activeAdapter,
          onCaptureMap: (view) => {
            capturedViews.push(view);
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      expect(capturedViews.length).toBe(1);
      const view1 = capturedViews[0]!;
      expect(view1.state).toBeDefined();
      expect(adapter1.initialized).toBe(true);

      // Save a copy of adapter1's handlers
      const oldMoveEndHandlers = [...(adapter1.handlers.get('moveend') ?? [])];
      expect(oldMoveEndHandlers.length).toBeGreaterThan(0);

      // Close map
      appInstance!.store.dispatch({ type: 'closeMap' });
      flushSync();
      await settle();

      expect(view1.state).toBeUndefined();
      expect(adapter1.callsTo('destroy').length).toBe(1);

      // Switch to adapter2 and reopen under same slot ID 'map'
      activeAdapter = adapter2;
      appInstance!.store.dispatch({ type: 'openMap' });
      flushSync();
      await settle();

      expect(capturedViews.length).toBe(2);
      const view2 = capturedViews[1]!;
      expect(view2).not.toBe(view1);
      expect(view2.state).toBeDefined();
      expect(adapter2.initialized).toBe(true);
      expect(adapter2.callsTo('destroy').length).toBe(0);

      // Fire old adapter's handlers: must not affect view2
      for (const h of oldMoveEndHandlers) h();

      // Dispatch into replacement view
      view2.dispatch({ type: 'setZoom', zoom: 3 });
      flushSync();
      await settle();

      expect(view2.state?.viewport.zoom).toBe(3);
      expect(adapter2.getZoom()).toBe(3);
      expect(adapter1.getZoom()).toBe(10);
    });
  });

  // ==========================================================================
  // Proof 5: Two Siblings State & Resource Isolation
  // ==========================================================================
  describe('Proof 5: Two siblings state and resource isolation', () => {
    it('isolates state and resources across two sibling maps and cleans up only the retired sibling', async () => {
      const mapAdapter = new FakeMapAdapter();
      const sidebarAdapter = new FakeMapAdapter();

      let capturedMapView: ChildView<MapState, MapAction> | null = null;
      let capturedSidebarView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: mapAdapter,
          sidebarAdapter: sidebarAdapter,
          onCaptureMap: (view) => {
            capturedMapView = view;
          },
          onCaptureSidebar: (view) => {
            capturedSidebarView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // Initially only map is open; now open both maps
      appInstance!.store.dispatch({ type: 'openBothMaps' });
      flushSync();
      await settle();

      expect(capturedMapView).not.toBeNull();
      expect(capturedSidebarView).not.toBeNull();
      expect(mapAdapter.initialized).toBe(true);
      expect(sidebarAdapter.initialized).toBe(true);

      const mapView = capturedMapView!;
      const sidebarView = capturedSidebarView!;

      // Verify independent viewport state
      expect(mapView.state?.viewport.center).toEqual([10, 20]);
      expect(sidebarView.state?.viewport.center).toEqual([30, 40]);

      // Dispatch zoom to sidebar only
      sidebarView.dispatch({ type: 'setZoom', zoom: 8 });
      flushSync();
      await settle();

      expect(sidebarView.state?.viewport.zoom).toBe(8);
      expect(sidebarAdapter.getZoom()).toBe(8);
      expect(mapView.state?.viewport.zoom).toBe(4);
      expect(mapAdapter.getZoom()).toBe(4);

      // Close only Map A
      appInstance!.store.dispatch({ type: 'closeMapA' });
      flushSync();
      await settle();

      // mapAdapter destroyed promptly
      expect(mapAdapter.callsTo('destroy').length).toBe(1);
      expect(mapView.state).toBeUndefined();

      // sidebarAdapter MUST REMAIN ACTIVE
      expect(sidebarAdapter.callsTo('destroy').length).toBe(0);
      expect(sidebarView.state).toBeDefined();

      // sidebar continues dispatching without interference
      sidebarView.dispatch({ type: 'setZoom', zoom: 12 });
      flushSync();
      await settle();

      expect(sidebarView.state?.viewport.zoom).toBe(12);
      expect(sidebarAdapter.getZoom()).toBe(12);
    });
  });

  // ==========================================================================
  // Proof 6: Delayed style load under removal, replacement, and continuation in actual managed app
  // ==========================================================================
  describe('Proof 6: Delayed style load under removal, replacement, and continuation in actual managed app', () => {
    it('Scenario 6A: Removal during style load destroys adapter and ignores late style.load', async () => {
      const adapter1 = new DelayedStyleAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: adapter1,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      expect(capturedView).not.toBeNull();
      const view = capturedView!;

      // Change style through managed ChildView projection
      view.dispatch({ type: 'changeStyle', style: 'custom://delayed' });
      flushSync();
      await settle();

      expect(adapter1.pendingStyleLoad).toBe(true);

      // Snapshot style.load handlers before owner retirement
      const styleLoadHandlers = [...(adapter1.handlers.get('style.load') ?? [])];
      expect(styleLoadHandlers.length).toBeGreaterThan(0);

      // Retire the owner via application action
      appInstance!.store.dispatch({ type: 'closeMap' });
      flushSync();
      await settle();

      expect(view.state).toBeUndefined();
      expect(adapter1.callsTo('destroy').length).toBe(1);

      // Late style.load invocation on destroyed adapter: it must NOT throw and must not resurrect state
      for (const h of styleLoadHandlers) {
        expect(() => h()).not.toThrow();
      }
      expect(view.state).toBeUndefined();
    });

    it('Scenario 6B: Replacement during style load destroys old adapter without mutating replacement', async () => {
      const adapter1 = new DelayedStyleAdapter();
      const adapter2 = new DelayedStyleAdapter();
      let activeAdapter = adapter1;

      let capturedViews: Array<ChildView<MapState, MapAction>> = [];
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: () => activeAdapter,
          onCaptureMap: (view) => {
            capturedViews.push(view);
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      expect(capturedViews.length).toBe(1);
      const view1 = capturedViews[0]!;

      // Start style change on map 1
      view1.dispatch({ type: 'changeStyle', style: 'style://delayed-1' });
      flushSync();
      await settle();

      expect(adapter1.pendingStyleLoad).toBe(true);

      // Snapshot adapter1's handlers before replacement
      const oldStyleLoadHandlers = [...(adapter1.handlers.get('style.load') ?? [])];
      expect(oldStyleLoadHandlers.length).toBeGreaterThan(0);

      // Replace map under same slot ID
      activeAdapter = adapter2;
      appInstance!.store.dispatch({ type: 'replaceMap' });
      flushSync();
      await settle();

      expect(adapter1.callsTo('destroy').length).toBe(1);
      expect(capturedViews.length).toBe(2);
      const view2 = capturedViews[1]!;
      expect(view2).not.toBe(view1);

      // Invoke late style.load from old adapter: must NOT mutate replacement
      for (const h of oldStyleLoadHandlers) {
        expect(() => h()).not.toThrow();
      }

      // Complete replacement map's style load and verify active operation
      adapter2.flushStyleLoad();
      flushSync();
      await settle();

      view2.dispatch({ type: 'setZoom', zoom: 15 });
      flushSync();
      await settle();

      expect(adapter2.getZoom()).toBe(15);
      expect(appInstance!.store.state.map?.viewport.zoom).toBe(15);
      expect(adapter1.getZoom()).toBe(10);
    });

    it('Scenario 6C: Sibling continuation during style load', async () => {
      const adapter1 = new DelayedStyleAdapter();
      const adapter2 = new DelayedStyleAdapter();

      let capturedMapView: ChildView<MapState, MapAction> | null = null;
      let capturedSidebarView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: adapter1,
          sidebarAdapter: adapter2,
          onCaptureMap: (view) => {
            capturedMapView = view;
          },
          onCaptureSidebar: (view) => {
            capturedSidebarView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // Open both sibling maps
      appInstance!.store.dispatch({ type: 'openBothMaps' });
      flushSync();
      await settle();

      const mapView = capturedMapView!;
      const sidebarView = capturedSidebarView!;

      // Both start style loading
      mapView.dispatch({ type: 'changeStyle', style: 'style://delayed-1' });
      sidebarView.dispatch({ type: 'changeStyle', style: 'style://delayed-2' });
      flushSync();
      await settle();

      expect(adapter1.pendingStyleLoad).toBe(true);
      expect(adapter2.pendingStyleLoad).toBe(true);

      // Snapshot adapter1 style load handlers before removal
      const styleLoadHandlers1 = [...(adapter1.handlers.get('style.load') ?? [])];
      expect(styleLoadHandlers1.length).toBeGreaterThan(0);

      // Sibling 1 is closed
      appInstance!.store.dispatch({ type: 'closeMapA' });
      flushSync();
      await settle();

      expect(adapter1.callsTo('destroy').length).toBe(1);
      expect(adapter2.callsTo('destroy').length).toBe(0);

      // Late invoke adapter1 style.load handlers: must NOT throw or interfere with Sibling 2
      for (const h of styleLoadHandlers1) {
        expect(() => h()).not.toThrow();
      }

      // Sibling 2 finishes style load and continues normal dispatching
      adapter2.flushStyleLoad();
      flushSync();
      await settle();

      sidebarView.dispatch({ type: 'setZoom', zoom: 12 });
      flushSync();
      await settle();

      expect(adapter2.getZoom()).toBe(12);
      expect(appInstance!.store.state.sidebarMap?.viewport.zoom).toBe(12);
    });
  });

  // ==========================================================================
  // Proof 7: Regressions for 0 listeners after retirement and unmount
  // ==========================================================================
  describe('Proof 7: Regressions for 0 listeners after retirement and unmount', () => {
    it('detaches all listeners leaving exactly 0 listeners in component ownership mode', async () => {
      const adapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // Initially active with all 8 listeners attached
      expect(adapter.totalListenerCount).toBe(8);

      // Retire the owner
      appInstance!.store.dispatch({ type: 'closeMap' });
      flushSync();
      await settle();

      // After retirement: 0 listeners must remain and adapter destroyed
      expect(adapter.totalListenerCount).toBe(0);
      expect(adapter.callsTo('destroy').length).toBe(1);

      // Unmount application: 0 listeners remain
      unmount(app);
      app = null;
      expect(adapter.totalListenerCount).toBe(0);
      expect(adapter.callsTo('destroy').length).toBe(1);
    });

  });

  // ==========================================================================
  // Proof 8: Capture-then-retire-then-mount view gives 0 initialize calls
  // ==========================================================================
  describe('Proof 8: Capture-then-retire-then-mount gives 0 initialize calls', () => {
    it('does not initialize adapter when mounted with an already-retired ChildView', async () => {
      const initialAdapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: initialAdapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      flushSync();
      await settle();

      expect(capturedView).not.toBeNull();
      const view = capturedView!;

      // Retire the owner
      appInstance!.store.dispatch({ type: 'closeMap' });
      flushSync();
      await settle();

      expect(view.state).toBeUndefined();

      unmount(app);
      app = null;
      target.remove();

      // Now mount a fresh MapPrimitive using the already-retired view
      const freshAdapter = new FakeMapAdapter();
      const newTarget = document.createElement('div');
      document.body.appendChild(newTarget);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      cleanupFns.push(() => errorSpy.mockRestore());

      let comp: ReturnType<typeof mount> | null = mount(MapPrimitive, {
        target: newTarget,
        props: {
          store: view,
          adapter: freshAdapter
        }
      });

      cleanupFns.push(() => {
        if (comp) {
          unmount(comp);
          comp = null;
        }
        newTarget.remove();
      });

      flushSync();
      await settle();

      // Guard at mount prevents initialization of already-retired view
      expect(freshAdapter.callsTo('initialize').length).toBe(0);
      expect(freshAdapter.initialized).toBe(false);
      expect(freshAdapter.callsTo('destroy').length).toBe(0);
      expect(freshAdapter.callsTo('on').length).toBe(0);
      expect(freshAdapter.totalListenerCount).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Proof 9: Reentrant retirement during moveend gives single destroy and no throw
  // ==========================================================================
  describe('Proof 9: Reentrant retirement during moveend', () => {
    it('executes single prompt destroy without throw when owner retires reentrantly during moveend', async () => {
      const adapter = new FakeMapAdapter();
      let capturedView: ChildView<MapState, MapAction> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter,
          onCaptureMap: (view) => {
            capturedView = view;
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      // Subscribe to store state and trigger reentrant closeMap when viewport changes
      let moveEndTriggered = false;
      const unsub = appInstance!.store.subscribe((state) => {
        if (moveEndTriggered && state.map && state.map.viewport.center[0] === 45) {
          appInstance!.store.dispatch({ type: 'closeMap' });
        }
      });
      cleanupFns.push(unsub);

      // Change center on adapter and emit native moveend
      adapter.setCenter([45, 45]);
      moveEndTriggered = true;

      // Emit native moveend: triggers MapPrimitive -> viewportChanged -> subscriber closeMap
      expect(() => adapter.emit('moveend')).not.toThrow();
      flushSync();
      await settle();

      // Exactly 1 destroy call, 0 listeners remaining
      expect(adapter.callsTo('destroy').length).toBe(1);
      expect(adapter.totalListenerCount).toBe(0);

      // Unmounting app is idempotent
      unmount(app);
      app = null;
      expect(adapter.callsTo('destroy').length).toBe(1);
    });
  });

  // ==========================================================================
  // Proof 10: Stale flightId moveend after same-ID replacement
  // ==========================================================================
  describe('Proof 10: Stale flightId moveend after same-ID replacement cannot mutate new view/root', () => {
    it('isolates new view against late moveend carrying stale flightId from old flight', async () => {
      const adapter1 = new FakeMapAdapter();
      const adapter2 = new FakeMapAdapter();
      let activeAdapter = adapter1;

      let capturedViews: Array<ChildView<MapState, MapAction>> = [];
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;

      const target = document.createElement('div');
      document.body.appendChild(target);

      let app: ReturnType<typeof mount> | null = mount(ManagedMapRecipeApp, {
        target,
        props: {
          adapter: () => activeAdapter,
          onCaptureMap: (view) => {
            capturedViews.push(view);
          },
          onApp: (inst) => {
            appInstance = inst;
          }
        }
      });

      cleanupFns.push(() => {
        if (app) {
          unmount(app);
          app = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      const view1 = capturedViews[0]!;

      // Start flight on adapter 1
      view1.dispatch({ type: 'flyTo', center: [10, 10], zoom: 6 });
      flushSync();
      await settle();

      const flightId1 = adapter1.currentFlightId;
      expect(flightId1).toBeGreaterThan(0);

      // Retain moveend handlers before replacement
      const moveEndHandlers1 = [...(adapter1.handlers.get('moveend') ?? [])];
      expect(moveEndHandlers1.length).toBeGreaterThan(0);

      // Replace map under same slot ID (replaceMap sets zoom: 10, center: [50, 50])
      activeAdapter = adapter2;
      appInstance!.store.dispatch({ type: 'replaceMap' });
      flushSync();
      await settle();

      expect(capturedViews.length).toBe(2);
      const view2 = capturedViews[1]!;
      expect(appInstance!.store.state.map?.viewport.zoom).toBe(10);

      // Simulate stale moveend with old flightId on adapter1's retained handlers
      for (const h of moveEndHandlers1) {
        expect(() => h({ flightId: flightId1 })).not.toThrow();
      }
      flushSync();
      await settle();

      // Verify that replacement view and root store state were NOT mutated
      expect(appInstance!.store.state.map?.viewport.zoom).toBe(10);
      expect(view2.state?.viewport.zoom).toBe(10);
    });
  });

  // ==========================================================================
  // Proof 11: Preserved standalone Store API
  // ==========================================================================
  describe('Proof 11: Preserved standalone Store API', () => {
    it('operates identically with standalone Store<MapState, MapAction>', async () => {
      const store = createStore({
        initialState: createInitialMapState({ center: [10, 20], zoom: 5 }),
        reducer: mapReducer,
        dependencies: {}
      });
      const adapter = new FakeMapAdapter();
      const target = document.createElement('div');
      document.body.appendChild(target);

      let clickReceived: [number, number] | null = null;
      let comp: ReturnType<typeof mount> | null = mount(Map, {
        target,
        props: {
          store,
          adapter,
          onMapClick: (c) => {
            clickReceived = c;
          }
        }
      });
      cleanupFns.push(() => {
        if (comp) {
          unmount(comp);
          comp = null;
        }
        target.remove();
      });

      flushSync();
      await settle();

      expect(adapter.initialized).toBe(true);
      expect(adapter.getCenter()).toEqual([10, 20]);
      expect(adapter.getZoom()).toBe(5);

      // Verify aria-label rendered
      const container = target.querySelector('.map-container');
      expect(container?.getAttribute('aria-label')).toBe('Interactive map with 0 markers');

      // Click forwarding
      adapter.emit('click', { lngLat: [10.5, 20.5] });
      expect(clickReceived).toEqual([10.5, 20.5]);
    });
  });
});
