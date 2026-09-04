// Mirrors: packages/graphics/README.md
//
// The example that documented `new TestStore(state, reducer, {})` — three
// positional arguments against a single-object constructor, `TS2554`. A
// ```typescript fence, so the parse-only guard never looked at it, and an
// arity error is not a syntax error in any case.
//
// This file is the authority. `svelte-check` compiles it as part of
// `pnpm -r check`; `doc-examples.test.ts` fails if the document drifts from it.
import { TestStore } from '@composable-svelte/core/test';
import { graphicsReducer, createInitialGraphicsState } from '@composable-svelte/graphics';

describe('Graphics Reducer', () => {
  it('adds a mesh to the scene', async () => {
    const store = new TestStore({
      initialState: createInitialGraphicsState(),
      reducer: graphicsReducer,
      dependencies: {}
    });

    await store.send(
      {
        type: 'addMesh',
        mesh: {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0]
        }
      },
      (state) => {
        expect(state.meshes).toHaveLength(1);
        expect(state.meshes[0]?.id).toBe('cube-1');
      }
    );
  });
});
