<script lang="ts">
/**
 * WebGLOverlay - Svelte Component Wrapper
 *
 * Provides a declarative Svelte API for the WebGL overlay system.
 * Automatically manages canvas creation, lifecycle, and cleanup.
 */

import { onMount } from 'svelte';
import { createOverlay } from './webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions, ElementRegistration } from './overlay-types.js';

// Props
let {
  options = {}
}: {
  options?: OverlayOptions;
} = $props();

// Canvas element
let canvas: HTMLCanvasElement | null = $state(null);
let overlay: OverlayContextAPI | null = $state(null);

/**
 * Initialize overlay on mount
 */
onMount(() => {
  if (!canvas) return;

  // Create overlay instance
  overlay = createOverlay(canvas, options);

  // Cleanup on unmount
  return () => {
    overlay?.destroy();
    overlay = null;
  };
});

/**
 * Public API - Register an element
 */
export function registerElement(registration: {
  id: string;
  domElement: HTMLElement;
  shader: any;
  onTextureLoaded?: () => void;
}): void {
  if (!overlay) {
    console.warn('[WebGLOverlay] Overlay not initialized yet');
    return;
  }

  // Infer element type from HTML element
  const elementType =
    registration.domElement instanceof HTMLImageElement ? 'image' :
    registration.domElement instanceof HTMLVideoElement ? 'video' :
    registration.domElement instanceof HTMLCanvasElement ? 'canvas' : 'image';

  // Register with overlay - call with correct three-parameter signature
  overlay.registerElement(
    registration.id,
    registration.domElement,
    {
      type: elementType,
      shader: registration.shader
    }
  );

  // Call texture loaded callback if provided
  if (registration.onTextureLoaded) {
    registration.onTextureLoaded();
  }
}

/**
 * Public API - Unregister an element
 */
export function unregisterElement(id: string): void {
  overlay?.unregisterElement(id);
}

/**
 * Public API - Update element shader
 */
export function updateElementShader(id: string, shader: ElementRegistration['shader']): void {
  if (!overlay) return;

  const element = (overlay as any).elements.get(id);
  if (element) {
    element.shader = shader;
    element.needsUpdate = true;
  }
}
</script>

<style>
  .webgl-overlay-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
  }
</style>

<canvas bind:this={canvas} class="webgl-overlay-canvas"></canvas>
