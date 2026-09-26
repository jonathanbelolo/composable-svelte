<script lang="ts">
/**
 * ShaderGallery - Root component for hybrid DOM/WebGL rendering
 * Simplified using WebGLOverlay from graphics package
 */

import { setContext } from 'svelte';
import type { Snippet } from 'svelte';
import type { Store } from '@composable-svelte/core';
import { WebGLOverlay, OverlayError, type ShaderEffect } from '@composable-svelte/graphics';
import type { ShaderGalleryState, ShaderGalleryAction } from './shader-types';
import { GALLERY_CONTEXT_KEY, passthroughShader, type ShaderGalleryContext } from './gallery-context';

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

// WebGLOverlay component reference
let overlayComponent: WebGLOverlay | null = $state(null);

// Context loss uses a stable plain-image recovery policy for this mount.
// onContextRestored precedes async texture readiness, so it must not re-hide DOM.
let fallback = $state(false);
function loseEnhancement(): void {
  fallback = true;
  overlayComponent?.stop();
}

// Track registered image elements
const imageElements = new Map<string, HTMLImageElement>();

/**
 * Register an image element - called by ShaderImage2 components
 */
function registerImageElement(
  id: string,
  element: HTMLImageElement,
  src: string,
  shader: ShaderEffect | undefined,
  onTextureLoaded?: () => void
): boolean {
  if (!overlayComponent) {
    console.warn('[ShaderGallery] Overlay not initialized yet');
    return false;
  }

  // Register with WebGLOverlay
  const result = overlayComponent.registerElement({
    id,
    domElement: element,
    shader: shader ?? passthroughShader,
    ...(onTextureLoaded !== undefined && { onTextureLoaded })
  });

  if (result instanceof OverlayError) {
    return false;
  }

  imageElements.set(id, element);
  store.dispatch({ type: 'registerImage', id, src });
  return true;
}

/**
 * Unregister an image element
 */
function unregisterImageElement(id: string, element: HTMLImageElement): void {
  if (imageElements.get(id) !== element) {
    return;
  }
  imageElements.delete(id);
  overlayComponent?.unregisterElement(id);
  store.dispatch({ type: 'unregisterImage', id });
}

/**
 * Update shader for an image element
 */
function updateImageShader(id: string, shader: ShaderEffect | undefined): void {
  if (!overlayComponent) {
    console.warn('[ShaderGallery] Overlay not initialized yet');
    return;
  }
  overlayComponent.updateElementShader(id, shader ?? passthroughShader);
}

/**
 * Update position for an image element
 * Useful when CSS transforms move the element
 */
function updateImagePosition(id: string): void {
  if (!overlayComponent) {
    console.warn('[ShaderGallery] Overlay not initialized yet');
    return;
  }
  overlayComponent.updateElementPosition(id);
}

// Provide gallery methods to child components
setContext<ShaderGalleryContext>(GALLERY_CONTEXT_KEY, {
  isFallback: () => fallback,
  registerImageElement,
  unregisterImageElement,
  updateImageShader,
  updateImagePosition
});

// Format width/height reactively
const widthStyle = $derived(typeof width === 'number' ? `${width}px` : width);
const heightStyle = $derived(typeof height === 'number' ? `${height}px` : height);
</script>

<style>
  .gallery-container {
    position: relative;
    min-height: 100vh;
  }

  .gallery-content {
    position: relative;
    z-index: 1;
  }
</style>

<div
  class="gallery-container"
  style:width={widthStyle}
  style:min-height={heightStyle}
>
  <!-- WebGLOverlay handles canvas and rendering -->
  <WebGLOverlay bind:this={overlayComponent} options={{ onContextLost: loseEnhancement }} />

  <!-- Gallery content (images in DOM) -->
  <div class="gallery-content">
    {@render children?.()}
  </div>
</div>
