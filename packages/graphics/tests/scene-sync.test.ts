/**
 * The state → renderer path, against a spy adapter.
 *
 * This path had no test and could not have one: the package runs under jsdom,
 * Babylon needs WebGL, and `Scene.svelte` constructed its own adapter — so
 * every defect on it was invisible by construction. `syncScene` is that logic
 * extracted, and these drive it directly.
 *
 * The tests marked FAILING BEFORE THE FIX describe what the sync does today, so
 * the extraction can be proven behaviour-preserving before anything changes.
 */

import { describe, it, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import { initialBaseline, syncScene } from '../src/core/scene-sync';
import type { SceneAdapter, SceneBaseline } from '../src/core/scene-sync';
import type { GraphicsAction, GraphicsState, LightConfig, MeshConfig } from '../src/core/types';

/** Records what the sync asked the renderer to do, in order. */
function spyAdapter() {
  const calls: string[] = [];
  const adapter: SceneAdapter = {
    updateCamera: (c) => calls.push(`updateCamera:${c.position.join(',')}`),
    addMesh: (m) => calls.push(`addMesh:${m.id}@${m.position.join(',')}`),
    updateMesh: (id, u) => calls.push(`updateMesh:${id}@${(u.position ?? []).join(',')}`),
    removeMesh: (id) => calls.push(`removeMesh:${id}`),
    addLight: (l) => calls.push(`addLight:${l.type}@${l.intensity}`),
    updateLight: (id, l) => calls.push(`updateLight:${id}@${l.intensity}`),
    removeLight: (id) => calls.push(`removeLight:${id}`),
    setBackgroundColor: (c) => calls.push(`setBackgroundColor:${c}`)
  };
  return { adapter, calls };
}

const box = (id: string): MeshConfig => ({
  id,
  geometry: { type: 'box', size: 1 },
  material: { color: '#ffffff' },
  position: [0, 0, 0]
});

function harness(initial?: Partial<Parameters<typeof createInitialGraphicsState>[0]>) {
  const store = createStore<GraphicsState, GraphicsAction>({
    initialState: createInitialGraphicsState(initial ?? {}),
    reducer: graphicsReducer,
    dependencies: {}
  });
  const { adapter, calls } = spyAdapter();
  // Seeded on first sync, not at construction — which is the real ordering.
  // `setupSceneSync` runs after `await adapter.initialize(...)`, so the children's
  // synchronous `onMount` dispatches have already landed by the time the
  // baseline exists. That is precisely why seeding it from live state made the
  // first comparison a value against itself.
  let baseline: SceneBaseline | null = null;
  const sync = () => {
    baseline = syncScene(store.state, baseline ?? initialBaseline(), adapter);
  };
  return { store, calls, sync };
}

describe('syncScene', () => {
  it('adds a mesh that appears in state', () => {
    const { store, calls, sync } = harness();
    sync();
    calls.length = 0;

    store.dispatch({ type: 'addMesh', mesh: box('a') });
    sync();

    expect(calls).toEqual(['addMesh:a@0,0,0']);
  });

  it('removes a mesh that leaves state', () => {
    const { store, calls, sync } = harness();
    store.dispatch({ type: 'addMesh', mesh: box('a') });
    sync();
    calls.length = 0;

    store.dispatch({ type: 'removeMesh', id: 'a' });
    sync();

    expect(calls).toEqual(['removeMesh:a']);
  });

  it('updates a mesh whose position changes', () => {
    const { store, calls, sync } = harness();
    store.dispatch({ type: 'addMesh', mesh: box('a') });
    sync();
    calls.length = 0;

    store.dispatch({ type: 'setMeshPosition', id: 'a', position: [1, 2, 3] });
    sync();

    expect(calls).toEqual(['updateMesh:a@1,2,3']);
  });

  it('does nothing when nothing changed', () => {
    const { store, calls, sync } = harness();
    store.dispatch({ type: 'addMesh', mesh: box('a') });
    sync();
    calls.length = 0;

    // The paired half of every "it re-syncs" test: an idle sync must be silent,
    // or a dirty-check that always fires would pass all of them.
    sync();
    sync();

    expect(calls).toEqual([]);
  });

  it('adds a new light without disturbing the existing ones', () => {
    // This used to assert the opposite — `removeLight:0`, `addLight:ambient`,
    // `addLight:point` — because the sync cleared and re-added every light on
    // any change. It pinned the thrash. Lights have ids now, so only the new
    // one is touched.
    const { store, calls, sync } = harness();
    sync(); // the default state ships one ambient light
    calls.length = 0;

    store.dispatch({
      type: 'addLight',
      light: { id: 'key', type: 'point', intensity: 1, position: [0, 1, 0] }
    });
    sync();

    expect(calls).toEqual(['addLight:point@1']);
  });
});

describe('an animation reaches the renderer', () => {
	it('five ticks produce updateMesh calls, not one addMesh', () => {
		// The exact scenario that demonstrated this dead: `tick` mutated
		// `targetMesh.position` on an object inside `state.meshes` and returned
		// `{ ...state, animations }` with no `meshes` key, so the array passed
		// through by reference. The sync then stored that same reference as its
		// baseline, and from the second sync on compared an object with itself.
		//
		// State moved. The renderer never heard about it. The README's headline
		// example is a rotating cube built on this.
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addMesh', mesh: box('cube') });
		sync();
		calls.length = 0;

		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'spin',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});

		const start = store.state.animations[0]!.startTime;
		for (const offset of [100, 250, 500, 900, 1000]) {
			store.dispatch({ type: 'tick', time: start + offset });
			sync();
		}

		const updates = calls.filter((c) => c.startsWith('updateMesh:'));
		expect(updates.length, 'the animation never reached the renderer').toBe(5);
		expect(calls.at(-1), 'the final position is wrong').toBe('updateMesh:cube@10,0,0');
	});

	it('the state and the renderer agree at every step', () => {
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addMesh', mesh: box('cube') });
		sync();
		calls.length = 0;

		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'spin',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});

		const start = store.state.animations[0]!.startTime;
		store.dispatch({ type: 'tick', time: start + 500 });
		sync();

		const inState = store.state.meshes[0]!.position.join(',');
		expect(calls.at(-1)).toBe(`updateMesh:cube@${inState}`);
	});

	it('two animations on one mesh both land', () => {
		// `property` is 'position' | 'rotation' | 'scale', so three can target one
		// mesh at once. A fix that rebuilt the mesh once per animation would drop
		// all but the last.
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addMesh', mesh: box('cube') });
		sync();

		for (const property of ['position', 'scale'] as const) {
			store.dispatch({
				type: 'startAnimation',
				animation: {
					id: `anim-${property}`,
					targetId: 'cube',
					property,
					from: [0, 0, 0],
					to: [4, 4, 4],
					duration: 1000
				}
			});
		}

		const start = store.state.animations[0]!.startTime;
		store.dispatch({ type: 'tick', time: start + 1000 });
		sync();

		const mesh = store.state.meshes[0]!;
		expect(mesh.position, 'the position animation was dropped').toEqual([4, 4, 4]);
		expect(mesh.scale, 'the scale animation was dropped').toEqual([4, 4, 4]);
	});

	it('a tick with no running animation touches nothing', () => {
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addMesh', mesh: box('cube') });
		sync();
		calls.length = 0;

		store.dispatch({ type: 'tick', time: Date.now() });
		sync();

		expect(calls, 'an idle tick re-synced the scene').toEqual([]);
	});
});

describe('the first sync', () => {
	it('applies the camera the children dispatched', () => {
		// `Scene.svelte` seeded its camera baseline from *live state*, and it did
		// so after `await adapter.initialize(...)` — a microtask later than the
		// synchronous `onMount` dispatches in `<Camera>`. `store.subscribe`
		// invokes its listener immediately, so the first comparison was the
		// dispatched config against itself and `updateCamera` was never called.
		//
		// Masked because Babylon's `ArcRotateCamera` construction defaults land
		// near the shipped ones: alpha=π/2, beta=π/3, radius=10 puts it at
		// ≈(0, 5, 8.66) against a documented default of [0, 5, 10].
		const { store, calls, sync } = harness();

		store.dispatch({
			type: 'updateCamera',
			camera: { position: [1, 2, 3], lookAt: [0, 0, 0], fov: 45 }
		});
		sync();

		expect(
			calls.filter((c) => c.startsWith('updateCamera:')),
			'the camera config never reached the renderer'
		).toEqual(['updateCamera:1,2,3']);
	});

	it('applies a background colour that differs from the renderer default', () => {
		// Same mechanism. `SceneDemo` asks for #1a1a2e and got #1a1a1a, because
		// Babylon's own clearColor is 0.1 grey and #1a1a1a is 26/255 ≈ 0.102 —
		// close enough that nobody looked.
		const { calls, sync } = harness({ backgroundColor: '#1a1a2e' });
		sync();

		expect(
			calls.filter((c) => c.startsWith('setBackgroundColor:')),
			'the background colour never reached the renderer'
		).toEqual(['setBackgroundColor:#1a1a2e']);
	});

	it('does not re-apply the camera on an unrelated dispatch', () => {
		// The paired half: the baseline must actually take, or every dispatch
		// would re-sync the camera.
		const { store, calls, sync } = harness();
		store.dispatch({
			type: 'updateCamera',
			camera: { position: [1, 2, 3], lookAt: [0, 0, 0] }
		});
		sync();
		calls.length = 0;

		store.dispatch({ type: 'addMesh', mesh: box('a') });
		sync();

		expect(calls.filter((c) => c.startsWith('updateCamera:'))).toEqual([]);
	});
});

describe('lights have identity', () => {
	const light = (id: string, intensity: number): LightConfig => ({
		id,
		type: 'point',
		position: [0, 1, 0],
		intensity
	});

	it('removing the first of three leaves the other two', () => {
		// `removeLight` filtered by array index, and `<Light>` captured its index
		// at mount. With the default state shipping one ambient light, three
		// `<Light>` children take indices 1-3 — so unmounting them removed index
		// 1, then index 2 of the already-shifted array, i.e. the wrong lights.
		// Nothing gave a light an identity to remove it by.
		const { store, sync } = harness();
		store.dispatch({ type: 'addLight', light: light('a', 1) });
		store.dispatch({ type: 'addLight', light: light('b', 2) });
		store.dispatch({ type: 'addLight', light: light('c', 3) });
		sync();

		store.dispatch({ type: 'removeLight', id: 'a' });

		expect(store.state.lights.map((l) => l.id)).toEqual(['ambient-default', 'b', 'c']);
	});

	it('updates one light without touching the others', () => {
		// The sync cleared and re-added *every* light on any change, so making
		// `<Light>` reactive without per-item diffing would turn a single prop
		// tweak into a full teardown.
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addLight', light: light('a', 1) });
		store.dispatch({ type: 'addLight', light: light('b', 2) });
		sync();
		calls.length = 0;

		store.dispatch({ type: 'updateLight', id: 'b', light: light('b', 9) });
		sync();

		expect(calls).toEqual(['updateLight:b@9']);
	});

	it('adds and removes only what changed', () => {
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addLight', light: light('a', 1) });
		sync();
		calls.length = 0;

		store.dispatch({ type: 'addLight', light: light('b', 2) });
		sync();
		expect(calls).toEqual(['addLight:point@2']);

		calls.length = 0;
		store.dispatch({ type: 'removeLight', id: 'a' });
		sync();
		expect(calls).toEqual(['removeLight:a']);
	});

	it('does nothing when no light changed', () => {
		const { store, calls, sync } = harness();
		store.dispatch({ type: 'addLight', light: light('a', 1) });
		sync();
		calls.length = 0;

		sync();
		expect(calls).toEqual([]);
	});
});

