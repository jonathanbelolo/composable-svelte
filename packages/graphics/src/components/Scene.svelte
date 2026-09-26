<script lang="ts">
/**
 * Scene - Root component for 3D rendering
 * Manages Babylon.js engine lifecycle and syncs with store state
 */

import { onMount } from 'svelte';
import type { Snippet } from 'svelte';
import type { GraphicsStore } from '../core/types.js';
import { BabylonAdapter } from '../adapters/babylon-adapter.js';
import { initialBaseline, syncScene, type GraphicsAdapter } from '../core/scene-sync.js';

// Props
let {
  store,
  createAdapter,
  width = '100%',
  height = '600px',
  children
}: {
  store: GraphicsStore;
  createAdapter?: (() => GraphicsAdapter) | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  children?: Snippet | undefined;
} = $props();

// Canvas element
let canvas: HTMLCanvasElement | null = $state(null);

// Subscribe manually: the callback drives a renderer, and an effect that both
// reads the store and mutates the scene would follow its own output. Native
// initialization can outlive unmount, so release is also handled on settle.
onMount(() => {
  if (!canvas) return;

  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  let isDisposed = false;
  let initializationSettled = false;
  let baseline = initialBaseline();

  if (!store.state) {
    // Owner is already retired at mount; do not initialize native engine
    cancelled = true;
    isDisposed = true;
    return;
  }

  const pending: GraphicsAdapter = createAdapter?.() ?? new BabylonAdapter();
  // Keep this local reference even after retirement. A late async initialize
  // may create an engine after the ordinary cleanup has already run.

  function releaseAdapter() {
    if (isDisposed) return;
    isDisposed = true;
    pending.dispose();
  }

  function disposeScene() {
    if (isDisposed) return;
    cancelled = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    // Initialization may still be creating native resources. Its own settle
    // path releases the adapter in that case, exactly once.
    if (initializationSettled) releaseAdapter();
  }

  // Subscribe immediately to observe owner retirement synchronously
  unsubscribe = store.subscribe((state) => {
    if (!state) {
      // Owner retirement: cancel native work promptly
      disposeScene();
      return;
    }
    if (isDisposed || cancelled || !initializationSettled) return;
    baseline = syncScene(state, baseline, pending);
  });

  (async () => {
    try {
      const result = await pending.initialize(canvas);
      initializationSettled = true;

      if (cancelled || isDisposed || !store.state) {
        releaseAdapter();
        return;
      }

      store.dispatch({
        type: 'rendererInitialized',
        renderer: result.renderer,
        capabilities: result.capabilities
      });

      if (store.state && !isDisposed && !cancelled) {
        baseline = syncScene(store.state, baseline, pending);
      }
    } catch (error) {
      const reportError = !cancelled && !!store.state;
      initializationSettled = true;
      disposeScene();
      if (!reportError) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize renderer';
      store.dispatch({
        type: 'rendererError',
        error: errorMessage
      });
      console.error('[Scene] Initialization error:', error);
    }
  })();

  return () => {
    disposeScene();
  };
});

// Format width/height
const widthStyle = $derived(typeof width === 'number' ? `${width}px` : width);
const heightStyle = $derived(typeof height === 'number' ? `${height}px` : height);
</script>

<div class="scene-container" style="width: {widthStyle}; height: {heightStyle};">
  <canvas bind:this={canvas} class="scene-canvas"></canvas>

  <!-- Render children (Camera, Mesh, Light components) -->
  {@render children?.()}
</div>

<style>
  .scene-container {
    position: relative;
    overflow: hidden;
  }

  .scene-canvas {
    width: 100%;
    height: 100%;
    display: block;
    outline: none;
    touch-action: none;
  }
</style>
