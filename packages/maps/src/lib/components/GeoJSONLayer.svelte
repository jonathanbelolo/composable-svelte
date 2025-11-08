<script lang="ts">
/**
 * GeoJSONLayer - Declarative component for adding GeoJSON layers to maps
 *
 * Usage:
 * <GeoJSONLayer
 *   {store}
 *   id="my-layer"
 *   data={geojsonData}
 *   fillColor="#0080ff"
 *   fillOpacity={0.5}
 *   strokeColor="#000"
 *   strokeWidth={2}
 * />
 */

import { onMount, onDestroy } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction, GeoJSON, LayerStyle } from '../types/map.types';

// Props
let {
  store,
  id,
  data,
  visible = true,
  interactive = true,
  fillColor,
  fillOpacity,
  strokeColor,
  strokeWidth,
  strokeOpacity
}: {
  store: Store<MapState, MapAction>;
  id: string;
  data: GeoJSON | string;
  visible?: boolean;
  interactive?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
} = $props();

// Build layer style from props
const style = $derived<LayerStyle>({
  fillColor,
  fillOpacity,
  strokeColor,
  strokeWidth,
  strokeOpacity
});

// Add layer on mount
onMount(() => {
  store.dispatch({
    type: 'addLayer',
    layer: {
      id,
      type: 'geojson',
      data,
      style,
      visible,
      interactive
    }
  });
});

// Update layer when props change
$effect(() => {
  store.dispatch({
    type: 'updateLayerStyle',
    id,
    style
  });
});

// Remove layer on unmount
onDestroy(() => {
  store.dispatch({
    type: 'removeLayer',
    id
  });
});
</script>

<!-- GeoJSON layers render through MapPrimitive via state sync -->
