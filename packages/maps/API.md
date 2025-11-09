# @composable-svelte/maps API Reference

## Core Types

### `MapState`

The complete state structure for a map.

```typescript
interface MapState {
  // Provider configuration
  provider: 'maplibre' | 'mapbox';
  accessToken?: string;
  tileProvider: TileProvider;
  customTileURL?: string;
  customAttribution?: string;

  // Viewport state
  viewport: MapViewport;

  // Interaction state
  isInteractive: boolean;
  isDragging: boolean;
  isZooming: boolean;

  // Map content
  markers: Marker[];
  layers: Layer[];
  popups: Popup[];

  // Feature interactions
  hoveredFeature: FeatureReference | null;
  selectedFeatures: FeatureReference[];

  // Map settings
  style: string;

  // Loading state
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}
```

### `MapAction`

Discriminated union of all possible map actions.

**Viewport Actions:**
- `{ type: 'setCenter'; center: LngLat }`
- `{ type: 'setZoom'; zoom: number }`
- `{ type: 'setBearing'; bearing: number }`
- `{ type: 'setPitch'; pitch: number }`
- `{ type: 'flyTo'; center: LngLat; zoom?: number; duration?: number }`
- `{ type: 'resetNorth' }`
- `{ type: 'fitBounds'; bounds: BBox; padding?: number }`

**Interaction Actions:**
- `{ type: 'panStart'; position: LngLat }`
- `{ type: 'panMove'; delta: [number, number] }`
- `{ type: 'panEnd' }`
- `{ type: 'zoomIn' }`
- `{ type: 'zoomOut' }`

**Marker Actions:**
- `{ type: 'addMarker'; marker: Marker }`
- `{ type: 'removeMarker'; id: string }`
- `{ type: 'updateMarker'; id: string; updates: Partial<Marker> }`
- `{ type: 'moveMarker'; id: string; position: LngLat }`
- `{ type: 'clearMarkers' }`

**Layer Actions:**
- `{ type: 'addLayer'; layer: Layer }`
- `{ type: 'removeLayer'; id: string }`
- `{ type: 'toggleLayerVisibility'; id: string }`
- `{ type: 'updateLayerStyle'; id: string; style: Partial<LayerStyle> }`
- `{ type: 'clearLayers' }`

**Popup Actions:**
- `{ type: 'openPopup'; popup: Popup }`
- `{ type: 'closePopup'; id: string }`
- `{ type: 'closeAllPopups' }`

**Tile Provider Actions:**
- `{ type: 'changeTileProvider'; provider: TileProvider; customURL?: string; customAttribution?: string }`

**Map Lifecycle:**
- `{ type: 'mapLoaded' }`
- `{ type: 'mapError'; error: string }`
- `{ type: 'changeStyle'; style: string }`
- `{ type: 'viewportChanged'; viewport: MapViewport }`

### Supporting Types

```typescript
type LngLat = [number, number];  // [longitude, latitude]
type BBox = [[number, number], [number, number]];  // [[west, south], [east, north]]

type TileProvider =
  | 'openstreetmap'
  | 'stadia'
  | 'maptiler'
  | 'mapbox'
  | 'carto-light'
  | 'carto-dark'
  | 'custom';

interface MapViewport {
  center: LngLat;
  zoom: number;
  bearing: number;  // 0-360 degrees
  pitch: number;    // 0-60 degrees
  bounds?: BBox;
}

interface Marker<TData = unknown> {
  id: string;
  position: LngLat;
  icon?: string;
  draggable?: boolean;
  data?: TData;
  popup?: {
    content: string;
    isOpen: boolean;
  };
}

interface Layer {
  id: string;
  type: 'geojson' | 'heatmap';
  data: GeoJSON | string;
  style: LayerStyle;
  visible: boolean;
  interactive: boolean;
}

interface LayerStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  radius?: number;
  intensity?: number;
  colorGradient?: [number, string][];
}

interface Popup {
  id: string;
  position: LngLat;
  content: string;
  isOpen: boolean;
  closeButton?: boolean;
  closeOnClick?: boolean;
}
```

## Functions

### `createInitialMapState`

Creates the initial state for a map store.

```typescript
function createInitialMapState(config: {
  provider?: 'maplibre' | 'mapbox';
  accessToken?: string;
  tileProvider?: TileProvider;
  customTileURL?: string;
  customAttribution?: string;
  center?: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  style?: string;
  markers?: Marker[];
  isInteractive?: boolean;
}): MapState
```

**Example:**
```typescript
const initialState = createInitialMapState({
  provider: 'maplibre',
  tileProvider: 'carto-dark',
  center: [-74.006, 40.7128],
  zoom: 12,
  markers: [
    {
      id: 'marker-1',
      position: [-74.006, 40.7128],
      popup: {
        content: '<h3>NYC</h3>',
        isOpen: true
      }
    }
  ]
});
```

### `mapReducer`

The reducer function for map state management.

```typescript
const mapReducer: Reducer<MapState, MapAction, {}>
```

**Usage:**
```typescript
const store = createStore({
  initialState: createInitialMapState({ /* ... */ }),
  reducer: mapReducer,
  dependencies: {}
});
```

### Tile Provider Utilities

```typescript
// Get tile provider configuration
function getTileProviderConfig(provider: TileProvider): TileProviderConfig

// Get style URL for a tile provider
function getStyleURL(
  provider: TileProvider,
  apiKey?: string,
  customURL?: string
): string

// Get list of available tile providers
function getAvailableTileProviders(): TileProviderConfig[]

// Check if a provider requires an API key
function requiresAPIKey(provider: TileProvider): boolean
```

## Components

### `<Map>`

High-level map component with responsive sizing.

**Props:**
```typescript
{
  store: Store<MapState, MapAction>;
  width?: string | number;    // Default: '100%'
  height?: string | number;   // Default: '600px'
  onMapClick?: (lngLat: LngLat) => void;
}
```

**Example:**
```svelte
<Map
  {store}
  width="100%"
  height="600px"
  onMapClick={(lngLat) => console.log('Clicked:', lngLat)}
/>
```

### `<GeoJSONLayer>`

Renders GeoJSON data on the map.

**Props:**
```typescript
{
  store: Store<MapState, MapAction>;
  id: string;
  data: GeoJSON | string;
  visible?: boolean;          // Default: true
  interactive?: boolean;      // Default: true
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}
```

**Example:**
```svelte
<Map {store}>
  <GeoJSONLayer
    {store}
    id="states-layer"
    data={statesGeoJSON}
    fillColor="#0080ff"
    fillOpacity={0.3}
    strokeColor="#0066cc"
    strokeWidth={2}
  />
</Map>
```

### `<HeatmapLayer>`

Renders a heatmap visualization.

**Props:**
```typescript
{
  store: Store<MapState, MapAction>;
  id: string;
  data: GeoJSON | string;
  visible?: boolean;          // Default: true
  interactive?: boolean;      // Default: false
  intensity?: number;
  radius?: number;
  colorGradient?: [number, string][];
}
```

**Example:**
```svelte
<Map {store}>
  <HeatmapLayer
    {store}
    id="earthquake-heatmap"
    data={earthquakeData}
    intensity={0.9}
    radius={30}
    colorGradient={[
      [0, 'rgba(0, 0, 255, 0)'],
      [0.5, 'rgba(255, 255, 0, 0.8)'],
      [1, 'rgba(255, 0, 0, 1)']
    ]}
  />
</Map>
```

### `<MapPopup>`

Standalone popup component.

**Props:**
```typescript
{
  store: Store<MapState, MapAction>;
  id: string;
  position: LngLat;
  isOpen?: boolean;           // Default: true
  closeButton?: boolean;      // Default: true
  closeOnClick?: boolean;     // Default: false
  children?: Snippet;
}
```

**Example:**
```svelte
<Map {store}>
  <MapPopup
    {store}
    id="info-popup"
    position={[-74.006, 40.7128]}
    isOpen={true}
  >
    <div class="p-2">
      <h4>New York City</h4>
      <p>The Big Apple</p>
    </div>
  </MapPopup>
</Map>
```

### `<TileProviderControl>`

UI control for switching tile providers.

**Props:**
```typescript
{
  store: Store<MapState, MapAction>;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';  // Default: 'top-right'
  class?: string;
}
```

**Example:**
```svelte
<Map {store}>
  <TileProviderControl {store} position="top-right" />
</Map>
```

## Advanced Usage

### Custom Markers

```typescript
const store = createStore({
  initialState: createInitialMapState({
    markers: [
      {
        id: 'custom-marker',
        position: [-74.006, 40.7128],
        icon: '/path/to/custom-icon.png',
        draggable: true,
        data: { type: 'restaurant', name: 'Pizza Place' }
      }
    ]
  }),
  reducer: mapReducer
});
```

### Programmatic Control

```typescript
// Fly to a location
store.dispatch({
  type: 'flyTo',
  center: [-0.1278, 51.5074],  // London
  zoom: 12,
  duration: 2000
});

// Add a marker dynamically
store.dispatch({
  type: 'addMarker',
  marker: {
    id: `marker-${Date.now()}`,
    position: [lng, lat]
  }
});

// Change tile provider
store.dispatch({
  type: 'changeTileProvider',
  provider: 'carto-dark'
});
```

### Reactive Subscriptions

```svelte
<script>
  const mapStore = createStore({ /* ... */ });

  // React to zoom changes
  $: if ($mapStore.viewport.zoom > 15) {
    console.log('Zoomed in close!');
  }

  // React to markers
  $: console.log(`${$mapStore.markers.length} markers on map`);
</script>
```

## Performance Considerations

### Marker Clustering

For 100+ markers, consider implementing clustering:

```typescript
// Phase 12C feature (upcoming)
// Will provide built-in marker clustering with supercluster
```

### Large GeoJSON Datasets

For large datasets, simplify geometry or use URL-based data loading:

```svelte
<GeoJSONLayer
  {store}
  id="large-dataset"
  data="https://example.com/large-geojson.json"
/>
```

### Layer Visibility

Toggle layer visibility instead of adding/removing:

```typescript
store.dispatch({
  type: 'toggleLayerVisibility',
  id: 'my-layer'
});
```

## Error Handling

The map dispatches error actions on failures:

```typescript
$: if ($mapStore.error) {
  console.error('Map error:', $mapStore.error);
}
```

## Browser Compatibility

- Modern browsers (ES2020+)
- WebGL support required
- Touch events supported

## See Also

- [README.md](./README.md) - Getting started guide
- [Phase 12 Plan](../../plans/phase-12/PHASE-12-PLAN.md) - Roadmap and features
- [Maplibre GL Docs](https://maplibre.org/maplibre-gl-js/docs/) - Underlying map library
