<script lang="ts">
/**
 * Scene - Root component for 3D rendering
 * Manages Babylon.js engine lifecycle and syncs with store state
 */

import { onMount } from 'svelte';
import type { Snippet } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction } from '../core/types';
import { BabylonAdapter } from '../adapters/babylon-adapter';

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
      const result = await adapter.initialize(
        canvas,
        store.state.renderer.activeRenderer !== 'webgl'
      );

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
 * Setup manual subscription for scene sync (same pattern as MapPrimitive)
 * Avoids infinite loops caused by effect → DOM manipulation → effect
 */
function setupSceneSync() {
  if (!adapter) return;

  // Track previous values to detect actual changes
  let previousCamera = { ...store.state.camera };
  let previousMeshes: typeof $store.meshes = [];
  let previousLights: typeof $store.lights = [];
  let previousBackgroundColor = store.state.backgroundColor;

  // Manually subscribe to store updates
  const unsubscribe = store.subscribe((state) => {
    if (!adapter) return;

    // Sync camera
    if (JSON.stringify(previousCamera) !== JSON.stringify(state.camera)) {
      adapter.updateCamera(state.camera);
      previousCamera = { ...state.camera };
    }

    // Sync meshes
    const currentMeshes = state.meshes;
    if (JSON.stringify(previousMeshes) !== JSON.stringify(currentMeshes)) {
      const prevMap = new Map(previousMeshes.map((m) => [m.id, m]));
      const currMap = new Map(currentMeshes.map((m) => [m.id, m]));

      // Remove deleted meshes
      for (const [id] of prevMap) {
        if (!currMap.has(id)) {
          adapter.removeMesh(id);
        }
      }

      // Add new or update changed meshes
      for (const [id, mesh] of currMap) {
        const prev = prevMap.get(id);
        if (!prev) {
          adapter.addMesh(mesh);
        } else if (JSON.stringify(prev) !== JSON.stringify(mesh)) {
          adapter.updateMesh(id, mesh);
        }
      }

      previousMeshes = currentMeshes;
    }

    // Sync lights
    const currentLights = state.lights;
    if (JSON.stringify(previousLights) !== JSON.stringify(currentLights)) {
      // For simplicity, just clear and re-add all lights
      // TODO: More granular light updates
      for (let i = previousLights.length - 1; i >= 0; i--) {
        adapter.removeLight(i);
      }
      currentLights.forEach((light) => {
        adapter.addLight(light);
      });

      previousLights = currentLights;
    }

    // Sync background color
    if (previousBackgroundColor !== state.backgroundColor) {
      adapter.setBackgroundColor(state.backgroundColor);
      previousBackgroundColor = state.backgroundColor;
    }
  });

  return unsubscribe;
}

// Format width/height
const widthStyle = typeof width === 'number' ? `${width}px` : width;
const heightStyle = typeof height === 'number' ? `${height}px` : height;
</script>

<div class="scene-container" style="width: {widthStyle}; height: {heightStyle};">
  <canvas bind:this={canvas} class="scene-canvas"></canvas>

  <!-- Render children (Camera, Mesh, Light components) after adapter is ready -->
  {#if adapter}
    {@render children?.()}
  {/if}
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
