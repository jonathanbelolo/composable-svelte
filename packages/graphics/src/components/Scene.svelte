<script lang="ts">
/**
 * Scene - Root component for 3D rendering
 * Manages Babylon.js engine lifecycle and syncs with store state
 */

import { onMount } from 'svelte';
import type { Snippet } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction } from '../core/types.js';
import { BabylonAdapter } from '../adapters/babylon-adapter.js';
import { initialBaseline, syncScene } from '../core/scene-sync.js';

// Props
let {
  store,
  width = '100%',
  height = '600px',
  children
}: {
  store: Store<GraphicsState, GraphicsAction>;
  width?: string | number;
  height?: string | number;
  children?: Snippet;
} = $props();

// Canvas element
let canvas: HTMLCanvasElement | null = $state(null);
let adapter: BabylonAdapter | null = $state(null);

// Setup Babylon.js on mount
onMount(() => {
  if (!canvas) return;

  let unsubscribe: (() => void) | undefined;

  (async () => {
    try {
      // Create adapter
      adapter = new BabylonAdapter();

      // Initialize renderer (WebGPU/WebGL)
      // The second argument used to be a WebGPU preference derived from
      // `activeRenderer !== 'webgl'` — which is `null !== 'webgl'` at this
      // point, i.e. always true, so there was no path to opt out. It selected
      // between two branches that built the same engine, and is gone.
      const result = await adapter.initialize(canvas);

      // Dispatch initialization success
      store.dispatch({
        type: 'rendererInitialized',
        renderer: result.renderer,
        capabilities: result.capabilities
      });

      // Setup manual subscription for state sync
      unsubscribe = setupSceneSync();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize renderer';
      store.dispatch({
        type: 'rendererError',
        error: errorMessage
      });
      console.error('[Scene] Initialization error:', error);
    }
  })();

  return () => {
    unsubscribe?.();
    adapter?.dispose();
    adapter = null;
  };
});

/**
 * Setup manual subscription for scene sync.
 *
 * A manual subscription rather than an `$effect`: the callback drives a renderer,
 * and an effect that both reads the store and mutates the scene loops.
 *
 * The diffing itself lives in `core/scene-sync.ts`, so it can be tested against
 * a spy adapter — under jsdom Babylon cannot initialise, and nothing has ever
 * mounted this component.
 */
function setupSceneSync() {
  if (!adapter) return;

  let baseline = initialBaseline();
  const sceneAdapter = adapter;

  return store.subscribe((state) => {
    baseline = syncScene(state, baseline, sceneAdapter);
  });
}

// Format width/height
const widthStyle = typeof width === 'number' ? `${width}px` : width;
const heightStyle = typeof height === 'number' ? `${height}px` : height;
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
