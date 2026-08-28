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
  TileProvider,
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
} from './types/map.types.js';

export type { TileProviderConfig } from './utils/tile-providers.js';

// ============================================================================
// Reducers
// ============================================================================
export { mapReducer, createInitialMapState } from './reducers/map.reducer.js';

// ============================================================================
// Components
// ============================================================================
export { default as Map } from './components/Map.svelte';
export { default as MapPrimitive } from './components/MapPrimitive.svelte';
export { default as GeoJSONLayer } from './components/GeoJSONLayer.svelte';
export { default as HeatmapLayer } from './components/HeatmapLayer.svelte';
export { default as MapPopup } from './components/Popup.svelte';
export { default as TileProviderControl } from './components/TileProviderControl.svelte';

// ============================================================================
// Utils
// ============================================================================
export { MaplibreAdapter } from './utils/maplibre-adapter.js';
export {
  TILE_PROVIDERS,
  getTileProviderConfig,
  getStyleURL,
  getAvailableTileProviders,
  requiresAPIKey
} from './utils/tile-providers.js';
