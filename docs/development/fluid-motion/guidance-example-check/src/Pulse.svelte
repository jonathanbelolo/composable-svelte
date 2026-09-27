<script lang="ts">
  import { onMount } from 'svelte';
  import { useRepresentationProvider } from '@composable-svelte/core/application/motion';
  import { pulseArt, type PulseProvider } from './visual.js';

  // The provider this application configured, or undefined (outside a Host, in SSR, or without `visual`).
  const provider = useRepresentationProvider<PulseProvider>('pulse');
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const paint = canvas.getContext('2d');
    const unregister = provider?.register(canvas, pulseArt);
    let handle = requestAnimationFrame(function loop(time) {
      if (paint) pulseArt(paint, time);
      handle = requestAnimationFrame(loop);
    });
    // Ordinary teardown: the provider's representation has its own canvas and lifetime.
    return () => { cancelAnimationFrame(handle); unregister?.(); };
  });
</script>

<canvas bind:this={canvas} width="48" height="8" aria-hidden="true"></canvas>
