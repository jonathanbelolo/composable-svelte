<script lang="ts">
  import { Map, MapPrimitive, GeoJSONLayer, HeatmapLayer, MapPopup, TileProviderControl, type MapState, type MapAction } from '@composable-svelte/maps';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { ComponentProps } from 'svelte';
  let { store, surface }: PresentationFeatureViewProps<MapState, MapAction> = $props();
  function assertProps(view: PresentationFeatureViewProps<MapState, MapAction>['store']) {
    const _map: ComponentProps<typeof Map>['store'] = view;
    const _primitive: ComponentProps<typeof MapPrimitive>['store'] = view;
    const _geo: ComponentProps<typeof GeoJSONLayer>['store'] = view;
    const _heat: ComponentProps<typeof HeatmapLayer>['store'] = view;
    const _popup: ComponentProps<typeof MapPopup>['store'] = view;
    const _control: ComponentProps<typeof TileProviderControl>['store'] = view;
    return [_map, _primitive, _geo, _heat, _popup, _control];
  }
  const pointData = { type: 'FeatureCollection' as const, features: [] };
</script>
<div use:surface>
  <Map {store} onMapClick={(lngLat) => store.dispatch({ type: 'mapClicked', lngLat })} />
  <GeoJSONLayer {store} id="geo" data={pointData} />
  <HeatmapLayer {store} id="heat" data={pointData} />
  <MapPopup {store} id="popup" position={[0, 0]}>Installed popup</MapPopup>
  <TileProviderControl {store} />
</div>
