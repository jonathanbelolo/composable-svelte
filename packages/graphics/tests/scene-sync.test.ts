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
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

/** Records what the sync asked the renderer to do, in order. */
function spyAdapter() {
  const calls: string[] = [];
  const adapter: SceneAdapter = {
    updateCamera: (c) => calls.push(`updateCamera:${c.position.join(',')}`),
    addMesh: (m) => calls.push(`addMesh:${m.id}@${m.position.join(',')}`),
    updateMesh: (id, u) => calls.push(`updateMesh:${id}@${(u.position ?? []).join(',')}`),
    removeMesh: (id) => calls.push(`removeMesh:${id}`),
    addLight: (l) => calls.push(`addLight:${l.type}@${l.intensity}`),
    removeLight: (i) => calls.push(`removeLight:${i}`),
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
  let baseline: SceneBaseline = initialBaseline();
  const sync = () => {
    baseline = syncScene(store.state, baseline, adapter);
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

  it('re-adds all lights when the light set changes', () => {
    const { store, calls, sync } = harness();
    sync(); // the default state ships one ambient light
    calls.length = 0;

    store.dispatch({
      type: 'addLight',
      light: { type: 'point', intensity: 1, position: [0, 1, 0] }
    });
    sync();

    // Coarse by design today: clear and re-add everything.
    expect(calls).toEqual(['removeLight:0', 'addLight:ambient@0.5', 'addLight:point@1']);
  });
});
