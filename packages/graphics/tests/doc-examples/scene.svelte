<!--
	Mirrors: packages/graphics/README.md

	The whole declarative surface in one block — every component, the renamed
	`direction` prop on the directional light, and a dispatch. This file is the
	authority: `svelte-check` compiles it as part of `pnpm -r check`, and
	`doc-examples.test.ts` fails if the document stops matching it.
-->
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    Scene,
    Camera,
    Mesh,
    Light,
    graphicsReducer,
    createInitialGraphicsState
  } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialGraphicsState(),
    reducer: graphicsReducer,
    dependencies: {}
  });

  function rotateCube() {
    store.dispatch({
      type: 'setMeshRotation',
      id: 'cube-1',
      rotation: [0, Math.PI / 4, 0]
    });
  }
</script>

<Scene {store}>
  <Camera {store} position={[0, 0, 10]} lookAt={[0, 0, 0]} />

  <Light {store} type="directional" direction={[1, 1, 1]} intensity={0.8} />

  <Mesh
    {store}
    id="cube-1"
    geometry={{ type: 'box', size: 2 }}
    material={{ color: '#ff6b6b', metallic: 0.5 }}
    position={[0, 0, 0]}
    rotation={$store.meshes.find(m => m.id === 'cube-1')?.rotation}
  />
</Scene>

<button onclick={rotateCube}>Rotate Cube</button>
