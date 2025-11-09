<script lang="ts">
/**
 * Map - High-level wrapper component for interactive maps
 * Provides easy API and handles responsive sizing
 */

import MapPrimitive from './MapPrimitive.svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction } from '../types/map.types';
import type { Snippet } from 'svelte';

// Props
let {
  store,
  width = '100%',
  height = '600px',
  onMapClick,
  children
}: {
  store: Store<MapState, MapAction>;
  width?: string | number;
  height?: string | number;
  onMapClick?: (lngLat: [number, number]) => void;
  children?: Snippet;
} = $props();

// Computed styles
const widthStyle = typeof width === 'number' ? `${width}px` : width;
const heightStyle = typeof height === 'number' ? `${height}px` : height;
</script>

<div
  class="map-container"
  style="width: {widthStyle}; height: {heightStyle};"
  role="application"
  aria-label="Interactive map with {$store.markers.length} markers"
>
  <MapPrimitive {store} />
  {@render children?.()}
</div>

<style>
  .map-container {
    position: relative;
    overflow: hidden;
  }
</style>
