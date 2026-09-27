<script lang="ts">
  import { getContext } from 'svelte';
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import Scene from '../../../src/components/Scene.svelte';
  import { BabylonAdapter } from '../../../src/adapters/babylon-adapter.js';
  import type { GraphicsStore } from '../../../src/core/types.js';
  import { definition, leave, type Empty } from './model.js';
  let { store }: PresentationFeatureViewProps<Empty, { type: 'noop' }, {}> = $props();
  void store;
  const route = useStagedRoute(definition);
  const participant = useParticipant();
  const scene = getContext<{ readonly store: GraphicsStore | undefined }>('webgpu-host-scene');
</script>

<main data-page="gallery">
  <h1>Gallery</h1>
  <div data-model use:participant={{ key: 'model' }} style="width: 240px; height: 180px;">
    {#if scene.store}<Scene store={scene.store} width={240} height={180} label="Test model" createAdapter={() => new BabylonAdapter({ renderer: 'webgpu' })} />{/if}
  </div>
  <button data-open type="button" onclick={() => route.request({ to: '/detail' }, { motion: leave })}>Open detail</button>
</main>
