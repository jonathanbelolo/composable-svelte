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
export function registerElement(registration: Omit<ElementRegistration, 'bounds' | 'needsUpdate' | 'error'>): void {
  if (!overlay) {
    console.warn('[WebGLOverlay] Overlay not initialized yet');
    return;
  }

  // Get element bounds
  const bounds = registration.domElement.getBoundingClientRect();

  // Register with overlay
  overlay.registerElement({
    ...registration,
    bounds: {
      x: bounds.left,
      y: bounds.top,
      width: bounds.width,
      height: bounds.height
    },
    needsUpdate: false,
    error: null
  });
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
