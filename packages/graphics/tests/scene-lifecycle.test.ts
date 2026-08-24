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
});
