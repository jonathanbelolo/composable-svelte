<script lang="ts">
/**
 * WebGLOverlay - Svelte Component Wrapper
 *
 * Provides a declarative Svelte API for the WebGL overlay system.
 * Automatically manages canvas creation, lifecycle, and cleanup.
 */

import { onMount } from 'svelte';
import { createOverlay } from './webgl-overlay.js';
import { OverlayError } from '../utils/overlay-error.js';
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
 * Update canvas size to match window viewport
 */
function updateCanvasSize(): void {
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Set CSS display size (in CSS pixels)
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  // Set canvas buffer size (in physical pixels, accounting for device pixel ratio)
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  // Update WebGL viewport to match buffer size
  const gl = overlay?.getContext();
  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Initialize overlay on mount
 */
onMount(() => {
  if (!canvas) return;

  // Set initial canvas size
  updateCanvasSize();

  // Create overlay instance
  const result = createOverlay({ ...options, canvas });

  // Check if overlay creation failed
  if (result instanceof OverlayError) {
    console.error('Failed to create overlay:', result.message);
    return;
  }

  overlay = result;

  // Start the render loop
  overlay.start();

  // Handle window resize
  const handleResize = () => {
    updateCanvasSize();
  };
  window.addEventListener('resize', handleResize);

  // Cleanup on unmount
  return () => {
    window.removeEventListener('resize', handleResize);
    overlay?.stop();
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
  const result = overlay.registerElement(
    registration.id,
    registration.domElement,
    {
      type: elementType,
      shader: registration.shader
    }
  );

  // Check if registration failed
  if (result instanceof OverlayError) {
    console.error('[WebGLOverlay] Failed to register element:', result.toString());
    return;
  }

  // TODO: Call texture loaded callback when texture actually loads
  // For now, delay callback to allow texture loading to complete
  if (registration.onTextureLoaded) {
    // Give texture time to load asynchronously
    setTimeout(() => {
      if (registration.onTextureLoaded) {
        registration.onTextureLoaded();
      }
    }, 100);
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

  // Use the setShader method which properly recompiles the shader
  overlay.setShader(id, shader);
}

/**
 * Public API - Update element position
 * Useful when CSS transforms change element position
 */
export function updateElementPosition(id: string): void {
  if (!overlay) return;

  // Trigger position tracker to update this element's bounds
  // @ts-expect-error - updateElementPosition exists in implementation but not in interface
  overlay.updateElementPosition(id);
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
