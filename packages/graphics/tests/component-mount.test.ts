/**
 * Scene components must mount without a runaway effect.
 *
 * `Camera` and `Mesh` build their config with `$derived({...})` and dispatch it
 * from an `$effect`. `dispatch` reads store state inside that effect's tracking
 * scope, so a reducer case returning a fresh object on every dispatch
 * re-triggers the effect forever. It does not surface as a thrown Svelte error
 * either — the loop re-schedules, so it pins the CPU until the tab dies.
 *
 * Both components used to carry a `mounted` flag said to skip the effect's
 * first run, since `onMount` had already dispatched. It skipped nothing: the
 * flag was `$state`, so writing it inside the effect that read it scheduled a
 * second run, and mounting dispatched twice regardless. Both now dispatch from
 * the effect alone, with the dispatch untracked so the effect follows its props
 * rather than the store it writes to.
 *
 * The reducer's value-idempotency still matters — it is what keeps a redundant
 * dispatch from reaching the renderer — but it is no longer the only thing
 * standing between a mounted component and a pinned CPU.
 *
 * Both are public exports that no example or test rendered, which is why they
 * shipped broken.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Camera from '../src/components/Camera.svelte';
import Mesh from '../src/components/Mesh.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

const makeStore = () =>
  createStore({
    initialState: createInitialGraphicsState(),
    reducer: graphicsReducer,
    dependencies: {}
  });

let cleanup: Array<() => void> = [];

afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

function mountComponent(Component: any, props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Component, { target, props });
  cleanup.push(() => {
    unmount(instance);
    target.remove();
  });
  return target;
}

describe('scene components mount cleanly', () => {
  it('Camera mounts with inline Vector3 props', async () => {
    const target = mountComponent(Camera, {
      store: makeStore(),
      position: [0, 5, 10],
      lookAt: [0, 0, 0],
      fov: 60
    });

    await settle();
    expect(target).toBeTruthy();
  });

  it('Mesh mounts with inline nested geometry and material', async () => {
    // geometry and material are nested object literals — fresh identities per
    // render, so the comparison has to recurse into them, not just compare keys.
    const target = mountComponent(Mesh, {
      store: makeStore(),
      id: 'mesh-1',
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { type: 'standard', color: '#ff0000' },
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    });

    await settle();
    expect(target).toBeTruthy();
  });
});

describe('reducer cases are idempotent by value', () => {
  it('updateCamera returns identical state for an equal config', () => {
    const state = createInitialGraphicsState();
    const [withCamera] = graphicsReducer(
      state,
      { type: 'updateCamera', camera: { type: 'perspective', position: [0, 5, 10], lookAt: [0, 0, 0] } },
      {} as never
    );

    const [again] = graphicsReducer(
      withCamera,
      { type: 'updateCamera', camera: { type: 'perspective', position: [0, 5, 10], lookAt: [0, 0, 0] } },
      {} as never
    );

    expect(again).toBe(withCamera);
  });

  it('updateCamera still applies a genuine change', () => {
    const state = createInitialGraphicsState();
    const [updated] = graphicsReducer(
      state,
      { type: 'updateCamera', camera: { position: [1, 2, 3] } },
      {} as never
    );

    expect(updated.camera.position).toEqual([1, 2, 3]);
  });

  it('updateMesh returns identical state for an equal config', () => {
    const mesh = {
      id: 'mesh-1',
      // `size`, not `width`/`height`/`depth`, and a material with no `type`:
      // this is what `GeometryConfig` declares and what
      // `babylon-adapter.ts:369` actually reads. The old fixture's extra keys
      // were ignored, so a box written that way renders at Babylon's default
      // size — which nothing could see while these tests were untyped.
      geometry: { type: 'box' as const, size: 1 },
      material: { color: '#ff0000' },
      position: [0, 0, 0] as [number, number, number]
    };

    const [withMesh] = graphicsReducer(
      createInitialGraphicsState(),
      { type: 'addMesh', mesh },
      {} as never
    );

    // Structurally equal, referentially fresh — what `$derived` produces.
    const [again] = graphicsReducer(
      withMesh,
      {
        type: 'updateMesh',
        id: 'mesh-1',
        updates: {
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff0000' },
          position: [0, 0, 0]
        }
      },
      {} as never
    );

    expect(again).toBe(withMesh);
  });

  it('updateMesh still applies a genuine change', () => {
    const mesh = {
      id: 'mesh-1',
      // `size`, not `width`/`height`/`depth`, and a material with no `type`:
      // this is what `GeometryConfig` declares and what
      // `babylon-adapter.ts:369` actually reads. The old fixture's extra keys
      // were ignored, so a box written that way renders at Babylon's default
      // size — which nothing could see while these tests were untyped.
      geometry: { type: 'box' as const, size: 1 },
      material: { color: '#ff0000' },
      position: [0, 0, 0] as [number, number, number]
    };

    const [withMesh] = graphicsReducer(
      createInitialGraphicsState(),
      { type: 'addMesh', mesh },
      {} as never
    );

    const [changed] = graphicsReducer(
      withMesh,
      { type: 'updateMesh', id: 'mesh-1', updates: { position: [9, 9, 9] } },
      {} as never
    );

    expect(changed.meshes[0]!.position).toEqual([9, 9, 9]);
  });
});
