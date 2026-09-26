<script lang="ts">
  import {
    Scene,
    Camera,
    Mesh,
    Light,
    WebGLOverlay,
    type GraphicsState,
    type GraphicsAction
  } from '@composable-svelte/graphics';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { ComponentProps } from 'svelte';

  let { store, surface }: PresentationFeatureViewProps<GraphicsState, GraphicsAction> = $props();

  function assertProps(view: PresentationFeatureViewProps<GraphicsState, GraphicsAction>['store']) {
    const _scene: ComponentProps<typeof Scene>['store'] = view;
    const _camera: ComponentProps<typeof Camera>['store'] = view;
    const _mesh: ComponentProps<typeof Mesh>['store'] = view;
    const _light: ComponentProps<typeof Light>['store'] = view;
    const _overlayOwner: ComponentProps<typeof WebGLOverlay>['owner'] = view;
    return [_scene, _camera, _mesh, _light, _overlayOwner];
  }
</script>

<div use:surface>
  <Scene {store} width={640} height={480}>
    <Camera {store} position={[0, 5, 10]} lookAt={[0, 0, 0]} />
    <Light {store} type="directional" intensity={1} direction={[0, -1, 0]} />
    <Mesh
      {store}
      id="cube"
      geometry={{ type: 'box', size: 1 }}
      material={{ color: '#ff0000' }}
      position={[0, 0, 0]}
    />
  </Scene>
  <WebGLOverlay owner={store} />
</div>
