/**
 * `<Scene>` initialises asynchronously, and can be unmounted mid-flight.
 *
 * Under jsdom `Engine` construction fails — there is no canvas context — so
 * `initialize` always rejects here. That is enough to drive the cancellation
 * path, which is the same flag on both branches: what must not happen is the
 * component reporting into a store it has already been detached from.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Scene from '../src/components/Scene.svelte';
import { BabylonAdapter } from '../src/adapters/babylon-adapter';
// Aliased: this file already imports the `<Scene>` component under that name.
import { NullEngine, Scene as BabylonScene } from '@babylonjs/core';
import type { GraphicsAction, GraphicsState } from '../src/core/types';

afterEach(() => vi.restoreAllMocks());

const makeStore = () =>
	createStore<GraphicsState, GraphicsAction>({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

function mountScene(store: ReturnType<typeof makeStore>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Scene as never, { target, props: { store } });
	flushSync();
	return { target, instance };
}

describe('Scene initialisation', () => {
	it('reports a failure it is still mounted for', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = makeStore();
		const { instance, target } = mountScene(store);

		await settle();

		expect(store.state.renderer.error).toBeTruthy();
		unmount(instance);
		target.remove();
	});

	it('says nothing once it has been unmounted', async () => {
		// The cleanup used to run against an adapter whose engine was still null,
		// so `dispose()` did nothing, and the awaited initialisation carried on to
		// build an engine, a render loop and a resize listener that nothing owned.
		// The reporting half is what is observable here: a detached component must
		// not write to the store.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = makeStore();
		const { instance, target } = mountScene(store);

		// Before the awaited `initialize` settles.
		unmount(instance);
		target.remove();

		await settle();

		expect(
			store.state.renderer.error,
			'an unmounted <Scene> reported into the store'
		).toBeNull();
	});

	it('disposes an engine that finished building after it was unmounted', () => {
		// The shape the guard defends, and it has to be built deliberately: today
		// `initialize` has no internal `await`, so its engine exists *before* the
		// microtask boundary and the `onMount` cleanup's own `adapter?.dispose()`
		// already catches it. That is why simply asserting `dispose` was called
		// passed with the guard deleted — the cleanup was calling it.
		//
		// So the stub builds its scene *after* awaiting, which is what any real
		// async backend would do (`WebGPUEngine` among them). Now the cleanup runs
		// against an adapter that owns nothing, and only the cancelled branch can
		// dispose what appears afterwards.
		let built: BabylonScene | null = null;

		vi.spyOn(BabylonAdapter.prototype, 'initialize').mockImplementation(async function (
			this: BabylonAdapter
		) {
			await new Promise((resolve) => setTimeout(resolve, 20));
			built = this.attachEngine(
				new NullEngine({
					renderWidth: 8,
					renderHeight: 8,
					textureSize: 8,
					deterministicLockstep: false,
					lockstepMaxSteps: 1
				})
			);
			return {
				renderer: 'webgl' as const,
				capabilities: { supportsWebGL: true, maxTextureSize: 4096, maxVertexAttributes: 16 }
			};
		});

		const store = makeStore();
		const { instance, target } = mountScene(store);

		unmount(instance);
		target.remove();

		return settle().then(() => {
			expect(built, 'the stub never built a scene — the test proves nothing').not.toBeNull();
			expect(built!.isDisposed, 'the finished engine was left running').toBe(true);
			expect(
				store.state.renderer.isInitialized,
				'an unmounted <Scene> reported initialisation'
			).toBe(false);
		});
	});
});
