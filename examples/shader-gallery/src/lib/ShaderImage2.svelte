<script lang="ts">
/**
 * ShaderImage - Image component that registers with shader gallery
 * Follows same pattern as Mesh.svelte from graphics package
 */

import { onMount, getContext } from 'svelte';

let {
  id,
  src,
  alt
}: {
  id: string;
  src: string;
  alt: string;
} = $props();

// Get gallery context
const gallery = getContext<{
  registerImageElement: (id: string, element: HTMLImageElement, src: string, onTextureLoaded?: () => void) => void;
  unregisterImageElement: (id: string) => void;
  updateImageElementBounds: (id: string, bounds: DOMRect) => void;
}>('shader-gallery');

let imgRef: HTMLImageElement | null = $state(null);
let webglLoaded = $state(false);

onMount(() => {
  if (!imgRef || !gallery) return;

  // Register image when loaded
  const handleLoad = () => {
    if (!imgRef) return;
    // Pass callback to fade out DOM image only after WebGL texture is loaded
    gallery.registerImageElement(id, imgRef, src, () => {
      webglLoaded = true;
    });
  };

  if (imgRef.complete) {
    handleLoad();
  } else {
    imgRef.addEventListener('load', handleLoad);
  }

  // Update bounds every frame for smooth scrolling
  let frameId: number;
  const updateBounds = () => {
    if (!imgRef) return;

    const bounds = imgRef.getBoundingClientRect();
    gallery.updateImageElementBounds(id, bounds);

    frameId = requestAnimationFrame(updateBounds);
  };
  updateBounds();

  return () => {
    cancelAnimationFrame(frameId);
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
