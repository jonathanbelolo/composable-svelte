<script lang="ts">
/**
 * HeatmapLayer - Declarative component for adding heatmap layers to maps
 *
 * Usage:
 * <HeatmapLayer
 *   {store}
 *   id="crime-heatmap"
 *   data={crimeData}
 *   intensity={0.9}
 *   radius={20}
 *   colorGradient={[[0, 'rgba(0,0,255,0)'], [0.5, 'rgba(0,255,0,1)'], [1, 'rgba(255,0,0,1)']]}
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
  interactive = false,
  intensity,
  radius,
  colorGradient
}: {
  store: Store<MapState, MapAction>;
  id: string;
  data: GeoJSON | string;
  visible?: boolean;
  interactive?: boolean;
  intensity?: number;
  radius?: number;
  colorGradient?: [number, string][];
} = $props();

// Build layer style from props
const style = $derived<LayerStyle>({
  intensity,
  radius,
  colorGradient
});

// Add layer on mount
onMount(() => {
  store.dispatch({
    type: 'addLayer',
    layer: {
      id,
      type: 'heatmap',
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

<!-- Heatmap layers render through MapPrimitive via state sync -->
