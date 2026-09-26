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

import { onMount, onDestroy, untrack } from 'svelte';
import type { MapStore, GeoJSON, LayerStyle } from '../types/map.types.js';

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
  store: MapStore;
  id: string;
  data: GeoJSON | string;
  visible?: boolean | undefined;
  interactive?: boolean | undefined;
  fillColor?: string | undefined;
  fillOpacity?: number | undefined;
  strokeColor?: string | undefined;
  strokeWidth?: number | undefined;
  strokeOpacity?: number | undefined;
} = $props();

// Build layer style from props
const style = $derived<LayerStyle>({
  fillColor,
  fillOpacity,
  strokeColor,
  strokeWidth,
  strokeOpacity
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
      type: 'geojson',
      data,
      style,
      visible,
      interactive
    }
  });
  return unsubscribe;
});

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

<!-- GeoJSON layers render through MapPrimitive via state sync -->
