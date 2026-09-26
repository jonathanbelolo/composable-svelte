<script lang="ts">
import { getContext } from 'svelte';
import type { PresentationFeatureViewProps, ChildView } from '@composable-svelte/core/application';
import type { MapState, MapAction, MapAdapter } from '../../src/lib/types/map.types.js';
import MapPrimitive from '../../src/lib/components/MapPrimitive.svelte';
import GeoJSONLayer from '../../src/lib/components/GeoJSONLayer.svelte';
import HeatmapLayer from '../../src/lib/components/HeatmapLayer.svelte';
import Popup from '../../src/lib/components/Popup.svelte';
import TileProviderControl from '../../src/lib/components/TileProviderControl.svelte';

let {
  store,
  surface
}: PresentationFeatureViewProps<MapState, MapAction> = $props();

const getMapAdapter = getContext<(() => MapAdapter | undefined) | undefined>('getMapAdapter');
const adapter = getMapAdapter ? getMapAdapter() : undefined;
const onCaptureMap = getContext<((view: ChildView<MapState, MapAction>) => void) | undefined>('onCaptureMap');
const showDeclarativeControls = getContext<boolean>('showDeclarativeControls');
const pointData = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [12.4924, 41.8902] } }] };
let geojsonData = $state(pointData);

$effect(() => {
  onCaptureMap?.(store);
});
</script>

<div use:surface data-testid="managed-map-feature" style="width: 100%; height: 100%;">
  <MapPrimitive
    {store}
    {adapter}
    onMapClick={(coords) => store.dispatch({ type: 'mapClicked', lngLat: coords })}
  />
  {#if showDeclarativeControls}
    <GeoJSONLayer {store} id="managed-geojson" data={geojsonData} />
    <HeatmapLayer {store} id="managed-heatmap" data={pointData} />
    <Popup {store} id="managed-popup" position={[12.4924, 41.8902]}>Managed popup</Popup>
    <TileProviderControl {store} />
    <button data-testid="update-managed-geojson" onclick={() => {
      geojsonData = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [13, 42] } }] };
    }}>Update test layer</button>
  {/if}
</div>
