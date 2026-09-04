<script lang="ts">
/**
 * ShaderImage - Image component that registers with shader gallery
 * Simplified using WebGLOverlay API
 */

import { onMount, getContext } from 'svelte';
import { animateFadeOut } from '@composable-svelte/core/animation';
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
  // Optional: the gallery's "None" option produces no shader, and that is a
  // state the app can actually reach.
  shader?: string | CustomShaderEffect | undefined;
} = $props();

// Get gallery context
const gallery = getContext<{
  registerImageElement: (
    id: string,
    element: HTMLImageElement,
    src: string,
    shader: string | CustomShaderEffect | undefined,
    onTextureLoaded?: () => void
  ) => void;
  unregisterImageElement: (id: string) => void;
  updateImageShader: (id: string, shader: string | CustomShaderEffect | undefined) => void;
  updateImagePosition: (id: string) => void;
}>('shader-gallery');

let imgRef: HTMLImageElement | null = $state(null);
let wrapperRef: HTMLDivElement | null = $state(null);
let webglLoaded = $state(false);

// The DOM image fades out once the WebGL texture has taken over. That is a
// state-driven lifecycle, so it belongs to Motion One rather than a CSS
// transition the store cannot see — and `animateFadeOut` honours
// `prefers-reduced-motion` by writing the end state, which a `transition` on a
// class toggle could not.
//
// A plain `let`, never `$state`: a reactive guard would re-trigger the effect it
// lives in.
let hasFadedOut = false;
let isRegistered = $state(false);

// Watch for shader changes and update WebGL overlay
$effect(() => {
  if (isRegistered && gallery) {
    gallery.updateImageShader(id, shader);
  }
});

$effect(() => {
  if (hasFadedOut || !webglLoaded || !imgRef) return;
  hasFadedOut = true;
  animateFadeOut(imgRef);
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

  // Re-sync the WebGL overlay to the wrapper's new position on hover.
  //
  // This used to be a 300ms `requestAnimationFrame` loop on each handler,
  // "matching the CSS transition duration" — the `transition: transform 0.3s`
  // on `.shader-image-wrapper:hover`. That transition is gone: it was
  // pseudo-class-driven, which the animation policy prohibits, so the transform
  // now lands in a single frame. The loops were spending ~18 frames each
  // tracking something that had already finished, and the two comments naming
  // the transition outlived it.
  const syncOverlayPosition = () => {
    if (gallery && isRegistered) gallery.updateImagePosition(id);
  };

  const handleMouseEnter = syncOverlayPosition;
  const handleMouseLeave = syncOverlayPosition;

  if (wrapperRef) {
    wrapperRef.addEventListener('mouseenter', handleMouseEnter);
    wrapperRef.addEventListener('mouseleave', handleMouseLeave);
  }

  return () => {
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
  }

  .shader-image-wrapper:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
  }

  img {
    width: 100%;
    height: auto;
    display: block;
  }
</style>

<div class="shader-image-wrapper" bind:this={wrapperRef}>
  <img
    bind:this={imgRef}
    {src}
    {alt}
    crossorigin="anonymous"
  />
</div>
