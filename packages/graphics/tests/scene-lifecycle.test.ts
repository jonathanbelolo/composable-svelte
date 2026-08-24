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

	it('disposes an engine that finished building after it was unmounted', async () => {
		// The branch the fix is actually about, and the one jsdom cannot reach on
		// its own: `initialize` needs a canvas context, so it always rejects here
		// and only the error guard ran. Stubbing a *successful* initialise is what
		// exercises the success guard — without it the adapter went on to own an
		// engine, a render loop and a resize listener that nothing could reach.
		vi.spyOn(BabylonAdapter.prototype, 'initialize').mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			return {
				renderer: 'webgl' as const,
				capabilities: { supportsWebGL: true, maxTextureSize: 4096, maxVertexAttributes: 16 }
			};
		});
		const dispose = vi.spyOn(BabylonAdapter.prototype, 'dispose');

		const store = makeStore();
		const { instance, target } = mountScene(store);

		unmount(instance);
		target.remove();
		await settle();

		expect(dispose, 'the finished engine was never disposed').toHaveBeenCalled();
		expect(
			store.state.renderer.isInitialized,
			'an unmounted <Scene> reported initialisation'
		).toBe(false);
	});
});