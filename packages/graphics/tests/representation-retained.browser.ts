/**
 * Real-GPU witness for `graphicsVisualProvider`: a retained Scene or overlay
 * keeps *visibly progressing* after its feature retires and its canvas leaves
 * the document, holds no store ties, and is released once.
 *
 * The test plays the visual run's part of core's provider contract directly —
 * `represent`, `retire` at the owner's retirement, `frame` per animation frame,
 * `dispose` — because that is the contract the package implements. Progression
 * is judged from mirror pixels, against a control whose scene has no
 * renderer-driven motion and must therefore stay pixel-identical: a frame
 * counter that advances over an unchanging image proves nothing.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EngineStore } from '@babylonjs/core/Engines/engineStore.js';
import type { Engine, Scene as BabylonScene } from '@babylonjs/core';
import Scene from '../src/components/Scene.svelte';
import WebGLOverlay from '../src/lib/overlay/WebGLOverlay.svelte';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';
import {
	graphicsRepresentationResources,
	graphicsVisualProvider,
	type GraphicsRepresentation,
	type GraphicsRepresentationContext,
	type GraphicsRetainedRenderer
} from '../src/lib/representation/visual-provider.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import type { GraphicsAction, GraphicsState, GraphicsStore } from '../src/core/types.js';

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

let cleanup: Array<() => void> = [];
afterEach(() => {
	for (const fn of cleanup.reverse()) {
		try {
			fn();
		} catch {
			// cleanup only
		}
	}
	cleanup = [];
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** A managed-view-shaped owner whose retirement the test controls. */
function ownerStore(state: GraphicsState) {
	let current: GraphicsState | undefined = state;
	const listeners = new Set<(state: GraphicsState | undefined) => void>();
	const dispatched: GraphicsAction[] = [];
	const store: GraphicsStore = {
		get state() {
			return current;
		},
		dispatch(action: GraphicsAction) {
			dispatched.push(action);
		},
		subscribe(listener) {
			listeners.add(listener);
			listener(current);
			return () => listeners.delete(listener);
		}
	};
	return {
		store,
		dispatched,
		listeners: () => listeners.size,
		retire() {
			current = undefined;
			for (const listener of [...listeners]) listener(undefined);
		}
	};
}

function visualContext() {
	const controller = new AbortController();
	const diagnostics: string[] = [];
	const context: GraphicsRepresentationContext = {
		document,
		signal: controller.signal,
		reducedMotion: false,
		diagnose: (reason) => diagnostics.push(reason)
	};
	return { context, diagnostics };
}

function represent(canvas: HTMLCanvasElement) {
	const visual = visualContext();
	const result = graphicsVisualProvider().represent(canvas, visual.context);
	if (!result || 'declined' in result) throw new Error(`not represented: ${JSON.stringify(result)}`);
	const rep = result as GraphicsRepresentation;
	// Where the framework would place it: fixed, at the source's box.
	const box = canvas.getBoundingClientRect();
	const wrapper = document.createElement('div');
	wrapper.inert = true;
	wrapper.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;pointer-events:none;`;
	wrapper.appendChild(rep.node);
	document.body.appendChild(wrapper);
	cleanup.push(() => wrapper.remove());
	// A failed assertion must not leak into the next test's resource ledger.
	cleanup.push(() => {
		const retained = rep.retire?.();
		retained?.dispose();
		rep.dispose();
	});
	return { rep, mirror: rep.node as HTMLCanvasElement, ...visual };
}

/** Drive a retained renderer the way a run does: one `frame` per animation frame. */
async function driveFrames(renderer: GraphicsRetainedRenderer, count: number): Promise<void> {
	for (let i = 0; i < count; i++) renderer.frame?.(await nextFrame());
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Mean absolute channel difference between two frames. */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
	expect(a.length).toBe(b.length);
	let total = 0;
	for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
	return total / a.length;
}

/** Share of pixels that are not the scene's background (the red cube). */
function redShare(data: Uint8ClampedArray): number {
	let red = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i]! > 120 && data[i + 1]! < 80 && data[i + 2]! < 80) red++;
	return red / (data.length / 4);
}

const sceneState = (): GraphicsState => ({
	...createInitialGraphicsState(),
	backgroundColor: '#101010',
	lights: [{ id: 'key', type: 'ambient', intensity: 1, color: '#ffffff' }],
	meshes: [
		{
			id: 'cube',
			geometry: { type: 'box', size: 3 },
			material: { color: '#ff0000', emissive: '#ff0000' },
			position: [0, 0, 0]
		}
	]
});

/**
 * A Babylon adapter with one renderer-driven animation: the cube turns under
 * the engine clock, in `onBeforeRender`. The cube itself — its existence,
 * position and colour — is business state from the store.
 */
class SpinningAdapter extends BabylonAdapter {
	liveEngine: Engine | null = null;
	liveScene: BabylonScene | null = null;
	constructor(private readonly spin: boolean) {
		super();
	}
	override attachEngine(engine: Engine): BabylonScene {
		const scene = super.attachEngine(engine);
		this.liveEngine = engine;
		this.liveScene = scene;
		if (this.spin) {
			scene.onBeforeRenderObservable.add(() => {
				const cube = scene.getMeshByName('cube');
				if (cube) cube.rotation.y += engine.getDeltaTime() / 250;
			});
		}
		return scene;
	}
}

async function mountScene(spin: boolean, state: GraphicsState = sceneState()) {
	const owner = ownerStore(state);
	const adapter = new SpinningAdapter(spin);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Scene as never, {
		target,
		props: { store: owner.store, createAdapter: () => adapter, width: 240, height: 180 }
	});
	flushSync();
	await settle(120);
	const canvas = target.querySelector('canvas')!;
	expect(adapter.liveEngine, 'the Scene did not initialise a real engine').not.toBeNull();
	let mounted = true;
	const unmountScene = () => {
		if (!mounted) return;
		mounted = false;
		unmount(instance);
		target.remove();
	};
	cleanup.push(unmountScene, () => adapter.dispose());
	return { owner, adapter, engine: adapter.liveEngine!, scene: adapter.liveScene!, canvas, unmountScene };
}

/** Owner retires, then the run retires the representation, then Svelte unmounts: the route-commit order. */
function retireAsRouteCommit(
	harness: Awaited<ReturnType<typeof mountScene>>,
	rep: GraphicsRepresentation
): GraphicsRetainedRenderer {
	harness.owner.retire();
	const retained = rep.retire?.();
	harness.unmountScene();
	if (!retained) throw new Error('render authority was not transferred');
	return retained;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

describe('retained <Scene> on a real WebGL engine', () => {
	it('keeps visibly progressing after its feature retires and its canvas leaves the document', async () => {
		const harness = await mountScene(true);
		const { owner, engine, scene, canvas } = harness;
		const engines = EngineStore.Instances.length;
		const { rep, mirror, diagnostics } = represent(canvas);
		await rep.ready;
		expect(redShare(pixels(mirror)), 'the mirror does not show the scene').toBeGreaterThan(0.02);

		const dispatchedAtRetirement = owner.dispatched.length;
		const retained = retireAsRouteCommit(harness, rep);
		expect(canvas.isConnected).toBe(false);
		expect(owner.listeners(), 'the retained renderer kept a store subscription').toBe(0);
		expect(engine.isDisposed, 'the engine died at the component teardown').toBe(false);
		expect(engine.activeRenderLoops, 'the component render loop still runs').toHaveLength(0);
		expect(graphicsRepresentationResources()).toMatchObject({ surfaces: 1, retained: 1 });

		const frameAtRetirement = scene.getFrameId();
		await driveFrames(retained, 4);
		const early = pixels(mirror).slice();
		await driveFrames(retained, 12);
		const late = pixels(mirror).slice();

		expect(scene.getFrameId(), 'the same scene continued (no restart)').toBeGreaterThan(frameAtRetirement);
		expect(EngineStore.Instances.length, 'a second engine was created').toBe(engines);
		expect(redShare(late), 'the retained frames are blank').toBeGreaterThan(0.02);
		expect(difference(early, late), 'the retained scene did not visibly progress').toBeGreaterThan(0.5);
		expect(owner.dispatched.length, 'the retained renderer dispatched').toBe(dispatchedAtRetirement);
		expect(diagnostics).toEqual([]);

		// Core's either/or terminal disposal: the retained renderer only.
		retained.dispose();
		expect(engine.isDisposed, 'disposal did not release the engine').toBe(true);
		expect(EngineStore.Instances).not.toContain(engine);
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });

		// The mirror keeps its last frame; nothing draws into it any more.
		const last = pixels(mirror).slice();
		await driveFrames(retained, 3);
		expect(difference(last, pixels(mirror))).toBe(0);
	});

	it('continues a declared store animation (the turntable) visually, in phase, without the store', async () => {
		// Business-declared motion: a looping `startAnimation` descriptor in the
		// store, which the reducer's `tick` advances while the feature lives.
		const startTime = Date.now();
		const turntable = {
			id: 'turntable',
			targetId: 'cube',
			property: 'rotation' as const,
			from: [0, 0, 0] as [number, number, number],
			to: [0, Math.PI * 2, 0] as [number, number, number],
			duration: 2000,
			easing: 'linear' as const,
			loop: true
		};
		const state: GraphicsState = {
			...sceneState(),
			animations: [{ id: 'turntable', config: turntable, startTime, isPlaying: true }]
		};
		const harness = await mountScene(false, state);
		const { rep, mirror, diagnostics } = represent(harness.canvas);
		await rep.ready;
		const dispatchedAtRetirement = harness.owner.dispatched.length;
		const retained = retireAsRouteCommit(harness, rep);
		expect(harness.owner.listeners()).toBe(0);

		await driveFrames(retained, 4);
		const early = pixels(mirror).slice();
		await driveFrames(retained, 12);
		const late = pixels(mirror).slice();
		expect(redShare(late)).toBeGreaterThan(0.02);
		expect(difference(early, late), 'the turntable froze at retirement').toBeGreaterThan(0.5);

		// In phase with the reducer's own formula on its own clock.
		const cube = harness.scene.getMeshByName('cube')!;
		const expected = (((Date.now() - startTime) % 2000) / 2000) * Math.PI * 2;
		const drift = Math.abs(cube.rotation.y - expected);
		expect(Math.min(drift, Math.PI * 2 - drift), 'the continuation is out of phase').toBeLessThan(0.25);
		expect(harness.owner.dispatched.length, 'the continuation dispatched').toBe(dispatchedAtRetirement);
		expect(diagnostics).toEqual([]);

		// Core's either/or terminal disposal: the retained renderer only.
		retained.dispose();
		expect(harness.engine.isDisposed).toBe(true);
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
	});

	it('control: without renderer-driven motion the retained frames are identical', async () => {
		const harness = await mountScene(false);
		const { rep, mirror } = represent(harness.canvas);
		await rep.ready;
		const retained = retireAsRouteCommit(harness, rep);
		const frameAtRetirement = harness.scene.getFrameId();
		await driveFrames(retained, 4);
		const early = pixels(mirror).slice();
		await driveFrames(retained, 12);
		expect(harness.scene.getFrameId()).toBeGreaterThan(frameAtRetirement);
		expect(redShare(early)).toBeGreaterThan(0.02);
		expect(difference(early, pixels(mirror))).toBe(0);
		// Core's either/or terminal disposal: the retained renderer only.
		retained.dispose();
		expect(harness.engine.isDisposed).toBe(true);
	});

	it('keeps ordinary teardown when represented but unmounted without retirement', async () => {
		const harness = await mountScene(true);
		const { rep, mirror, diagnostics } = represent(harness.canvas);
		await rep.ready;
		harness.unmountScene();
		expect(harness.engine.isDisposed, 'an unretired Scene outlived its teardown').toBe(true);
		expect(rep.retire?.()).toBeUndefined();
		expect(diagnostics).toContain('graphicsRendererReleased');
		expect(redShare(pixels(mirror)), 'the last frame was not kept').toBeGreaterThan(0.02);
		rep.dispose();
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
	});

	it('keeps ordinary owner retirement when nothing represents it', async () => {
		const harness = await mountScene(true);
		harness.owner.retire();
		expect(harness.engine.isDisposed, 'owner retirement no longer releases promptly').toBe(true);
		harness.unmountScene();
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
	});

	it('stops drawing on context loss during retention, keeps the last frame and still disposes once', async () => {
		const harness = await mountScene(true);
		const { rep, mirror, diagnostics } = represent(harness.canvas);
		await rep.ready;
		const gl = harness.canvas.getContext('webgl2') as WebGL2RenderingContext;
		const retained = retireAsRouteCommit(harness, rep);
		await driveFrames(retained, 3);

		gl.getExtension('WEBGL_lose_context')!.loseContext();
		await settle(20);
		expect(diagnostics).toContain('contextLost');
		const atLoss = pixels(mirror).slice();
		await driveFrames(retained, 8);
		expect(difference(atLoss, pixels(mirror)), 'drawing continued on a lost context').toBe(0);
		expect(redShare(atLoss), 'the last frame was not kept').toBeGreaterThan(0.02);

		// Core's either/or terminal disposal: the retained renderer only.
		retained.dispose();
		expect(harness.engine.isDisposed).toBe(true);
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
	});
});

// ---------------------------------------------------------------------------
// WebGLOverlay
// ---------------------------------------------------------------------------

/** A shader whose output depends on `uTime` only: pure renderer-driven motion. */
const PULSE = {
	fragment: `
precision mediump float;
uniform sampler2D uTexture;
uniform float uTime;
varying vec2 vTexCoord;
void main() {
  vec4 color = texture2D(uTexture, vTexCoord);
  gl_FragColor = vec4(color.rgb * (0.5 + 0.5 * sin(uTime * 12.0)), 1.0);
}`
};

type OverlayApi = {
	registerElement(registration: {
		id: string;
		domElement: HTMLElement;
		shader: unknown;
		onTextureLoaded?: () => void;
	}): unknown;
	getCanvas(): HTMLCanvasElement | null;
};

describe('retained <WebGLOverlay> on a real WebGL context', () => {
	it('keeps its time-driven shader progressing after its owner retires, then releases the context', async () => {
		const source = document.createElement('canvas');
		source.width = 64;
		source.height = 64;
		source.style.cssText = 'position:fixed;left:20px;top:20px;width:64px;height:64px;';
		const paint = source.getContext('2d')!;
		paint.fillStyle = '#ffffff';
		paint.fillRect(0, 0, 64, 64);
		document.body.appendChild(source);
		cleanup.push(() => source.remove());

		let state: unknown = {};
		const listeners = new Set<(state: unknown) => void>();
		const owner = {
			get state() {
				return state;
			},
			subscribe(listener: (state: unknown) => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		const onContextLost = () => {
			throw new Error('a retained overlay called its consumer');
		};
		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, {
			target,
			props: { owner, options: { targetFPS: 60, onContextLost } }
		}) as unknown as OverlayApi;
		await settle(30);
		const canvas = api.getCanvas()!;
		const gl = canvas.getContext('webgl')!;
		await new Promise<void>((resolve) =>
			api.registerElement({ id: 'pulse', domElement: source, shader: PULSE, onTextureLoaded: resolve })
		);
		await settle(50);

		const { rep, mirror, diagnostics } = represent(canvas);
		await rep.ready;

		// Owner retires, the run takes authority, Svelte unmounts; the source leaves too.
		state = undefined;
		for (const listener of [...listeners]) listener(undefined);
		const retained = rep.retire?.();
		unmount(api as never);
		target.remove();
		source.remove();
		expect(retained, 'render authority was not transferred').toBeDefined();
		expect(listeners.size, 'the retained overlay kept its owner subscription').toBe(0);

		const dpr = window.devicePixelRatio || 1;
		const sample = () => {
			const data = mirror
				.getContext('2d', { willReadFrequently: true })!
				.getImageData(Math.round(40 * dpr), Math.round(40 * dpr), 4, 4).data;
			return data[0]!;
		};
		const samples: number[] = [];
		for (let i = 0; i < 20; i++) {
			retained!.frame?.(await nextFrame());
			samples.push(sample());
		}
		const spread = Math.max(...samples) - Math.min(...samples);
		expect(Math.max(...samples), 'the retained overlay drew nothing').toBeGreaterThan(40);
		expect(spread, `the pulse did not progress: ${samples.join(',')}`).toBeGreaterThan(40);
		expect(diagnostics).toEqual([]);

		// Core's either/or terminal disposal: the retained renderer only.
		retained!.dispose();
		expect(gl.isContextLost(), 'disposal did not release the GPU context').toBe(true);
		expect(graphicsRepresentationResources()).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
	});
});
