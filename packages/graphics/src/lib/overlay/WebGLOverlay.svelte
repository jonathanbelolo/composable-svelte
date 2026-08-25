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
import type {
  OverlayContextAPI,
  OverlayOptions,
  ElementRegistration,
  UpdateStrategy
} from './overlay-types.js';

// Props
let {
  options = {}
}: {
  options?: OverlayOptions | undefined;
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

  // Check if overlay creation failed.
  //
  // `options.onError` belongs to an overlay that was never constructed, so it
  // is called here by hand. Without this, `WEBGL_NOT_SUPPORTED` — the one
  // failure a consumer most needs to branch on, and the whole basis of the
  // "graceful degradation" story — had no programmatic signal at all.
  if (result instanceof OverlayError) {
    console.error('Failed to create overlay:', result.message);
    options.onError?.(result);
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
  shader: ElementRegistration['shader'];
  updateStrategy?: UpdateStrategy | undefined;
  onTextureLoaded?: (() => void) | undefined;
}): ElementRegistration | OverlayError {
  if (!overlay) {
    const error = OverlayError.invalidElementType(
      registration.id,
      'Overlay not initialized yet'
    );
    console.warn(`[WebGLOverlay] ${error.message}`);
    options.onError?.(error);
    return error;
  }

  // Infer element type from the DOM element.
  //
  // Anything that is not an image, video or canvas is refused here rather than
  // falling back to 'image'. That fallback sent a <div> into
  // `createImageTexture`, whose first guard is `!img.complete ||
  // img.naturalWidth === 0` — trivially true for a div — so the consumer got
  // `Image not loaded` about an element that is not an image and never could
  // be. There were `'text'` and `'html'` types once; they were unreachable and
  // have been removed, so there is nothing left to fall back *to*.
  const elementType =
    registration.domElement instanceof HTMLImageElement ? 'image' :
    registration.domElement instanceof HTMLVideoElement ? 'video' :
    registration.domElement instanceof HTMLCanvasElement ? 'canvas' : null;

  if (elementType === null) {
    const error = OverlayError.invalidElementType(
      registration.id,
      `Cannot render <${registration.domElement.tagName.toLowerCase()}>: ` +
        'only <img>, <video> and <canvas> are supported'
    );
    console.error(`[WebGLOverlay] ${error.message}`);
    options.onError?.(error);
    return error;
  }

  // Register with overlay - call with correct three-parameter signature.
  //
  // `onTextureLoaded` is forwarded rather than timed. It used to be fired here
  // from `setTimeout(…, 100)` under a TODO admitting it, which reported success
  // on CORS rejection, on an oversize texture and on an unloaded image — and
  // early for anything slower than 100ms. Only the overlay knows when the async
  // creation settled, so it owns the callback now.
  const result = overlay.registerElement(
    registration.id,
    registration.domElement,
    {
      type: elementType,
      shader: registration.shader,
      updateStrategy: registration.updateStrategy,
      onTextureLoaded: registration.onTextureLoaded
    }
  );

  // The core already routed this through `onError`; the return value was
  // dropped on the floor, so a caller had no way to know either.
  if (result instanceof OverlayError) {
    console.error('[WebGLOverlay] Failed to register element:', result.toString());
  }

  return result;
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
  overlay?.updateElementPosition(id);
}

/**
 * Public API - Re-read an element's texture
 *
 * The trigger for the `manual` update strategy, which is what a `<canvas>`
 * element gets by default. Without this exposed, a registered canvas took its
 * texture once at registration and then never changed again — the strategy was
 * reachable and the only thing that could service it was not.
 */
export function updateElement(id: string): void {
  overlay?.updateElement(id);
}

/**
 * Public API - Set shader uniforms without recompiling
 *
 * `updateElementShader` recompiles; this changes the values the existing
 * program is fed on the next frame, which is how a shader parameter is driven
 * over time.
 */
export function updateUniforms(id: string, uniforms: Record<string, number | number[]>): void {
  overlay?.updateUniforms(id, uniforms);
}

/**
 * Public API - Read back a single element's registration
 *
 * Carries the resolved shader, the current bounds and any `OverlayError` that
 * texture creation produced.
 */
export function getElement(id: string): ElementRegistration | undefined {
  return overlay?.getElement(id);
}

/**
 * Public API - Read back every registration
 */
export function getElements(): ReadonlyArray<ElementRegistration> {
  return overlay?.getElements() ?? [];
}

/**
 * Public API - The canvas being rendered to
 */
export function getCanvas(): HTMLCanvasElement | null {
  return overlay?.getCanvas() ?? null;
}

/**
 * Public API - The WebGL context, for drawing alongside the overlay
 */
export function getContext(): WebGLRenderingContext | null {
  return overlay?.getContext() ?? null;
}

/**
 * Public API - Measured frames per second
 */
export function getCurrentFPS(): number {
  return overlay?.getCurrentFPS() ?? 0;
}

/**
 * Public API - Start the render loop
 *
 * Mounting starts it already. This is for restarting after `stop()`.
 */
export function start(): void {
  overlay?.start();
}

/**
 * Public API - Pause the render loop
 *
 * The registrations survive; nothing is drawn until `start()`. Unmounting
 * stops and destroys, so this is for pausing a live overlay — off-screen, or
 * on battery.
 */
export function stop(): void {
  overlay?.stop();
}

/**
 * Public API - Whether the render loop is running
 */
export function isRunning(): boolean {
  return overlay?.isRunning() ?? false;
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
