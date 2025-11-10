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
}>('shader-gallery');

let imgRef: HTMLImageElement | null = $state(null);
let webglLoaded = $state(false);

onMount(() => {
  if (!imgRef || !gallery) return;

  // Register image when loaded
  const handleLoad = () => {
    if (!imgRef) return;
    // Pass callback to fade out DOM image only after WebGL texture is loaded
    gallery.registerImageElement(id, imgRef, src, shader, () => {
      webglLoaded = true;
    });
  };

  if (imgRef.complete) {
    handleLoad();
  } else {
    imgRef.addEventListener('load', handleLoad);
  }

  return () => {
    gallery.unregisterImageElement(id);
    if (imgRef) {
      imgRef.removeEventListener('load', handleLoad);
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

<div class="shader-image-wrapper">
  <img
    bind:this={imgRef}
    {src}
    {alt}
    class:webgl-loaded={webglLoaded}
    crossorigin="anonymous"
  />
</div>
