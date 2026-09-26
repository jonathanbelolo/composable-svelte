<script lang="ts">
/**
 * Map - High-level wrapper component for interactive maps
 * Provides easy API and handles responsive sizing
 */

import MapPrimitive from './MapPrimitive.svelte';
import type { MapAdapter, MapStore } from '../types/map.types.js';
import type { Snippet } from 'svelte';

// Props
let {
  store,
  width = '100%',
  height = '600px',
  adapter,
  onMapClick,
  children
}: {
  store: MapStore;
  width?: string | number | undefined;
  height?: string | number | undefined;
  /** The map engine to drive; defaults to MapLibre. See `MapPrimitive`. */
  adapter?: MapAdapter | undefined;
  onMapClick?: ((lngLat: [number, number]) => void) | undefined;
  children?: Snippet | undefined;
} = $props();

// Computed styles
const widthStyle = typeof width === 'number' ? `${width}px` : width;
const heightStyle = typeof height === 'number' ? `${height}px` : height;
const markerCount = $derived($store?.markers?.length ?? 0);
</script>

<div
  class="map-container"
  style="width: {widthStyle}; height: {heightStyle};"
  role="application"
  aria-label="Interactive map with {markerCount} markers"
>
  <MapPrimitive {store} {adapter} {onMapClick} />
  {@render children?.()}
</div>

<style>
  .map-container {
    position: relative;
    overflow: hidden;
  }
</style>
