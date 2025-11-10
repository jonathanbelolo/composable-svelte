<script lang="ts">
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

let imgRef: HTMLImageElement | null = $state(null);

// Get overlay API from context
const overlay = getContext<{
  registerImage: (id: string, img: HTMLImageElement) => void;
  unregisterImage: (id: string) => void;
  updateImageBounds: (id: string, bounds: DOMRect) => void;
}>('webgl-overlay');

onMount(() => {
  if (!imgRef || !overlay) return;

  // Wait for image to load
  const handleLoad = () => {
    if (!imgRef) return;
    overlay.registerImage(id, imgRef);
  };

  if (imgRef.complete) {
    handleLoad();
  } else {
    imgRef.addEventListener('load', handleLoad);
  }

  // Update bounds on resize (overlay handles this, but we can trigger)
  const resizeObserver = new ResizeObserver(() => {
    if (!imgRef) return;
    const bounds = imgRef.getBoundingClientRect();
    overlay.updateImageBounds(id, bounds);
  });

  resizeObserver.observe(imgRef);

  return () => {
    overlay.unregisterImage(id);
    resizeObserver.disconnect();
    if (imgRef) {
      imgRef.removeEventListener('load', handleLoad);
    }
  };
});
</script>

<style>
  .image-wrapper {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    transition: transform 0.3s, box-shadow 0.3s;
  }

  .image-wrapper:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
  }

  img {
    width: 100%;
    height: auto;
    display: block;
    transition: opacity 0.3s;
  }
</style>

<div class="image-wrapper">
  <img
    bind:this={imgRef}
    {src}
    {alt}
    crossorigin="anonymous"
  />
</div>
