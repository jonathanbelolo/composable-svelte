<script lang="ts">
/**
 * ShaderGallery - Root component for hybrid DOM/WebGL rendering
 * Simplified using WebGLOverlay from graphics package
 */

import { setContext } from 'svelte';
import type { Snippet } from 'svelte';
import type { Store } from '@composable-svelte/core';
import { WebGLOverlay } from '@composable-svelte/graphics';
import type { ShaderGalleryState, ShaderGalleryAction } from './shader-types';

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

// Track registered image elements
const imageElements = new Map<string, HTMLImageElement>();

/**
 * Register an image element - called by ShaderImage2 components
 */
function registerImageElement(
  id: string,
  element: HTMLImageElement,
  src: string,
  shader: any,
  onTextureLoaded?: () => void
): void {
  if (!overlayComponent) {
    console.warn('[ShaderGallery] Overlay not initialized yet');
    return;
  }

  // Store element reference
  imageElements.set(id, element);

  // Register with WebGLOverlay
  overlayComponent.registerElement({
    id,
    domElement: element,
    shader,
    onTextureLoaded
  });

  // Dispatch to store for tracking
  const bounds = element.getBoundingClientRect();
  store.dispatch({ type: 'registerImage', id, src, element });
}

/**
 * Unregister an image element
 */
function unregisterImageElement(id: string): void {
  imageElements.delete(id);
  overlayComponent?.unregisterElement(id);
  store.dispatch({ type: 'unregisterImage', id });
}

// Provide gallery methods to child components
setContext('shader-gallery', {
  registerImageElement,
  unregisterImageElement
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

  .gallery-content {
    position: relative;
    z-index: 1;
  }
</style>

<div class="gallery-container">
  <!-- WebGLOverlay handles canvas and rendering -->
  <WebGLOverlay bind:this={overlayComponent} />

  <!-- Gallery content (images in DOM) -->
  <div class="gallery-content">
    {@render children?.()}
  </div>
</div>
