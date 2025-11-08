<script lang="ts">
/**
 * Map - High-level wrapper component for interactive maps
 * Provides easy API and handles responsive sizing
 */

import MapPrimitive from './MapPrimitive.svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction } from '../types/map.types';

// Props
let {
  store,
  width = '100%',
  height = '600px',
  onMapClick
}: {
  store: Store<MapState, MapAction>;
  width?: string | number;
  height?: string | number;
  onMapClick?: (lngLat: [number, number]) => void;
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
</div>

<style>
  .map-container {
    position: relative;
    overflow: hidden;
  }
</style>
