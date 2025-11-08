/**
 * @composable-svelte/maps
 * Interactive map components for Composable Svelte
 * Built with Maplibre GL and Mapbox GL
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================
export type {
  MapProvider,
  LngLat,
  BBox,
  MapViewport,
  Marker,
  GeoJSON,
  LayerStyle,
  Layer,
  Popup,
  FeatureReference,
  MapState,
  MapAction,
  FlyToOptions,
  MapAdapter,
  MapInitOptions
} from './types/map.types';

// ============================================================================
// Reducers
// ============================================================================
export { mapReducer, createInitialMapState } from './reducers/map.reducer';

// ============================================================================
// Components
// ============================================================================
export { default as Map } from './components/Map.svelte';
export { default as MapPrimitive } from './components/MapPrimitive.svelte';
export { default as GeoJSONLayer } from './components/GeoJSONLayer.svelte';
export { default as HeatmapLayer } from './components/HeatmapLayer.svelte';
export { default as MapPopup } from './components/Popup.svelte';

// ============================================================================
// Utils
// ============================================================================
export { createMapAdapter } from './utils/map-adapter';
export { MaplibreAdapter } from './utils/maplibre-adapter';
