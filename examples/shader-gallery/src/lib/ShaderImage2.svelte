<script lang="ts">
/**
 * ShaderImage - Image component that registers with shader gallery
 * Simplified using WebGLOverlay API
 */

import { getContext, untrack, onMount } from 'svelte';
import { animateFadeOut, animateFadeIn } from '@composable-svelte/core/animation';
import type { ShaderEffect } from '@composable-svelte/graphics';
import { GALLERY_CONTEXT_KEY, type ShaderGalleryContext } from './gallery-context';

let { id, src, alt, shader }: {
  id: string;
  src: string;
  alt: string;
  shader?: ShaderEffect | undefined;
} = $props();
const gallery = getContext<ShaderGalleryContext | undefined>(GALLERY_CONTEXT_KEY);
let wrapperRef: HTMLDivElement | null = $state(null);
let imgRef: HTMLImageElement | null = $state(null);
let registration = $state.raw<{
  id: string;
  element: HTMLImageElement;
  shader: ShaderEffect | undefined;
  fade: AbortController;
  reveal: AbortController;
} | null>(null);

// DOM source lifetimes are kept in this rendering integration. The overlay
// owns texture creation and position tracking; the reducer receives no DOM.
$effect(() => {
  const currentId = id;
  const currentSrc = src;
  const element = imgRef;
  if (!element || !gallery) return;
  let active = true;
  let registered = false;
  let faded = false;
  const fade = new AbortController();
  const reveal = new AbortController();
  const load = () => {
    if (!active || registered || !element.complete || element.naturalWidth === 0) return;
    const currentShader = untrack(() => shader);
    registered = untrack(() => gallery.registerImageElement(
      currentId, element, currentSrc, currentShader,
      () => {
        if (!active || faded || gallery.isFallback()) return;
        faded = true;
        void animateFadeOut(element, { signal: fade.signal });
      }
    ));
    if (registered) registration = { id: currentId, element, shader: currentShader, fade, reveal };
  };
  element.addEventListener('load', load);
  untrack(load);
  return () => {
    active = false;
    fade.abort();
    reveal.abort();
    element.removeEventListener('load', load);
    if (registered) gallery.unregisterImageElement(currentId, element);
    registration = null;
  };
});

$effect(() => {
  const current = registration;
  const currentShader = shader;
  if (current && gallery && !Object.is(current.shader, currentShader)) {
    untrack(() => gallery.updateImageShader(current.id, currentShader));
    current.shader = currentShader;
  }
});
$effect(() => {
  const current = registration;
  if (current && gallery?.isFallback()) {
    current.fade.abort();
    void animateFadeIn(current.element, { duration: 0, signal: current.reveal.signal });
  }
});
function syncOverlayPosition(): void {
  if (registration) gallery?.updateImagePosition(registration.id);
}
onMount(() => {
  const wrapper = wrapperRef;
  wrapper?.addEventListener('mouseenter', syncOverlayPosition);
  wrapper?.addEventListener('mouseleave', syncOverlayPosition);
  return () => {
    wrapper?.removeEventListener('mouseenter', syncOverlayPosition);
    wrapper?.removeEventListener('mouseleave', syncOverlayPosition);
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
  {#key JSON.stringify([id, src])}
  <img
    bind:this={imgRef}
    {src}
    {alt}
    crossorigin="anonymous"
  />
  {/key}
</div>
