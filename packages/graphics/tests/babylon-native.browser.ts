import { expect, it } from 'vitest';
import { EngineStore } from '@babylonjs/core/Engines/engineStore.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { mount, unmount, flushSync } from 'svelte';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';
import ManagedGraphicsRecipeApp from './fixtures/ManagedGraphicsRecipeApp.svelte';
import type { ApplicationInstance, ChildView } from '@composable-svelte/core/application';
import type { AppState, AppAction } from './fixtures/managed-graphics-recipe-model.js';
import type { GraphicsState, GraphicsAction } from '../src/core/types.js';

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

function canvas(): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = 320;
  element.height = 240;
  document.body.append(element);
  return element;
}

it('disposes one real Babylon WebGL engine while its sibling remains live', async () => {
  const firstCanvas = canvas();
  const siblingCanvas = canvas();
  const first = new BabylonAdapter();
  const sibling = new BabylonAdapter();

  try {
    const firstResult = await first.initialize(firstCanvas);
    const firstEngine = EngineStore.LastCreatedEngine;
    const siblingResult = await sibling.initialize(siblingCanvas);
    const siblingEngine = EngineStore.LastCreatedEngine;

    expect(firstResult.renderer).toBe('webgl');
    expect(siblingResult.renderer).toBe('webgl');
    expect(firstResult.capabilities.supportsWebGL).toBe(true);
    expect(siblingResult.capabilities.supportsWebGL).toBe(true);
    expect(firstEngine).not.toBeNull();
    expect(siblingEngine).not.toBeNull();
    expect(firstEngine).not.toBe(siblingEngine);
    expect(EngineStore.Instances).toContain(firstEngine);
    expect(EngineStore.Instances).toContain(siblingEngine);
    expect(firstCanvas.getContext('webgl2') ?? firstCanvas.getContext('webgl')).not.toBeNull();

    first.dispose();
    expect(EngineStore.Instances).not.toContain(firstEngine);
    expect(EngineStore.Instances).toContain(siblingEngine);
  } finally {
    first.dispose();
    sibling.dispose();
    firstCanvas.remove();
    siblingCanvas.remove();
  }
});

it('proves sibling RAF render loop continuation after first engine is disposed', async () => {
  const firstCanvas = canvas();
  const siblingCanvas = canvas();
  const first = new BabylonAdapter();
  const sibling = new BabylonAdapter();

  try {
    await first.initialize(firstCanvas);
    const firstEngine = EngineStore.LastCreatedEngine!;
    await sibling.initialize(siblingCanvas);
    const siblingEngine = EngineStore.LastCreatedEngine!;

    let firstFrames = 0;
    let siblingFrames = 0;

    firstEngine.onEndFrameObservable.add(() => {
      firstFrames++;
    });
    siblingEngine.onEndFrameObservable.add(() => {
      siblingFrames++;
    });

    // Let both render loops run for multiple RAF cycles
    await settle(60);

    expect(firstFrames).toBeGreaterThan(0);
    expect(siblingFrames).toBeGreaterThan(0);

    // Dispose first engine
    first.dispose();
    expect(firstEngine.isDisposed).toBe(true);
    expect(EngineStore.Instances).not.toContain(firstEngine);

    const firstFramesAtDisposal = firstFrames;
    const siblingFramesAtDisposal = siblingFrames;

    // Sibling continues rendering
    await settle(60);

    expect(firstFrames).toBe(firstFramesAtDisposal);
    expect(siblingFrames).toBeGreaterThan(siblingFramesAtDisposal);
    expect(siblingEngine.isDisposed).toBe(false);
    expect(EngineStore.Instances).toContain(siblingEngine);
  } finally {
    first.dispose();
    sibling.dispose();
    firstCanvas.remove();
    siblingCanvas.remove();
  }
});

it('handles WebGL context loss and restore without crashing or leaking', async () => {
  const c = canvas();
  const adapter = new BabylonAdapter();

  try {
    await adapter.initialize(c);
    const engine = EngineStore.LastCreatedEngine!;
    const scene = Reflect.get(adapter, 'scene') as { getFrameId(): number };
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    expect(ext).not.toBeNull();
    if (!ext) throw new Error('WEBGL_lose_context is required for this browser proof');
    ext.loseContext();
    await settle(30);
    const framesAtRestore = scene.getFrameId();
    ext.restoreContext();
    await settle(80);
    expect(scene.getFrameId()).toBeGreaterThan(framesAtRestore);

    adapter.dispose();
    expect(engine.isDisposed).toBe(true);
  } finally {
    adapter.dispose();
    c.remove();
  }
});

it('retires engine while async texture creation is in flight without throwing or resurrecting', async () => {
  const c = canvas();
  const adapter = new BabylonAdapter();

  try {
    await adapter.initialize(c);
    const engine = EngineStore.LastCreatedEngine!;
    const scene = (adapter as any).scene;
    expect(scene).toBeDefined();

    // 1x1 transparent PNG data URI
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    let loadFired = false;
    let errorFired = false;

    // Start async texture load
    const texture = new Texture(
      dataUri,
      scene,
      false,
      true,
      Texture.BILINEAR_SAMPLINGMODE,
      () => {
        loadFired = true;
      },
      () => {
        errorFired = true;
      }
    );

    // Dispose adapter immediately while texture is in flight
    adapter.dispose();
    expect(engine.isDisposed).toBe(true);

    // Await late texture settlement
    await settle(50);

    // Engine remains disposed and did not resurrect
    expect(engine.isDisposed).toBe(true);
    expect(EngineStore.Instances).not.toContain(engine);
  } finally {
    adapter.dispose();
    c.remove();
  }
});

it('mounts real managed Scene components in browser; owner retirement disposes real WebGL engine while sibling continues', async () => {
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  let mainView: ChildView<GraphicsState, GraphicsAction> | undefined;
  let sidebarView: ChildView<GraphicsState, GraphicsAction> | undefined;

  const target = document.createElement('div');
  document.body.appendChild(target);

  // Each scene constructs its own real BabylonAdapter
  const component = mount(ManagedGraphicsRecipeApp, {
    target,
    props: {
      adapter: () => new BabylonAdapter(),
      sidebarAdapter: () => new BabylonAdapter(),
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

  try {
    flushSync();
    // Open both managed scenes
    app!.store.dispatch({ type: 'openBothScenes' });
    flushSync();
    await settle(80);

    expect(EngineStore.Instances.length).toBeGreaterThanOrEqual(2);
    const engines = [...EngineStore.Instances];
    const engineA = engines[engines.length - 2];
    const engineB = engines[engines.length - 1];

    expect(engineA).toBeDefined();
    expect(engineB).toBeDefined();
    expect(engineA!.isDisposed).toBe(false);
    expect(engineB!.isDisposed).toBe(false);

    // Retire Scene A through parent action
    app!.store.dispatch({ type: 'closeSceneA' });
    flushSync();
    await settle(40);

    expect(mainView!.state).toBeUndefined();
    expect(engineA!.isDisposed).toBe(true);
    expect(EngineStore.Instances).not.toContain(engineA);

    // Sibling Scene B remains live and continues rendering
    expect(sidebarView!.state).toBeDefined();
    expect(engineB!.isDisposed).toBe(false);
    expect(EngineStore.Instances).toContain(engineB);
  } finally {
    unmount(component);
    target.remove();
  }
});

it('releases a real Babylon engine once when its managed view retires before initialize resolves', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  class DelayedBabylonAdapter extends BabylonAdapter {
    disposeCalls = 0;
    override async initialize(element: HTMLCanvasElement) {
      const result = await super.initialize(element);
      await gate;
      return result;
    }
    override dispose() {
      this.disposeCalls++;
      super.dispose();
    }
  }
  const adapter = new DelayedBabylonAdapter();
  const enginesBefore = EngineStore.Instances.length;
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  let view: ChildView<GraphicsState, GraphicsAction> | undefined;
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(ManagedGraphicsRecipeApp, {
    target,
    props: {
      adapter: () => adapter,
      onCaptureScene: value => { view = value; },
      onApp: value => { app = value; }
    }
  });
  try {
    flushSync();
    await settle(20);
    expect(EngineStore.Instances.length).toBe(enginesBefore + 1);
    const engine = EngineStore.LastCreatedEngine!;
    app!.store.dispatch({ type: 'closeScene' });
    expect(view!.state).toBeUndefined();
    release();
    await settle(30);
    expect(adapter.disposeCalls).toBe(1);
    expect(engine.isDisposed).toBe(true);
    expect(EngineStore.Instances).not.toContain(engine);
  } finally {
    release();
    await unmount(component);
    target.remove();
  }
});
