/**
 * Identity, idempotency and lifetime in the reducer.
 *
 * Every arm here is read by `syncScene`, which diffs by object identity — so an
 * arm that returns a fresh object for an unchanged value makes the renderer do
 * work for nothing, and an arm that lets two things share an id makes the
 * renderer see only one of them.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Light from '../src/components/Light.svelte';
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
	vi.restoreAllMocks();
});

const makeStore = () =>
	createStore<GraphicsState, GraphicsAction>({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

const cube = (over: Partial<MeshConfig> = {}): MeshConfig => ({
	id: 'cube',
	geometry: { type: 'box', size: 1 },
	position: [0, 0, 0],
	material: { color: '#ff0000' },
	...over
});

function mountIn(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Component as never, { target, props });
	let live = true;
	cleanup.push(() => {
		if (live) unmount(instance);
		live = false;
		target.remove();
	});
	return { target, instance };
}

describe('ids are unique', () => {
	it('refuses a second light with an id already in use', () => {
		const store = makeStore();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		store.dispatch({ type: 'addLight', light: { id: 'dup', type: 'ambient', intensity: 1 } });
		store.dispatch({ type: 'addLight', light: { id: 'dup', type: 'ambient', intensity: 2 } });

		// Two lights under one id is not a scene with two lights: `syncScene`
		// builds a Map, so only the last would ever reach the renderer, while
		// `removeLight` filters by id and would remove both.
		expect(store.state.lights.filter((l) => l.id === 'dup')).toHaveLength(1);
		expect(warn).toHaveBeenCalled();
	});

	it('refuses a second mesh with an id already in use', () => {
		const store = makeStore();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({ type: 'addMesh', mesh: cube({ position: [9, 9, 9] }) });

		expect(store.state.meshes).toHaveLength(1);
		expect(warn).toHaveBeenCalled();
	});

	it('survives two <Light> components sharing an explicit id', () => {
		// Reported as a hard crash: the idempotency guard finds the *first*
		// match while the update maps over *every* match, so the two components
		// overwrite each other's config forever and Svelte aborts with
		// `effect_update_depth_exceeded`.
		const store = makeStore();
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(() => {
			mountIn(Light, { store, id: 'same', type: 'point', position: [0, 1, 0], intensity: 1 });
			mountIn(Light, { store, id: 'same', type: 'point', position: [0, 1, 0], intensity: 5 });
			flushSync();
		}).not.toThrow();

		// Not just "it did not throw": the defect lives in the state this used to
		// leave behind. Three separate guards prevent it — the reducer's
		// uniqueness check, the component standing aside, and the untracked
		// dispatch — and each has its own test above; this asserts the outcome
		// they exist for.
		expect(store.state.lights.filter((l) => l.id === 'same')).toHaveLength(1);
		expect(store.state.lights.find((l) => l.id === 'same')?.intensity).toBe(1);
	});
});

describe('no-op dispatches keep state identity', () => {
	it('setMeshPosition to the same position changes nothing', () => {
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ position: [1, 2, 3] }) });
		const before = store.state.meshes;

		store.dispatch({ type: 'setMeshPosition', id: 'cube', position: [1, 2, 3] });

		// A fresh array trips `previous.meshes !== state.meshes` in `syncScene`,
		// which then walks both Maps and calls `updateMesh` for nothing.
		expect(store.state.meshes).toBe(before);
	});

	it('setCameraPosition to the same position changes nothing', () => {
		const store = makeStore();
		const before = store.state.camera;

		store.dispatch({ type: 'setCameraPosition', position: before.position });

		expect(store.state.camera).toBe(before);
	});

	it('removing a mesh that is not there changes nothing', () => {
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		const before = store.state.meshes;

		store.dispatch({ type: 'removeMesh', id: 'not-here' });

		expect(store.state.meshes).toBe(before);
	});

	it('removing a light that is not there changes nothing', () => {
		const store = makeStore();
		const before = store.state.lights;

		store.dispatch({ type: 'removeLight', id: 'not-here' });

		expect(store.state.lights).toBe(before);
	});
});

describe('visibility toggles from its effective value', () => {
	it('hides a mesh added without an explicit visible', () => {
		const store = makeStore();
		// The adapter reads `config.visible ?? true`, so an absent `visible`
		// means visible. `!undefined` is `true`, so the first toggle used to set
		// it to what it already was — a no-op the user sees as a dead button.
		store.dispatch({ type: 'addMesh', mesh: cube() });

		store.dispatch({ type: 'toggleMeshVisibility', id: 'cube' });

		expect(store.state.meshes[0]!.visible).toBe(false);
	});
});

describe('the last two arms keep identity too', () => {
	it('setting the background to the colour it already is changes nothing', () => {
		const store = makeStore();
		// The whole state object, captured *before* the dispatch. Comparing
		// `store.state` against `store.state` after the fact is trivially true —
		// which is what the first draft of this test did, and it survived the
		// mutation it exists to catch.
		const before = store.state;

		store.dispatch({ type: 'setBackgroundColor', color: before.backgroundColor });

		expect(store.state, 'a no-op dispatch produced fresh state').toBe(before);
	});

	it('setting a different background still changes it', () => {
		const store = makeStore();

		store.dispatch({ type: 'setBackgroundColor', color: '#123456' });

		expect(store.state.backgroundColor).toBe('#123456');
	});

	it('clearing an already-empty scene changes nothing', () => {
		const store = makeStore();
		store.dispatch({ type: 'clearScene' });
		const meshes = store.state.meshes;
		const lights = store.state.lights;
		const animations = store.state.animations;

		store.dispatch({ type: 'clearScene' });

		// `syncScene` reads identity, so three fresh empty arrays are three
		// diffs walked for nothing.
		expect(store.state.meshes).toBe(meshes);
		expect(store.state.lights).toBe(lights);
		expect(store.state.animations).toBe(animations);
	});

	it('clearing a populated scene still empties it', () => {
		// The paired half: the guard must not swallow a real clear.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });

		store.dispatch({ type: 'clearScene' });

		expect(store.state.meshes).toEqual([]);
		expect(store.state.lights).toEqual([]);
	});
});