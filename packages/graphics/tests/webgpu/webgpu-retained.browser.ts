/**
 * WebGPU qualification of the first-party graphics surface on a REAL GPU adapter (Metal-3, not a fallback).
 *
 * A `<Scene>` rendering through Babylon's `WebGPUEngine` (`new BabylonAdapter({ renderer: 'webgpu' })`) is
 * represented by `graphicsVisualProvider`; the test plays the visual run's side of core's provider contract
 * (represent → owner retires → retire → frame per animation frame → dispose), as the WebGL retained test does.
 * Progression is judged from mirror PIXELS against a control whose scene has no renderer-driven motion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { Scene as BabylonScene } from '@babylonjs/core/scene.js';
import Scene from '../../src/components/Scene.svelte';
import { BabylonAdapter } from '../../src/adapters/babylon-adapter.js';
import { graphicsRepresentationResources, graphicsVisualProvider, type GraphicsRepresentation, type GraphicsRetainedRenderer } from '../../src/lib/representation/visual-provider.js';
import { createInitialGraphicsState } from '../../src/core/initial-state.js';
import type { GraphicsAction, GraphicsState, GraphicsStore } from '../../src/core/types.js';

const settle = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
let cleanup: Array<() => void> = [];
afterEach(() => { for (const fn of cleanup.reverse()) { try { fn(); } catch { /* cleanup only */ } } cleanup = []; });

function ownerStore(state: GraphicsState) {
  let current: GraphicsState | undefined = state;
  const listeners = new Set<(state: GraphicsState | undefined) => void>();
  const dispatched: GraphicsAction[] = [];
  const store: GraphicsStore = {
    get state() { return current; },
    dispatch(action: GraphicsAction) { dispatched.push(action); },
    subscribe(listener) { listeners.add(listener); listener(current); return () => listeners.delete(listener); }
  };
  return { store, dispatched, listeners: () => listeners.size, retire() { current = undefined; for (const listener of [...listeners]) listener(undefined); } };
}
const sceneState = (): GraphicsState => ({
  ...createInitialGraphicsState(),
  backgroundColor: '#101010',
  lights: [{ id: 'key', type: 'ambient', intensity: 1, color: '#ffffff' }],
  meshes: [{ id: 'cube', geometry: { type: 'box', size: 3 }, material: { color: '#ff0000', emissive: '#ff0000' }, position: [0, 0, 0] }]
});
/** WebGPU adapter with one renderer-driven animation (cube turns on the engine clock); the cube itself is store state. */
class SpinningWebGPU extends BabylonAdapter {
  liveEngine: AbstractEngine | null = null;
  liveScene: BabylonScene | null = null;
  constructor(private readonly spin: boolean) { super({ renderer: 'webgpu' }); }
  override attachEngine(engine: AbstractEngine): BabylonScene {
    const scene = super.attachEngine(engine);
    this.liveEngine = engine; this.liveScene = scene;
    if (this.spin) scene.onBeforeRenderObservable.add(() => { const cube = scene.getMeshByName('cube'); if (cube) cube.rotation.y += engine.getDeltaTime() / 250; });
    return scene;
  }
}
async function mountScene(spin: boolean, state: GraphicsState = sceneState()) {
  const owner = ownerStore(state);
  const adapter = new SpinningWebGPU(spin);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Scene as never, { target, props: { store: owner.store, createAdapter: () => adapter, width: 240, height: 180 } });
  flushSync();
  for (let i = 0; i < 60 && !adapter.liveEngine; i++) await settle(50);
  await settle(150);
  const canvas = target.querySelector('canvas')!;
  expect(adapter.liveEngine, 'the Scene did not initialise a WebGPU engine').not.toBeNull();
  let mounted = true;
  const unmountScene = () => { if (!mounted) return; mounted = false; unmount(instance); target.remove(); };
  cleanup.push(unmountScene, () => adapter.dispose());
  return { owner, adapter, engine: adapter.liveEngine!, canvas, unmountScene };
}
function represent(canvas: HTMLCanvasElement) {
  const controller = new AbortController();
  const diagnostics: string[] = [];
  const result = graphicsVisualProvider().represent(canvas, { document, signal: controller.signal, reducedMotion: false, diagnose: reason => diagnostics.push(reason) });
  if (!result || 'declined' in result) throw new Error(`not represented: ${JSON.stringify(result)}`);
  const rep = result as GraphicsRepresentation;
  const box = canvas.getBoundingClientRect();
  const wrapper = document.createElement('div');
  wrapper.inert = true;
  wrapper.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;pointer-events:none;`;
  wrapper.appendChild(rep.node);
  document.body.appendChild(wrapper);
  cleanup.push(() => wrapper.remove(), () => { const retained = rep.retire?.(); retained?.dispose(); rep.dispose(); });
  return { rep, mirror: rep.node as HTMLCanvasElement, diagnostics };
}
async function driveFrames(renderer: GraphicsRetainedRenderer, count: number) { for (let i = 0; i < count; i++) renderer.frame?.(await nextFrame()); }
const pixels = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) { expect(a.length).toBe(b.length); let total = 0; for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!); return total / a.length; }
function redShare(data: Uint8ClampedArray) { let red = 0; for (let i = 0; i < data.length; i += 4) if (data[i]! > 120 && data[i + 1]! < 80 && data[i + 2]! < 80) red++; return red / (data.length / 4); }
const evidence: Record<string, unknown> = {};

describe('first-party graphics on a real WebGPU adapter', () => {
  it('environment: a real (non-fallback) GPU adapter is present', async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info as (GPUAdapterInfo & { isFallbackAdapter?: boolean }) | undefined;
    evidence.adapter = { vendor: info?.vendor, architecture: info?.architecture, isFallbackAdapter: info?.isFallbackAdapter, userAgent: navigator.userAgent };
    console.info('WEBGPU adapter', JSON.stringify(evidence.adapter));
    expect(adapter, 'no WebGPU adapter').toBeTruthy();
    expect(info?.isFallbackAdapter).toBe(false);
    expect(info?.architecture).not.toBe('swiftshader');
  });

  it('a WebGPU Scene renders through WebGPUEngine and reports the real renderer', async () => {
    const harness = await mountScene(false);
    const engine = harness.engine as AbstractEngine & { isWebGPU?: boolean };
    const initialized = harness.owner.dispatched.find(action => action.type === 'rendererInitialized');
    const { rep, mirror } = represent(harness.canvas);
    await rep.ready;
    const share = redShare(pixels(mirror));
    evidence.render = { isWebGPU: engine.isWebGPU, engineName: engine.name, initialized, redShare: share, canvas: [harness.canvas.width, harness.canvas.height], contextType: harness.canvas.getContext('webgpu') ? 'webgpu' : 'other' };
    console.info('WEBGPU render', JSON.stringify(evidence.render));
    expect(engine.isWebGPU).toBe(true);
    expect(initialized).toMatchObject({ type: 'rendererInitialized', renderer: 'webgpu', capabilities: { supportsWebGL: false } });
    expect(share).toBeGreaterThan(0.05); // the store's red cube is really drawn into the mirror
  });

  it('retained after owner retirement: renderer-driven motion keeps changing mirror pixels; no store ties; released once', async () => {
    const runs: Record<string, unknown> = {};
    for (const spin of [false, true]) {
      const harness = await mountScene(spin);
      const { rep, mirror } = represent(harness.canvas);
      await rep.ready;
      const dispatchedBefore = harness.owner.dispatched.length;
      // Route-commit order: owner retires, the run retires the representation, Svelte unmounts the component.
      harness.owner.retire();
      const retained = rep.retire?.();
      harness.unmountScene();
      expect(retained, 'render authority was not transferred').toBeTruthy();
      expect(harness.canvas.isConnected).toBe(false);
      await driveFrames(retained!, 6);
      const a = new Uint8ClampedArray(pixels(mirror));
      await driveFrames(retained!, 20);
      const b = new Uint8ClampedArray(pixels(mirror));
      const ledgerRetained = graphicsRepresentationResources();
      runs[spin ? 'spinning' : 'control'] = { difference: difference(a, b), redShare: redShare(b), listenersAfterRetire: harness.owner.listeners(), dispatchedAfterRetire: harness.owner.dispatched.length - dispatchedBefore, ledgerWhileRetained: ledgerRetained };
      expect(harness.owner.listeners()).toBe(0);
      expect(harness.owner.dispatched.length).toBe(dispatchedBefore);
      retained!.dispose();
      rep.dispose();
      (runs[spin ? 'spinning' : 'control'] as Record<string, unknown>).ledgerAfterDispose = graphicsRepresentationResources();
      (runs[spin ? 'spinning' : 'control'] as Record<string, unknown>).engineDisposed = (harness.engine as AbstractEngine).isDisposed;
      expect((harness.engine as AbstractEngine).isDisposed).toBe(true);
    }
    evidence.retained = runs;
    console.info('WEBGPU retained', JSON.stringify(runs));
    const control = runs.control as { difference: number }, spinning = runs.spinning as { difference: number; redShare: number };
    expect(spinning.redShare).toBeGreaterThan(0.02);
    expect(spinning.difference).toBeGreaterThan(control.difference * 5 + 0.5);
    expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
  });

  it('explicit destination state: a new WebGPU Scene renders the same state; nothing is fetched remotely', async () => {
    const state = sceneState();
    const source = await mountScene(false, state);
    source.owner.retire();
    source.unmountScene();
    const destination = await mountScene(false, state);
    const { rep, mirror } = represent(destination.canvas);
    await rep.ready;
    const share = redShare(pixels(mirror));
    const remote = performance.getEntriesByType('resource').map(entry => entry.name).filter(url => !/^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:)/.test(url));
    evidence.destination = { redShare: share, remoteRequests: remote };
    console.info('WEBGPU destination', JSON.stringify(evidence.destination));
    expect(share).toBeGreaterThan(0.05);
    expect(remote).toEqual([]);
  });
});

describe('device restoration pending at final release (review W2)', () => {
  it('a late restoration does not leave a live device on the released engine, and nothing rejects unhandled', async () => {
    const harness = await mountScene(true);
    const { rep } = represent(harness.canvas);
    await rep.ready;
    harness.owner.retire();
    const retained = rep.retire!()!;
    harness.unmountScene();
    const original = GPUAdapter.prototype.requestDevice;
    let unblock!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    let requested = false, restored: GPUDevice | undefined, restoredLost = false;
    GPUAdapter.prototype.requestDevice = async function (descriptor) { requested = true; await blocked; restored = await original.call(this, descriptor); restored.lost.then(() => { restoredLost = true; }); return restored; };
    const rejections: string[] = [];
    const onRejection = (event: PromiseRejectionEvent) => { rejections.push(String(event.reason)); event.preventDefault(); };
    window.addEventListener('unhandledrejection', onRejection);
    try {
      const first = (harness.engine as unknown as { _device: GPUDevice })._device;
      first.destroy();
      await first.lost;
      for (let i = 0; i < 100 && !requested; i++) await settle(5);
      expect(requested, 'Babylon did not start restoring').toBe(true);
      retained.dispose();
      unblock();
      await settle(200);
      const result = { disposed: harness.engine.isDisposed, restoredDevice: !!restored, restoredLost, rejections, ledger: graphicsRepresentationResources() };
      evidence.restorationRace = result;
      console.info('WEBGPU restoration race', JSON.stringify(result));
      expect(result).toEqual({ disposed: true, restoredDevice: true, restoredLost: true, rejections: [], ledger: { surfaces: 0, retained: 0, representations: 0, mirrors: 0 } });
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
      GPUAdapter.prototype.requestDevice = original;
      unblock();
      if (!restoredLost) restored?.destroy();
    }
  });
});
