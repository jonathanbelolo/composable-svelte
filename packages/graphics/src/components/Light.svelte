<script lang="ts">
/**
 * Light - Declarative light component
 * Adds light to scene via store
 */

import { onMount, onDestroy } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction, LightConfig } from '../core/types';

// Props
let {
  store,
  type,
  position,
  direction,
  angle,
  intensity,
  radius,
  color
}: {
  store: Store<GraphicsState, GraphicsAction>;
  type: 'directional' | 'point' | 'spot' | 'ambient';
  position?: [number, number, number];
  direction?: [number, number, number];
  angle?: number;
  intensity: number;
  radius?: number;
  color?: string;
} = $props();

// Build light config
const lightConfig = $derived(
  (() => {
    switch (type) {
      case 'ambient':
        return { type, intensity, color } as LightConfig;
      case 'directional':
        return { type, position: position || [0, 1, 0], intensity, color } as LightConfig;
      case 'point':
        return { type, position: position || [0, 1, 0], intensity, radius, color } as LightConfig;
      case 'spot':
        return {
          type,
          position: position || [0, 1, 0],
          direction: direction || [0, -1, 0],
          angle: angle || Math.PI / 4,
          intensity,
          color
        } as LightConfig;
    }
  })()
);

// Track light index
let lightIndex = $state(-1);

// Add light on mount
onMount(() => {
  store.dispatch({
    type: 'addLight',
    light: lightConfig
  });

  // Store the index (last added light)
  lightIndex = store.state.lights.length - 1;
});

// Remove light on unmount
onDestroy(() => {
  if (lightIndex >= 0) {
    store.dispatch({
      type: 'removeLight',
      index: lightIndex
    });
  }
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Light component updates state only, no visual output -->
