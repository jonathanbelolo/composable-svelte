<!-- The visitor's turntable control for the shared pavilion model (explicit playback state). -->
<script lang="ts">
  import { isTurning, turntable } from './model.js';
  import { pavilionScene } from './scene.js';

  const scene = pavilionScene();
  const turning = $derived(isTurning(scene.store?.state));

  function toggle() {
    if (!scene.store) return;
    scene.store.dispatch(turning ? { type: 'stopAnimation', id: turntable.id } : { type: 'startAnimation', animation: turntable });
  }
</script>

<button data-turntable type="button" class="btn-secondary" aria-pressed={turning} onclick={toggle}>
  {turning ? 'Stop turntable' : 'Turn the model'}
</button>
