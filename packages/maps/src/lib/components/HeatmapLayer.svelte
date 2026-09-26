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

import { onMount, onDestroy, untrack } from 'svelte';
import type { MapStore, GeoJSON, LayerStyle } from '../types/map.types.js';

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
  store: MapStore;
  id: string;
  data: GeoJSON | string;
  visible?: boolean | undefined;
  interactive?: boolean | undefined;
  intensity?: number | undefined;
  radius?: number | undefined;
  colorGradient?: [number, string][] | undefined;
} = $props();

// Build layer style from props
const style = $derived<LayerStyle>({
  intensity,
  radius,
  colorGradient
});

let active = store.state !== undefined;

// Add layer on mount
onMount(() => {
  const unsubscribe = store.subscribe((state) => {
    if (state === undefined) active = false;
  });
  if (!active) return unsubscribe;
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
  return unsubscribe;
});

// Track if layer has been mounted
// Read props reactively; dispatch must not subscribe this binding to store state.
$effect(() => {
  const updates = { style, visible, data, interactive };
  const layerId = id;
  untrack(() => {
    if (active) store.dispatch({ type: 'updateLayer', id: layerId, updates });
  });
});

// Remove layer on unmount
onDestroy(() => {
  if (active) store.dispatch({
    type: 'removeLayer',
    id
  });
});
</script>

<!-- Heatmap layers render through MapPrimitive via state sync -->
