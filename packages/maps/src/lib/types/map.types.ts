/**
 * @file map.types.ts
 * @description Type definitions for interactive map components
 */

import type { TileProvider } from '../utils/tile-providers';

/**
 * Map provider type
 */
export type MapProvider = 'maplibre' | 'mapbox';

// Re-export TileProvider for convenience
export type { TileProvider };

/**
 * Longitude, Latitude coordinate pair
 */
export type LngLat = [number, number];

/**
 * Bounding box: [[west, south], [east, north]]
 */
export type BBox = [[number, number], [number, number]];

/**
 * Map viewport state
 */
export interface MapViewport {
  center: LngLat;
  zoom: number;
  bearing: number;  // rotation in degrees
  pitch: number;    // tilt in degrees (0-60)
  bounds?: BBox;
}

/**
 * Marker definition
 */
export interface Marker {
  id: string;
  position: LngLat;
  icon?: string;  // URL or data URI
  draggable?: boolean;
  data?: any;     // Custom data attached to marker
  popup?: {
    content: string;
    isOpen: boolean;
  };
}

/**
 * GeoJSON types
 */
export type GeoJSON = any; // Full GeoJSON type would be complex, using any for now

/**
 * Layer style properties
 */
export interface LayerStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  radius?: number;          // For points
  intensity?: number;       // For heatmaps
  colorGradient?: [number, string][]; // For heatmaps: [[0, 'blue'], [1, 'red']]
}

/**
 * Map layer definition
 */
export interface Layer {
  id: string;
  type: 'geojson' | 'heatmap';
  data: GeoJSON | string;  // GeoJSON object or URL
  style: LayerStyle;
  visible: boolean;
  interactive: boolean;
}

/**
 * Popup definition
 */
export interface Popup {
  id: string;
  position: LngLat;
  content: string;
  isOpen: boolean;
  closeButton?: boolean;
  closeOnClick?: boolean;
}

/**
 * Feature reference (for hover/click interactions)
 */
export interface FeatureReference {
  layer: string;
  featureId: string | number;
  data?: any;
}

/**
 * Map state structure
 */
export interface MapState {
  // Provider
  provider: MapProvider;
  accessToken?: string;

  // Tile provider
  tileProvider: TileProvider;
  customTileURL?: string;
  customAttribution?: string;

  // Viewport
  viewport: MapViewport;

  // Interaction state
  isInteractive: boolean;
  isDragging: boolean;
  isZooming: boolean;

  // Markers
  markers: Marker[];

  // Layers
  layers: Layer[];

  // Popups
  popups: Popup[];

  // Feature interactions
  hoveredFeature: FeatureReference | null;
  selectedFeatures: FeatureReference[];

  // Map settings
  style: string;  // Map style URL

  // Loading state
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Map actions
 */
export type MapAction =
  // Viewport actions
  | { type: 'setCenter'; center: LngLat }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setBearing'; bearing: number }
  | { type: 'setPitch'; pitch: number }
  | { type: 'fitBounds'; bounds: BBox; padding?: number }
  | { type: 'flyTo'; center: LngLat; zoom?: number; duration?: number }
  | { type: 'resetNorth' }

  // Interaction actions
  | { type: 'panStart'; position: LngLat }
  | { type: 'panMove'; delta: [number, number] }
  | { type: 'panEnd' }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' }

  // Marker actions
  | { type: 'addMarker'; marker: Marker }
  | { type: 'removeMarker'; id: string }
  | { type: 'updateMarker'; id: string; updates: Partial<Marker> }
  | { type: 'moveMarker'; id: string; position: LngLat }
  | { type: 'clearMarkers' }

  // Layer actions
  | { type: 'addLayer'; layer: Layer }
  | { type: 'removeLayer'; id: string }
  | { type: 'toggleLayerVisibility'; id: string }
  | { type: 'updateLayerStyle'; id: string; style: Partial<LayerStyle> }
  | { type: 'clearLayers' }

  // Popup actions
  | { type: 'openPopup'; popup: Popup }
  | { type: 'closePopup'; id: string }
  | { type: 'closeAllPopups' }

  // Feature interaction actions
  | { type: 'featureHovered'; feature: FeatureReference }
  | { type: 'featureUnhovered' }
  | { type: 'featureClicked'; feature: FeatureReference }
  | { type: 'clearSelection' }

  // Viewport change (dispatched by map component)
  | { type: 'viewportChanged'; viewport: MapViewport }

  // Map lifecycle actions
  | { type: 'mapLoaded' }
  | { type: 'mapError'; error: string }
  | { type: 'changeStyle'; style: string }

  // Tile provider actions
  | { type: 'changeTileProvider'; provider: TileProvider; customURL?: string; customAttribution?: string };

/**
 * Fly-to animation options
 */
export interface FlyToOptions {
  center: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  duration?: number;
  essential?: boolean;
}

/**
 * Map adapter interface
 * Abstract interface for map providers (Maplibre, Mapbox)
 */
export interface MapAdapter {
  initialize(container: HTMLElement, options: MapInitOptions): void;
  setCenter(center: LngLat): void;
  setZoom(zoom: number): void;
  setBearing(bearing: number): void;
  setPitch(pitch: number): void;
  flyTo(options: FlyToOptions): void;
  fitBounds(bounds: BBox, padding?: number): void;
  getCenter(): LngLat;
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  addMarker(marker: Marker): void;
  removeMarker(id: string): void;
  updateMarker(id: string, updates: Partial<Marker>): void;
  addLayer(layer: Layer): void;
  removeLayer(id: string): void;
  toggleLayerVisibility(id: string): void;
  updateLayerStyle(id: string, style: Partial<LayerStyle>): void;
  openPopup(popup: Popup): void;
  closePopup(id: string): void;
  changeStyle(styleURL: string): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  destroy(): void;
}

/**
 * Map initialization options
 */
export interface MapInitOptions {
  center: LngLat;
  zoom: number;
  bearing?: number;
  pitch?: number;
  style: string;
  accessToken?: string;
  interactive?: boolean;
}
