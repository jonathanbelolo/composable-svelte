<script lang="ts">
/**
 * ShaderImage - Image component that registers with shader gallery
 * Simplified using WebGLOverlay API
 */

import { onMount, getContext } from 'svelte';
import type { CustomShaderEffect } from '@composable-svelte/graphics';

let {
  id,
  src,
  alt,
  shader
}: {
  id: string;
  src: string;
  alt: string;
  shader: string | CustomShaderEffect;
} = $props();

// Get gallery context
const gallery = getContext<{
  registerImageElement: (
    id: string,
    element: HTMLImageElement,
    src: string,
    shader: string | CustomShaderEffect,
    onTextureLoaded?: () => void
  ) => void;
  unregisterImageElement: (id: string) => void;
  updateImageShader: (id: string, shader: string | CustomShaderEffect) => void;
  updateImagePosition: (id: string) => void;
}>('shader-gallery');

let imgRef: HTMLImageElement | null = $state(null);
let wrapperRef: HTMLDivElement | null = $state(null);
let webglLoaded = $state(false);
let isRegistered = $state(false);

// Watch for shader changes and update WebGL overlay
$effect(() => {
  if (isRegistered && gallery) {
    gallery.updateImageShader(id, shader);
  }
});

onMount(() => {
  if (!imgRef || !gallery) return;

  // Register image when loaded
  const handleLoad = () => {
    if (!imgRef) return;
    // Pass callback to fade out DOM image only after WebGL texture is loaded
    gallery.registerImageElement(id, imgRef, src, shader, () => {
      webglLoaded = true;
    });
    isRegistered = true;
  };

  if (imgRef.complete) {
    handleLoad();
  } else {
    imgRef.addEventListener('load', handleLoad);
  }

  // Track active animations
  let activeAnimation: number | null = null;

  // Add hover listeners to update position during CSS transform
  const handleMouseEnter = () => {
    if (gallery && isRegistered) {
      // Cancel any existing animation
      if (activeAnimation !== null) {
        cancelAnimationFrame(activeAnimation);
      }

      // Update position every frame during the transition
      const startTime = performance.now();
      const duration = 300; // Match CSS transition duration

      const updateFrame = (currentTime: number) => {
        const elapsed = currentTime - startTime;

        if (elapsed < duration) {
          gallery.updateImagePosition(id); // Update position every frame
          activeAnimation = requestAnimationFrame(updateFrame);
        } else {
          // Final update at the end
          gallery.updateImagePosition(id);
          activeAnimation = null;
        }
      };

      activeAnimation = requestAnimationFrame(updateFrame);
    }
  };

  const handleMouseLeave = () => {
    if (gallery && isRegistered) {
      // Cancel any existing animation
      if (activeAnimation !== null) {
        cancelAnimationFrame(activeAnimation);
      }

      // Update position every frame during the transition
      const startTime = performance.now();
      const duration = 300; // Match CSS transition duration

      const updateFrame = (currentTime: number) => {
        const elapsed = currentTime - startTime;

        if (elapsed < duration) {
          gallery.updateImagePosition(id); // Update position every frame
          activeAnimation = requestAnimationFrame(updateFrame);
        } else {
          // Final update at the end
          gallery.updateImagePosition(id);
          activeAnimation = null;
        }
      };

      activeAnimation = requestAnimationFrame(updateFrame);
    }
  };

  if (wrapperRef) {
    wrapperRef.addEventListener('mouseenter', handleMouseEnter);
    wrapperRef.addEventListener('mouseleave', handleMouseLeave);
  }

  return () => {
    // Cancel any active animation
    if (activeAnimation !== null) {
      cancelAnimationFrame(activeAnimation);
      activeAnimation = null;
    }

    gallery.unregisterImageElement(id);
    if (imgRef) {
      imgRef.removeEventListener('load', handleLoad);
    }
    if (wrapperRef) {
      wrapperRef.removeEventListener('mouseenter', handleMouseEnter);
      wrapperRef.removeEventListener('mouseleave', handleMouseLeave);
    }
  };
});
</script>

<style>
  .shader-image-wrapper {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    transition: transform 0.3s, box-shadow 0.3s;
  }

  .shader-image-wrapper:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
  }

  img {
    width: 100%;
    height: auto;
    display: block;
    transition: opacity 0.3s ease;
  }

  img.webgl-loaded {
    opacity: 0;
  }
</style>

<div class="shader-image-wrapper" bind:this={wrapperRef}>
  <img
    bind:this={imgRef}
    {src}
    {alt}
    class:webgl-loaded={webglLoaded}
    crossorigin="anonymous"
  />
</div>
