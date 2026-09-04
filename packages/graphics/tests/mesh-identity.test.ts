/**
 * `<Mesh>` owns an id, and must hand it back.
 *
 * The same three properties `<Light>` needs, for the same reason: the store
 * keys meshes by id and `syncScene` diffs by it, so a component that claims an
 * id it does not hold, or lets go of one it does, corrupts the scene rather
 * than just itself.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Mesh from '../src/components/Mesh.svelte';
import MeshIdHarness from './test-components/MeshIdHarness.svelte';
import type { GraphicsAction, GraphicsState } from '../src/core/types';

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

function mountIn(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Component as never, { target, props });
	let live = true;
	const teardown = () => {
		if (live) unmount(instance);
		live = false;
		target.remove();
	};
	cleanup.push(teardown);
	return { target, instance, teardown };
}

const meshProps = (id: string) => ({
	id,
	geometry: { type: 'box' as const, size: 1 },
	material: { color: '#ff0000' },
	position: [0, 0, 0] as [number, number, number]
});

describe('Mesh', () => {
	it('registers itself once, not twice', () => {
		const store = makeStore();
		const seen: string[] = [];
		const unsubscribe = store.subscribeToActions?.((action) => seen.push(action.type));

		mountIn(Mesh, { store, ...meshProps('once') });
		flushSync();
		unsubscribe?.();

		expect(seen).toEqual(['addMesh']);
	});

	it('renaming moves the mesh rather than orphaning it', () => {
		const store = makeStore();
		const { target } = mountIn(MeshIdHarness, { store });
		flushSync();

		expect(store.state.meshes.map((m) => m.id)).toEqual(['first']);

		target.querySelector<HTMLButtonElement>('[data-testid="rename"]')!.click();
		flushSync();

		expect(store.state.meshes.map((m) => m.id), 'the rename left an orphan').toEqual(['second']);
	});

	it('unmounting after a rename leaves nothing behind', () => {
		const store = makeStore();
		const { target, teardown } = mountIn(MeshIdHarness, { store });
		flushSync();
		target.querySelector<HTMLButtonElement>('[data-testid="rename"]')!.click();
		flushSync();

		teardown();
		flushSync();

		expect(store.state.meshes).toEqual([]);
	});

	it('stands aside instead of fighting a mesh that already owns the id', () => {
		const store = makeStore();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		mountIn(Mesh, { store, ...meshProps('shared') });
		mountIn(Mesh, { store, ...meshProps('shared'), position: [9, 9, 9] });
		flushSync();

		expect(store.state.meshes).toHaveLength(1);
		expect(store.state.meshes[0]!.position).toEqual([0, 0, 0]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('already in use'));
	});

	it('unmounting the inert duplicate leaves the real mesh alone', () => {
		const store = makeStore();
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		mountIn(Mesh, { store, ...meshProps('shared') });
		const duplicate = mountIn(Mesh, { store, ...meshProps('shared'), position: [9, 9, 9] });
		flushSync();

		duplicate.teardown();
		flushSync();

		expect(
			store.state.meshes.map((m) => m.id),
			'the duplicate took the real mesh with it'
		).toEqual(['shared']);
	});
});
