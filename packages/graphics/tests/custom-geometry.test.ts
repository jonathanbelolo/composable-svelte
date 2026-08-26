/**
 * `GeometryConfig`'s `custom` case must reach the scene, or not reach state.
 *
 * The adapter's `createGeometry` returned `null` behind a TODO and `addMesh`
 * bailed cleanly on it — but the reducer had already admitted the mesh into
 * `state.meshes`. So a consumer could dispatch a perfectly well-typed custom
 * mesh, see it in state, and never see it rendered, with every later
 * `updateMesh` for that id a silent no-op against a renderer that had never
 * heard of it. Nothing in the suite rendered a custom geometry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MeshGeometryHarness from './test-components/MeshGeometryHarness.svelte';
import { NullEngine, Scene, Mesh, VertexBuffer } from '@babylonjs/core';
import { createStore } from '@composable-svelte/core';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';
import { graphicsReducer } from '../src/core/reducer.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import { customGeometryProblem } from '../src/core/geometry.js';
import type { GeometryConfig, MeshConfig } from '../src/core/types.js';

function headlessAdapter(): { adapter: BabylonAdapter; scene: Scene; engine: NullEngine } {
	const engine = new NullEngine({
		renderWidth: 800,
		renderHeight: 600,
		textureSize: 512,
		deterministicLockstep: false,
		lockstepMaxSteps: 1
	});
	const adapter = new BabylonAdapter();
	const scene = adapter.attachEngine(engine);
	return { adapter, scene, engine };
}

/** A unit triangle: three vertices, one face, with uvs. */
const triangle = (over: Partial<Extract<GeometryConfig, { type: 'custom' }>> = {}) =>
	({
		type: 'custom',
		vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
		indices: [0, 1, 2],
		uvs: [0, 0, 1, 0, 0, 1],
		...over
	}) as GeometryConfig;

const mesh = (geometry: GeometryConfig, id = 'custom'): MeshConfig => ({
	id,
	geometry,
	position: [0, 0, 0],
	material: { color: '#ff0000' }
});

const makeStore = () =>
	createStore({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

describe('the adapter builds a custom mesh', () => {
	let h: ReturnType<typeof headlessAdapter>;
	beforeEach(() => {
		h = headlessAdapter();
	});
	afterEach(() => {
		h.adapter.dispose();
		h.engine.dispose();
		vi.restoreAllMocks();
	});

	it('puts the vertices and indices on the scene', () => {
		h.adapter.addMesh(mesh(triangle()));

		const built = h.scene.getMeshByName('custom') as Mesh | null;
		expect(built, 'no mesh reached the scene').not.toBeNull();
		expect(built!.getTotalVertices()).toBe(3);
		expect(Array.from(built!.getIndices() ?? [])).toEqual([0, 1, 2]);
		expect(Array.from(built!.getVerticesData(VertexBuffer.PositionKind) ?? [])).toEqual([
			0, 0, 0, 1, 0, 0, 0, 1, 0
		]);
	});

	it('computes normals when none are given', () => {
		// Without them every face is lit flat by whatever the shader defaults
		// to, which reads as an untextured silhouette.
		h.adapter.addMesh(mesh(triangle()));

		const built = h.scene.getMeshByName('custom') as Mesh | null;
		const normals = Array.from(built!.getVerticesData(VertexBuffer.NormalKind) ?? []);
		expect(normals, 'no normals were produced').toHaveLength(9);
		// A triangle in the XY plane faces ±Z.
		expect(Math.abs(normals[2]!)).toBeCloseTo(1);
	});

	it('keeps the normals it is given', () => {
		// The paired half: computing them unconditionally would discard a
		// consumer's own, which is the whole reason the field exists.
		const given = [0, 1, 0, 0, 1, 0, 0, 1, 0];
		h.adapter.addMesh(mesh(triangle({ normals: given })));

		const built = h.scene.getMeshByName('custom') as Mesh | null;
		expect(Array.from(built!.getVerticesData(VertexBuffer.NormalKind) ?? [])).toEqual(given);
	});

	it('registers it, so removing it works', () => {
		// A null return left nothing in the adapter's map, which made
		// `removeMesh` a no-op and the mesh unremovable.
		h.adapter.addMesh(mesh(triangle()));
		h.adapter.removeMesh('custom');

		expect(h.scene.getMeshByName('custom'), 'the mesh could not be removed').toBeNull();
	});

	it('refuses geometry it cannot build', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		h.adapter.addMesh(mesh(triangle({ indices: [0, 1, 9] })));

		expect(h.scene.getMeshByName('custom'), 'an out-of-range index was built anyway').toBeNull();
		expect(warn).toHaveBeenCalled();
	});
});

describe('the reducer refuses what the renderer cannot build', () => {
	it('keeps invalid custom geometry out of state', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const store = makeStore();

		store.dispatch({ type: 'addMesh', mesh: mesh(triangle({ indices: [0, 1, 9] })) });

		expect(store.state.meshes, 'state kept a mesh the scene can never hold').toEqual([]);
		expect(warn).toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('admits valid custom geometry', async () => {
		// The paired half, and it is the one an over-eager guard breaks.
		const store = makeStore();

		store.dispatch({ type: 'addMesh', mesh: mesh(triangle()) });

		expect(store.state.meshes.map((m) => m.id)).toEqual(['custom']);
	});

	it('refuses an update that would make the geometry invalid', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: mesh(triangle()) });

		store.dispatch({
			type: 'updateMesh',
			id: 'custom',
			updates: { geometry: triangle({ vertices: [0, 0, 0, 1, 0, 0] }) }
		});

		expect(
			(store.state.meshes[0]!.geometry as { vertices: number[] }).vertices,
			'the mesh took on geometry the scene cannot hold'
		).toHaveLength(9);
		expect(warn).toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('leaves the primitives alone', () => {
		// The validator must not have opinions about box, sphere or the rest.
		const store = makeStore();

		store.dispatch({ type: 'addMesh', mesh: { ...mesh(triangle()), geometry: { type: 'box', size: 2 }, id: 'box' } });

		expect(store.state.meshes.map((m) => m.id)).toEqual(['box']);
	});
});

describe('<Mesh> claims only what the store accepted', () => {
	function mountHarness() {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const store = makeStore();
		const instance = mount(MeshGeometryHarness as never, { target, props: { store } });
		flushSync();
		return { store, target, instance };
	}

	it('adds the mesh once its geometry is repaired', () => {
		// `Mesh.svelte` set `ownedId` unconditionally after dispatch, so a mesh
		// the reducer refused was still treated as owned — every later prop
		// change became an `updateMesh` for an id that was never added, and the
		// reducer drops those. Repairing the geometry left it absent for good.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { store, target, instance } = mountHarness();
		expect(store.state.meshes, 'invalid geometry entered state').toEqual([]);

		target.querySelector<HTMLButtonElement>('[data-testid="repair"]')!.click();
		flushSync();

		expect(
			store.state.meshes.map((m) => m.id),
			'the repaired mesh was never added'
		).toEqual(['custom']);

		unmount(instance);
		target.remove();
		warn.mockRestore();
	});

	it('removes what it does own on unmount', () => {
		// The paired half: post-checking must not stop it claiming a mesh the
		// store did accept, or unmount would leave it behind.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { store, target, instance } = mountHarness();
		target.querySelector<HTMLButtonElement>('[data-testid="repair"]')!.click();
		flushSync();
		expect(store.state.meshes.map((m) => m.id)).toEqual(['custom']);

		unmount(instance);
		flushSync();

		expect(store.state.meshes, 'the mesh outlived the component').toEqual([]);
		target.remove();
		warn.mockRestore();
	});
});

describe('customGeometryProblem', () => {
	const problem = (over: Partial<Extract<GeometryConfig, { type: 'custom' }>>) =>
		customGeometryProblem(triangle(over));

	it('accepts a well-formed triangle', () => {
		expect(customGeometryProblem(triangle())).toBeNull();
	});

	it('rejects vertices that are not whole xyz triples', () => {
		expect(problem({ vertices: [0, 0, 0, 1, 0] })).toMatch(/triples/);
	});

	it('rejects indices that are not whole triangles', () => {
		expect(problem({ indices: [0, 1] })).toMatch(/triangles/);
	});

	it('rejects an index that names no vertex', () => {
		expect(problem({ indices: [0, 1, 3] })).toMatch(/not a vertex/);
		expect(problem({ indices: [0, 1, -1] })).toMatch(/not a vertex/);
	});

	it('rejects normals that do not match the vertex count', () => {
		expect(problem({ normals: [0, 1, 0] })).toMatch(/normals/);
	});

	it('rejects uvs that do not match the vertex count', () => {
		// Two per vertex, not three — the mistake that silently mistextures
		// every face rather than erroring.
		expect(problem({ uvs: [0, 0, 1, 0, 0, 1, 1, 1] })).toMatch(/uvs/);
	});

	it('rejects empty vertices and empty indices', () => {
		// Both clauses could be deleted together and the suite stayed green.
		expect(problem({ vertices: [] })).toMatch(/vertices is empty/);
		expect(problem({ indices: [] })).toMatch(/indices is empty/);
	});

	it('rejects an index that is not a whole number', () => {
		// Babylon truncates a float index through `Uint16Array` and silently
		// draws a different triangle.
		expect(problem({ indices: [0, 1, 1.5] })).toMatch(/not a vertex/);
	});

	it('rejects a non-finite coordinate', () => {
		// One NaN is not one bad vertex: `ComputeNormals` returns NaN for all
		// nine components of any triangle that touches it, and Babylon reports
		// nothing at all.
		expect(problem({ vertices: [0, 0, 0, 1, 0, 0, 0, NaN, 0] })).toMatch(/NaN/);
		expect(problem({ vertices: [0, 0, 0, 1, 0, 0, 0, Infinity, 0] })).toMatch(/Infinity/);
	});

	it('rejects non-finite normals and uvs', () => {
		expect(problem({ normals: [0, 1, 0, 0, 1, 0, 0, NaN, 0] })).toMatch(/normals/);
		expect(problem({ uvs: [0, 0, 1, 0, NaN, 1] })).toMatch(/uvs/);
	});

	it('accepts omitted normals and uvs', () => {
		expect(
			customGeometryProblem({
				type: 'custom',
				vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
				indices: [0, 1, 2]
			})
		).toBeNull();
	});
});

describe('<Mesh> does not retry a refusal on every prop change', () => {
	it('does not dispatch at all for geometry the reducer would refuse', () => {
		// The post-check leaves `ownedId` null when the store refuses, so every
		// prop change re-took the "not mine, not taken" branch and re-dispatched
		// — an O(vertices) scan and a reducer warning each time. Measured before
		// the pre-check: six dispatches and six warnings across five changes.
		// With an animated position that is per frame.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const store = makeStore();
		const dispatched: string[] = [];
		const wrapped = {
			...store,
			get state() {
				return store.state;
			},
			dispatch: (action: { type: string }) => {
				dispatched.push(action.type);
				return store.dispatch(action as never);
			}
		};

		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MeshGeometryHarness as never, {
			target,
			props: { store: wrapped as never }
		});
		flushSync();

		// Five prop changes with the geometry still invalid.
		for (let i = 0; i < 5; i++) {
			target.querySelector<HTMLButtonElement>('[data-testid="nudge"]')!.click();
			flushSync();
		}

		expect(
			dispatched.filter((type) => type === 'addMesh'),
			'a mesh the store would refuse was dispatched anyway'
		).toHaveLength(0);
		expect(warn.mock.calls.length, 'it complained more than once about one fault').toBe(1);

		unmount(instance);
		target.remove();
		warn.mockRestore();
	});

	it('still adds the mesh when the geometry is repaired', () => {
		// The paired half, and the whole reason `c94a312` chose a post-check:
		// declining to retry must not become declining to ever succeed.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const store = makeStore();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MeshGeometryHarness as never, { target, props: { store } });
		flushSync();
		expect(store.state.meshes).toEqual([]);

		target.querySelector<HTMLButtonElement>('[data-testid="repair"]')!.click();
		flushSync();

		expect(store.state.meshes.map((m) => m.id)).toEqual(['custom']);
		unmount(instance);
		target.remove();
		warn.mockRestore();
	});
});
