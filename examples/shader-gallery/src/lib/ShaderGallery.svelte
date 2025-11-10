<script lang="ts">
/**
 * ShaderGallery - Root component for hybrid DOM/WebGL rendering
 * Follows same pattern as Scene.svelte from graphics package
 */

import { onMount, setContext } from 'svelte';
import type { Snippet } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { ShaderGalleryState, ShaderGalleryAction } from './shader-types';
import { ShaderAdapter } from './shader-adapter';

// Props
let {
  store,
  width = '100%',
  height = '100vh',
  children
}: {
  store: Store<ShaderGalleryState, ShaderGalleryAction>;
  width?: string | number;
  height?: string | number;
  children?: Snippet;
} = $props();

// Canvas element
let canvas: HTMLCanvasElement | null = $state(null);
let adapter: ShaderAdapter | null = $state(null);

// Track image elements (not in state for purity)
const imageElements = new Map<string, HTMLImageElement>();

// Setup Babylon.js on mount
onMount(() => {
  if (!canvas) return;

  let unsubscribe: (() => void) | undefined;

  (async () => {
    try {
      // Create adapter
      adapter = new ShaderAdapter();

      // Set initial shader effect before initialization
      const initialEffect = store.state.shaderEffect;
      console.log('[ShaderGallery] Setting initial effect on adapter:', initialEffect);
      adapter.setInitialEffect(initialEffect);

      // Initialize Babylon
      await adapter.initialize(canvas);

      // Dispatch initialization success
      store.dispatch({ type: 'initialized' });

      // Setup store sync
      unsubscribe = setupStoreSync();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize';
      store.dispatch({
        type: 'initializationFailed',
        error: errorMessage
      });
      console.error('[ShaderGallery] Initialization error:', error);
    }
  })();

  return () => {
    unsubscribe?.();
    adapter?.dispose();
    adapter = null;
  };
});

/**
 * Setup manual subscription for store sync (same pattern as Scene.svelte)
 */
function setupStoreSync() {
  if (!adapter) return;

  // Track previous values (initial effect already set in onMount)
  let previousEffect = store.state.shaderEffect;

  // Subscribe to store updates
  const unsubscribe = store.subscribe((state) => {
    if (!adapter) return;

    // Sync shader effect
    if (previousEffect !== state.shaderEffect) {
      adapter.setShaderEffect(state.shaderEffect);
      previousEffect = state.shaderEffect;
    }
  });

  return () => {
    unsubscribe();
  };
}

/**
 * Register an image element - called by ShaderImage2 components
 */
function registerImageElement(id: string, element: HTMLImageElement, src: string, onTextureLoaded?: () => void): void {
  if (!adapter) return;

  // Store element reference
  imageElements.set(id, element);

  // Get bounds and add to Babylon
  const bounds = element.getBoundingClientRect();
  adapter.addImagePlane(id, element, {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height
  }, onTextureLoaded);

  // Dispatch to store for tracking
  store.dispatch({ type: 'registerImage', id, src, element });
}

/**
 * Unregister an image element
 */
function unregisterImageElement(id: string): void {
  imageElements.delete(id);
  adapter?.removeImagePlane(id);
  store.dispatch({ type: 'unregisterImage', id });
}

/**
 * Update image bounds - called every frame by ShaderImage2
 */
function updateImageElementBounds(id: string, bounds: DOMRect): void {
  adapter?.updateImagePosition(id, {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height
  });
}

// Provide gallery methods to child components
setContext('shader-gallery', {
  registerImageElement,
  unregisterImageElement,
  updateImageElementBounds
});

// Format width/height
const widthStyle = typeof width === 'number' ? `${width}px` : width;
const heightStyle = typeof height === 'number' ? `${height}px` : height;
</script>

<style>
  .gallery-container {
    position: relative;
    min-height: 100vh;
  }

  .gallery-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
  }

  .gallery-content {
    position: relative;
    z-index: 1;
  }
</style>

<div class="gallery-container">
  <!-- Babylon.js canvas overlay -->
  <canvas bind:this={canvas} class="gallery-canvas"></canvas>

  <!-- Gallery content (images in DOM) -->
  <div class="gallery-content">
    {@render children?.()}
  </div>
</div>
