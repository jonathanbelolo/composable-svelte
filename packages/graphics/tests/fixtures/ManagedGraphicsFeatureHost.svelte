<script lang="ts">
import { getContext } from 'svelte';
import type { PresentationFeatureViewProps, ChildView } from '@composable-svelte/core/application';
import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';
import type { GraphicsAdapter } from '../../src/core/scene-sync.js';
import Scene from '../../src/components/Scene.svelte';
import Camera from '../../src/components/Camera.svelte';
import Light from '../../src/components/Light.svelte';
import Mesh from '../../src/components/Mesh.svelte';
import WebGLOverlay from '../../src/lib/overlay/WebGLOverlay.svelte';

let {
  store,
  surface
}: PresentationFeatureViewProps<GraphicsState, GraphicsAction> = $props();

const getGraphicsAdapter = getContext<(() => GraphicsAdapter) | undefined>('getGraphicsAdapter');
const createAdapter = getGraphicsAdapter;
const onCaptureScene = getContext<((view: ChildView<GraphicsState, GraphicsAction>) => void) | undefined>('onCaptureScene');
const showDeclarativeChildren = getContext<boolean>('showDeclarativeChildren');
const showOverlay = getContext<boolean>('showOverlay');

$effect(() => {
  onCaptureScene?.(store);
});
</script>

<div use:surface data-testid="managed-graphics-feature" style="width: 100%; height: 100%;">
  <Scene {store} {createAdapter}>
    {#if showDeclarativeChildren}
      <Camera {store} position={[0, 5, 10]} lookAt={[0, 0, 0]} fov={60} />
      <Light {store} id="key-light" type="directional" direction={[1, 1, 1]} intensity={0.9} />
      <Mesh
        {store}
        id="cube-1"
        geometry={{ type: 'box', size: 2 }}
        material={{ color: '#ff0000' }}
        position={[0, 0, 0]}
      />
    {/if}
  </Scene>
  {#if showOverlay}
    <WebGLOverlay owner={store} options={{ targetFPS: 60 }} />
  {/if}
</div>
