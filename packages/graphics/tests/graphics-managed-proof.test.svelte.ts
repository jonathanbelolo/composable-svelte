/**
 * @file graphics-managed-proof.test.svelte.ts
 * Batch D3 Graphics Managed Proof Tests for Maps/Graphics/Charts lane.
 *
 * Verifies:
 * 1. Production-captured ChildView from actual defineViews/FeatureViews/FeatureOutlet
 *    drives Scene, Camera, Mesh, Light via narrow structural GraphicsStore with zero
 *    per-widget root stores and zero fabricated authority.
 * 2. Strict ComponentProps typing check against actual public component props.
 * 3. Terminal notification timing and prompt native adapter disposal on owner retirement
 *    (BEFORE DOM unmount) with exact disposal count = 1.
 * 4. Idempotent cleanup: subsequent DOM unmount does not dispose adapter a second time.
 * 5. Typed action delivery: rendererInitialized updates parent state via child action.
 * 6. Same-ID replacement: captures new view, disposes old adapter, initializes replacement adapter.
 * 7. Two siblings isolation: two managed scenes mount simultaneously under a single root store;
 *    retiring one releases only its adapter while the other continues unaffected.
 * 8. Retired-at-mount view gives 0 initialize and 0 dispose calls.
 * 9. Late async initialization completion after retirement: cancels delivery, disposes late engine,
 *    and suppresses rendererInitialized dispatch.
 * 10. WebGLOverlay owner-bound managed attachment seam: immediate stop/destroy on retirement
 *     before DOM unmount, idempotent cleanup, no callback leaks.
 * 11. Preserved standalone Store API with createStore.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, type ComponentProps } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';
import type { ChildView, ApplicationInstance } from '@composable-svelte/core/application';

import Scene from '../src/components/Scene.svelte';
import Camera from '../src/components/Camera.svelte';
import Light from '../src/components/Light.svelte';
import Mesh from '../src/components/Mesh.svelte';
import WebGLOverlay from '../src/lib/overlay/WebGLOverlay.svelte';
import { attachOverlayToOwner } from '../src/lib/overlay/webgl-overlay.js';
import { graphicsReducer } from '../src/core/reducer.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import type {
  GraphicsState,
  GraphicsAction,
  GraphicsStore
} from '../src/core/types.js';

import { FakeSceneAdapter } from './helpers/fake-scene-adapter.js';
import { createFakeGL, installFakeGL, installFakeObservers } from './helpers/fake-gl.js';
import ManagedGraphicsRecipeApp from './fixtures/ManagedGraphicsRecipeApp.svelte';
import type { AppState, AppAction } from './fixtures/managed-graphics-recipe-model.js';

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

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
  vi.restoreAllMocks();
});

describe('Batch D3 Graphics Managed Proof', () => {
  // ==========================================================================
  // Proof 1: Production ChildView drives declarative graphics components & ComponentProps
  // ==========================================================================
  it('binds declarative graphics components to one genuine managed view', async () => {
    const adapter = new FakeSceneAdapter();
    let view: ChildView<GraphicsState, GraphicsAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter,
        showDeclarativeChildren: true,
        showOverlay: true,
        onCaptureScene: (v) => {
          view = v;
        },
        onApp: (a) => {
          app = a;
        }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();

    expect(view).toBeDefined();

    // Verify ComponentProps typing
    const _sceneStore: ComponentProps<typeof Scene>['store'] = view!;
    const _cameraStore: ComponentProps<typeof Camera>['store'] = view!;
    const _lightStore: ComponentProps<typeof Light>['store'] = view!;
    const _meshStore: ComponentProps<typeof Mesh>['store'] = view!;
    const _overlayOwner: ComponentProps<typeof WebGLOverlay>['owner'] = view!;
    expect([_sceneStore, _cameraStore, _lightStore, _meshStore, _overlayOwner]).toEqual([
      view,
      view,
      view,
      view,
      view
    ]);

    // Adapter initialized and synced children
    expect(adapter.callsTo('initialize')).toHaveLength(1);
    expect(adapter.camera).not.toBeNull();
    expect(adapter.lights.has('key-light')).toBe(true);
    expect(adapter.meshes.has('cube-1')).toBe(true);

    // Parent reducer received rendererInitialized lifted child action
    expect(app!.store.state.lastInitializedRenderer).toBe('webgl');

    // Prompt retirement before DOM unmount
    app!.store.dispatch({ type: 'closeScene' });

    // View state is synchronously undefined upon retirement
    expect(view!.state).toBeUndefined();

    // Adapter disposed immediately before DOM unmount
    expect(adapter.callsTo('dispose')).toHaveLength(1);

    // Idempotent: flush and DOM unmount do not dispose again
    flushSync();
    expect(adapter.callsTo('dispose')).toHaveLength(1);
  });

  // ==========================================================================
  // Proof 2: Prompt native adapter destruction on owner retirement (BEFORE DOM unmount)
  // ==========================================================================
  it('destroys adapter promptly on retirement before DOM unmount with exact count = 1', async () => {
    const adapter = new FakeSceneAdapter();
    let view: ChildView<GraphicsState, GraphicsAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter,
        onCaptureScene: (v) => {
          view = v;
        },
        onApp: (a) => {
          app = a;
        }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();

    expect(adapter.callsTo('initialize')).toHaveLength(1);
    expect(adapter.callsTo('dispose')).toHaveLength(0);

    // Host DOM is still in document
    const hostEl = target.querySelector('[data-testid="managed-graphics-feature"]');
    expect(hostEl).not.toBeNull();

    // Retire owner
    app!.store.dispatch({ type: 'closeScene' });

    // Synchronously disposed before DOM unmount
    expect(view!.state).toBeUndefined();
    expect(adapter.callsTo('dispose')).toHaveLength(1);

    // Host DOM node is still attached (simulating exit animation / delayed teardown)
    expect(document.body.contains(target)).toBe(true);

    // Unmount DOM: dispose is not called a second time
    const unmountFn = cleanupFns.pop();
    unmountFn?.();
    expect(adapter.callsTo('dispose')).toHaveLength(1);
  });

  // ==========================================================================
  // Proof 3: Same-ID replacement
  // ==========================================================================
  it('replaces same-ID feature with fresh adapter, disposing predecessor cleanly', async () => {
    const adapter1 = new FakeSceneAdapter();
    const adapter2 = new FakeSceneAdapter();
    let adapterIndex = 0;
    const adapters = [adapter1, adapter2];

    let view: ChildView<GraphicsState, GraphicsAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter: () => adapters[adapterIndex++],
        onCaptureScene: (v) => {
          view = v;
        },
        onApp: (a) => {
          app = a;
        }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();

    expect(adapter1.callsTo('initialize')).toHaveLength(1);
    expect(adapter1.callsTo('dispose')).toHaveLength(0);
    const view1 = view;

    // Trigger same-ID replacement
    app!.store.dispatch({ type: 'replaceScene' });
    flushSync();
    await settle();

    // Old adapter is disposed
    expect(adapter1.callsTo('dispose')).toHaveLength(1);

    // Replacement adapter is initialized
    expect(adapter2.callsTo('initialize')).toHaveLength(1);
    expect(adapter2.callsTo('dispose')).toHaveLength(0);

    // New view has replaced sceneId
    expect(view).not.toBe(view1);
    expect(view!.state?.sceneId).toBe('main-scene-replaced');
  });

  // ==========================================================================
  // Proof 4: Two sibling scenes with deterministic adapter seam
  // ==========================================================================
  it('mounts two sibling scenes; retiring one disposes only its own adapter', async () => {
    const mainAdapter = new FakeSceneAdapter();
    const sidebarAdapter = new FakeSceneAdapter();

    let mainView: ChildView<GraphicsState, GraphicsAction> | undefined;
    let sidebarView: ChildView<GraphicsState, GraphicsAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter: mainAdapter,
        sidebarAdapter: sidebarAdapter,
        onCaptureScene: (v) => {
          mainView = v;
        },
        onCaptureSidebar: (v) => {
          sidebarView = v;
        },
        onApp: (a) => {
          app = a;
        }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();

    // Open both scenes
    app!.store.dispatch({ type: 'openBothScenes' });
    flushSync();
    await settle();

    expect(mainAdapter.callsTo('initialize')).toHaveLength(1);
    expect(sidebarAdapter.callsTo('initialize')).toHaveLength(1);
    expect(mainAdapter.callsTo('dispose')).toHaveLength(0);
    expect(sidebarAdapter.callsTo('dispose')).toHaveLength(0);

    // Close only Scene A (main)
    app!.store.dispatch({ type: 'closeSceneA' });

    // Scene A is disposed promptly
    expect(mainView!.state).toBeUndefined();
    expect(mainAdapter.callsTo('dispose')).toHaveLength(1);

    // Sibling Scene B remains live and completely unaffected
    expect(sidebarView!.state).toBeDefined();
    expect(sidebarView!.state?.sceneId).toBe('scene-b');
    expect(sidebarAdapter.callsTo('dispose')).toHaveLength(0);

    // Close remaining scene on cleanup
    app!.store.dispatch({ type: 'closeScene' });
    expect(sidebarAdapter.callsTo('dispose')).toHaveLength(0);
  });

  // ==========================================================================
  // Proof 5: Retired-at-mount view results in 0 initialize and 0 dispose calls
  // ==========================================================================
  it('gives 0 initialize and 0 dispose calls when mounted with an already-retired view', async () => {
    const adapter = new FakeSceneAdapter();
    const target = document.createElement('div');
    document.body.appendChild(target);

    // A retired ChildView projection with undefined state
    const retiredStore: GraphicsStore = {
      state: undefined,
      dispatch: vi.fn(),
      subscribe: (listener) => {
        listener(undefined);
        return () => {};
      }
    };

    const component = mount(Scene, {
      target,
      props: {
        store: retiredStore,
        createAdapter: () => adapter
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();

    expect(adapter.callsTo('initialize')).toHaveLength(0);
    expect(adapter.callsTo('dispose')).toHaveLength(0);
    expect(retiredStore.dispatch).not.toHaveBeenCalled();

    const unmountFn = cleanupFns.pop();
    unmountFn?.();
    expect(adapter.callsTo('dispose')).toHaveLength(0);
  });

  // ==========================================================================
  // Proof 6: Late async initialization completion after retirement
  // ==========================================================================
  it('cancels delivery and disposes late engine when retirement occurs during async initialize', async () => {
    const adapter = new FakeSceneAdapter();
    adapter.initDelayMs = 50; // async delay in initialize

    let view: ChildView<GraphicsState, GraphicsAction> | undefined;
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter,
        onCaptureScene: (v) => {
          view = v;
        },
        onApp: (a) => {
          app = a;
        }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();

    // Retire owner while initialize is in flight
    app!.store.dispatch({ type: 'closeScene' });
    expect(view!.state).toBeUndefined();
    // A custom adapter may create native resources after its await. Disposing
    // before that settles would leak the resources created later.
    expect(adapter.callsTo('dispose')).toHaveLength(0);

    // Await initialize settling
    await settle(80);

    // Adapter is disposed, not left running
    expect(adapter.callsTo('dispose')).toHaveLength(1);

    // RendererInitialized was not delivered to parent
    expect(app!.store.state.lastInitializedRenderer).toBeNull();
  });

  // ==========================================================================
  // Proof 7: WebGLOverlay owner-bound managed attachment seam
  // ==========================================================================
  it('stops and destroys WebGLOverlay promptly on owner retirement without leaking callbacks', async () => {
    let retired = false;
    const listeners = new Set<(state: unknown) => void>();
    const owner = {
      get state() {
        return retired ? undefined : { id: 'owner-1' };
      },
      subscribe: (listener: (state: unknown) => void) => {
        listeners.add(listener);
        listener(retired ? undefined : { id: 'owner-1' });
        return () => listeners.delete(listener);
      }
    };

    const stopSpy = vi.fn();
    const destroySpy = vi.fn();
    const mockOverlay = {
      start: vi.fn(),
      stop: stopSpy,
      destroy: destroySpy
    } as any;

    const detach = attachOverlayToOwner(mockOverlay, owner);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(destroySpy).not.toHaveBeenCalled();

    // Trigger retirement
    retired = true;
    for (const listener of Array.from(listeners)) {
      listener(undefined);
    }

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Detach is idempotent
    detach();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a falsy owner value live and handles synchronous terminal subscribe', () => {
    const stop = vi.fn();
    const destroy = vi.fn();
    const overlay = { stop, destroy } as unknown as Parameters<typeof attachOverlayToOwner>[0];
    const live = { state: 0, subscribe: (listener: (state: unknown) => void) => { listener(0); return () => {}; } };
    const detach = attachOverlayToOwner(overlay, live);
    expect(stop).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    detach();

    const unsubscribe = vi.fn();
    const terminal = {
      state: 0,
      subscribe: (listener: (state: unknown) => void) => {
        listener(undefined);
        return unsubscribe;
      }
    };
    expect(() => attachOverlayToOwner(overlay, terminal)).not.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not create WebGL resources for an owner retired before overlay mount', () => {
    const fake = createFakeGL();
    const restoreGL = installFakeGL(fake);
    const restoreObservers = installFakeObservers();
    cleanupFns.push(() => { restoreObservers(); restoreGL(); });
    const owner = {
      state: undefined,
      subscribe: vi.fn(() => vi.fn())
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(WebGLOverlay, { target, props: { owner } });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    expect(fake.created('program')).toBe(0);
    expect(owner.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes when overlay owner retires synchronously during subscribe', () => {
    const fake = createFakeGL();
    const restoreGL = installFakeGL(fake);
    const restoreObservers = installFakeObservers();
    cleanupFns.push(() => { restoreObservers(); restoreGL(); });
    const unsubscribe = vi.fn();
    const owner = {
      state: 0,
      subscribe: (listener: (state: unknown) => void) => {
        listener(undefined);
        return unsubscribe;
      }
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(WebGLOverlay, { target, props: { owner } });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.live('program')).toBe(0);
  });

  it('WebGLOverlay component stops and destroys on owner retirement before DOM unmount', async () => {
    const fake = createFakeGL();
    const restoreGL = installFakeGL(fake);
    const restoreObservers = installFakeObservers();
    cleanupFns.push(() => { restoreObservers(); restoreGL(); });
    let retired = false;
    const listeners = new Set<(state: unknown) => void>();
    const owner = {
      get state() {
        return retired ? undefined : 0;
      },
      subscribe: (listener: (state: unknown) => void) => {
        listeners.add(listener);
        listener(retired ? undefined : 0);
        return () => listeners.delete(listener);
      }
    };

    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(WebGLOverlay, {
      target,
      props: {
        owner,
        options: { targetFPS: 30 }
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();
    for (const listener of Array.from(listeners)) listener(0);
    const source = document.createElement('canvas');
    source.width = 64;
    source.height = 64;
    target.append(source);
    const registration = component.registerElement({ id: 'before-retirement', domElement: source, shader: 'wave-gentle-horizontal' });
    expect(registration).not.toBeInstanceOf(Error);
    await settle();
    expect(fake.created('program')).toBeGreaterThan(0);
    expect(fake.live('program')).toBeGreaterThan(0);

    // Owner retires before DOM unmount
    retired = true;
    for (const listener of Array.from(listeners)) {
      listener(undefined);
    }
    expect(fake.live('program')).toBe(0);
    expect(fake.calls.filter(call => call.startsWith('delete')).length).toBeGreaterThan(0);

    // Call public method after retirement - should safely return error without leaking callbacks
    const div = document.createElement('div');
    const result = component.registerElement({
      id: 'test-el',
      domElement: div,
      shader: 'hue-shift'
    });
    expect(result).toBeInstanceOf(Error);

    // DOM unmount after retirement does not throw
    const unmountFn1 = cleanupFns.pop();
    unmountFn1?.();
  });

  it('releases a genuine managed overlay before its host unmounts', async () => {
    const fake = createFakeGL();
    const restoreGL = installFakeGL(fake);
    const restoreObservers = installFakeObservers();
    cleanupFns.push(() => { restoreObservers(); restoreGL(); });
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    let app: ApplicationInstance<AppState, AppAction> | undefined;
    let view: ChildView<GraphicsState, GraphicsAction> | undefined;
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ManagedGraphicsRecipeApp, {
      target,
      props: {
        adapter: new FakeSceneAdapter(),
        showOverlay: true,
        onCaptureScene: value => { view = value; },
        onApp: value => { app = value; }
      }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    await settle(60);
    expect(target.querySelector('[data-testid="managed-graphics-feature"]')).not.toBeNull();
    const deletedBefore = fake.calls.filter(call => call.startsWith('delete')).length;
    app!.store.dispatch({ type: 'closeScene' });
    expect(view!.state).toBeUndefined();
    expect(target.querySelector('[data-testid="managed-graphics-feature"]')).not.toBeNull();
    expect(fake.calls.filter(call => call.startsWith('delete')).length).toBeGreaterThan(deletedBefore);
    const framesAfterRetirement = raf.mock.calls.length;
    await settle(80);
    expect(raf.mock.calls.length).toBe(framesAfterRetirement);
  });

  // ==========================================================================
  // Proof 8: Standalone Store API compatibility
  // ==========================================================================
  it('preserves standalone Store compatibility with createStore', async () => {
    const adapter = new FakeSceneAdapter();
    const store: Store<GraphicsState, GraphicsAction> = createStore({
      initialState: createInitialGraphicsState({ sceneId: 'standalone-scene' }),
      reducer: graphicsReducer,
      dependencies: {}
    });

    const target = document.createElement('div');
    document.body.appendChild(target);

    const component = mount(Scene, {
      target,
      props: {
        store,
        createAdapter: () => adapter
      }
    });
    cleanupFns.push(() => {
      unmount(component);
      target.remove();
    });
    flushSync();
    await settle();

    expect(adapter.callsTo('initialize')).toHaveLength(1);
    expect(store.state.renderer.isInitialized).toBe(true);

    // Unmount disposes once
    const unmountFn2 = cleanupFns.pop();
    unmountFn2?.();
    expect(adapter.callsTo('dispose')).toHaveLength(1);
  });

  it('disposes once and stops syncing after the first renderer sync throws', async () => {
    class ThrowingAdapter extends FakeSceneAdapter {
      override setBackgroundColor(color: string): void {
        super.setBackgroundColor(color);
        throw new Error('sync failed');
      }
    }
    const adapter = new ThrowingAdapter();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore({
      initialState: createInitialGraphicsState({ sceneId: 'failure-scene' }),
      reducer: graphicsReducer,
      dependencies: {}
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(Scene, { target, props: { store, createAdapter: () => adapter } });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    await settle();
    expect(adapter.callsTo('dispose')).toHaveLength(1);
    const syncCalls = adapter.callsTo('setBackgroundColor').length;
    store.dispatch({ type: 'setBackgroundColor', color: '#123456' });
    expect(adapter.callsTo('setBackgroundColor')).toHaveLength(syncCalls);
    const unmountFn = cleanupFns.pop();
    unmountFn?.();
    expect(adapter.callsTo('dispose')).toHaveLength(1);
    expect(errors).toHaveBeenCalled();
  });
});
