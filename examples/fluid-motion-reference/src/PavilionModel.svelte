<!--
  The shared 3D pavilion model (first-party graphics Scene). It renders the root-owned scene state, so the
  home card and the study show the same model and the same turntable playback.
-->
<script lang="ts">
  import { Scene } from '@composable-svelte/graphics';
  import { pavilionScene } from './scene.js';

  let { height }: { height: string } = $props();
  // The canvas is a real orbit control (drag, wheel, arrow keys when focused); name it for assistive technology.
  const label = 'Pavilion model — drag or use arrow keys to orbit';
  const scene = pavilionScene();
</script>

{#if scene.store}
  <div class="model-frame" data-pavilion-model>
    <Scene store={scene.store} {height} {label} />
  </div>
{/if}

<style>
  .model-frame { border-radius: 14px; overflow: hidden; background: radial-gradient(circle at 50% 30%, #1e3a5f, #0f1522 70%); }
</style>
