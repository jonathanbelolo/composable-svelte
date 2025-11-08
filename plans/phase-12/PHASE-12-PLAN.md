# Phase 12: Interactive Maps

**Status**: Planning
**Dependencies**: Phase 1 (Core), Phase 2 (Navigation), Phase 4 (Animation)
**Timeline**: TBD
**Priority**: Medium

## Overview

Implement comprehensive interactive map components using **Mapbox GL JS** or **Maplibre GL**, wrapped in Composable Architecture patterns. Focus on declarative, state-driven maps with rich interactivity (pan, zoom, markers, popups, layers, routing).

## Goals

1. **Map Library Integration**: Wrap Mapbox GL JS / Maplibre GL in Composable Architecture
2. **State-Driven Maps**: All map state managed via reducers (center, zoom, bounds, markers, layers)
3. **Interactive Features**: Pan, zoom, click, hover, popup, search, geocoding, routing
4. **Marker Management**: Add/remove/update markers, clustering, custom icons
5. **Layer Control**: GeoJSON layers, heatmaps, choropleth, 3D buildings
6. **Responsive**: Mobile-friendly gestures, adaptive UI

## Library Choice: Mapbox GL JS vs Maplibre GL

### Mapbox GL JS
**Pros**:
- Official, well-maintained
- Excellent documentation
- Rich ecosystem (plugins, examples)
- Best performance

**Cons**:
- Requires API key (rate limits, costs)
- Not fully open source (v2+)
- Vendor lock-in

### Maplibre GL JS
**Pros**:
- **100% open source** (fork of Mapbox GL JS v1)
- No API key required (use OpenStreetMap tiles)
- Community-driven, BSD license
- Compatible API with Mapbox GL JS

**Cons**:
- Smaller ecosystem
- Slightly behind Mapbox on features

### Recommendation: **Maplibre GL** (with Mapbox compatibility layer)

**Why**:
- Open source aligns with project philosophy
- No vendor lock-in, no API key costs
- Easy to swap tile providers (OpenStreetMap, Stadia Maps, Maptiler)
- Can still use Mapbox tiles if user provides API key

**Implementation**: Support both via adapter pattern
```typescript
type MapProvider = 'maplibre' | 'mapbox';

// Users choose provider at initialization
const store = createStore({
  initialState: createInitialMapState({
    provider: 'maplibre',  // or 'mapbox'
    accessToken: process.env.MAPBOX_TOKEN  // only needed for Mapbox
  }),
  reducer: mapReducer
});
```

## Architecture

### Component Structure

```
@composable-svelte/core/maps/
├── Map.svelte                      # Main map wrapper component
├── MapPrimitive.svelte            # Low-level primitive (renders Mapbox/Maplibre)
├── map.reducer.ts                 # Map state reducer
├── map.types.ts                   # Types (MapState, MapAction)
├── markers/
│   ├── Marker.svelte             # Single marker component
│   ├── MarkerCluster.svelte      # Clustered markers
│   └── marker.reducer.ts         # Marker state management
├── layers/
│   ├── GeoJSONLayer.svelte       # GeoJSON layer component
│   ├── HeatmapLayer.svelte       # Heatmap layer
│   ├── layer.types.ts            # Layer types
│   └── layer.reducer.ts          # Layer state management
├── controls/
│   ├── NavigationControl.svelte  # Zoom +/- buttons
│   ├── GeolocateControl.svelte   # "Locate me" button
│   ├── ScaleControl.svelte       # Scale bar
│   └── controls.types.ts
├── popups/
│   ├── Popup.svelte              # Popup component
│   └── popup.reducer.ts          # Popup state management
├── geocoding/
│   ├── Geocoder.svelte           # Search box component
│   └── geocoding.ts              # Geocoding utilities
└── utils/
    ├── map-adapter.ts            # Mapbox/Maplibre adapter
    ├── tile-providers.ts         # Tile provider configs
    └── geojson.ts                # GeoJSON utilities
```

### State Management Pattern

**Map State Structure**:
```typescript
interface MapState {
  // Map provider
  provider: 'maplibre' | 'mapbox';
  accessToken?: string;

  // Map view state
  viewport: {
    center: [number, number];  // [lng, lat]
    zoom: number;
    bearing: number;  // rotation
    pitch: number;    // 3D tilt
    bounds?: [[number, number], [number, number]];  // SW, NE corners
  };

  // Interaction state
  isInteractive: boolean;
  isDragging: boolean;
  isZooming: boolean;

  // Markers
  markers: Array<{
    id: string;
    position: [number, number];
    icon?: string | MarkerIcon;
    popup?: {
      content: string | HTMLElement;
      isOpen: boolean;
    };
    draggable?: boolean;
    data?: any;  // Custom data attached to marker
  }>;

  // Layers
  layers: Array<{
    id: string;
    type: 'geojson' | 'heatmap' | 'choropleth' | 'raster' | '3d-buildings';
    data: GeoJSON | string;  // GeoJSON object or URL
    style: LayerStyle;
    visible: boolean;
    interactive: boolean;
  }>;

  // Popups (separate from markers for flexibility)
  popups: Array<{
    id: string;
    position: [number, number];
    content: string | HTMLElement;
    isOpen: boolean;
    closeButton?: boolean;
    closeOnClick?: boolean;
  }>;

  // Tile settings
  style: string | StyleSpecification;  // Map style URL or object
  tileProvider: 'openstreetmap' | 'mapbox' | 'stadia' | 'maptiler' | 'custom';

  // Feature state (for hover/click interactions)
  hoveredFeature: {
    layer: string;
    featureId: string | number;
  } | null;

  selectedFeatures: Array<{
    layer: string;
    featureId: string | number;
    data: any;
  }>;

  // Loading state
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  // Geocoding
  geocodingQuery: string;
  geocodingResults: GeocodingResult[];
}
```

**Map Actions**:
```typescript
type MapAction =
  // Viewport actions
  | { type: 'setCenter'; center: [number, number] }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setBearing'; bearing: number }
  | { type: 'setPitch'; pitch: number }
  | { type: 'fitBounds'; bounds: [[number, number], [number, number]]; padding?: number }
  | { type: 'flyTo'; center: [number, number]; zoom?: number; duration?: number }
  | { type: 'resetNorth' }

  // Interaction actions
  | { type: 'panStart'; position: [number, number] }
  | { type: 'panMove'; delta: [number, number] }
  | { type: 'panEnd' }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' }

  // Marker actions
  | { type: 'addMarker'; marker: Marker }
  | { type: 'removeMarker'; id: string }
  | { type: 'updateMarker'; id: string; updates: Partial<Marker> }
  | { type: 'moveMarker'; id: string; position: [number, number] }
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
  | { type: 'featureHovered'; layer: string; featureId: string | number }
  | { type: 'featureUnhovered' }
  | { type: 'featureClicked'; layer: string; featureId: string | number; data: any }
  | { type: 'clearSelection' }

  // Geocoding actions
  | { type: 'geocodingSearch'; query: string }
  | { type: 'geocodingResults'; results: GeocodingResult[] }
  | { type: 'geocodingSelect'; result: GeocodingResult }

  // Map lifecycle actions
  | { type: 'mapLoaded' }
  | { type: 'mapError'; error: string }
  | { type: 'changeStyle'; style: string | StyleSpecification };
```

### Mapbox/Maplibre Integration

**Map Adapter Pattern**:
```typescript
// Abstract interface for map providers
interface MapAdapter {
  initialize(container: HTMLElement, options: MapOptions): void;
  setCenter(center: [number, number]): void;
  setZoom(zoom: number): void;
  flyTo(options: FlyToOptions): void;
  addMarker(marker: Marker): void;
  removeMarker(id: string): void;
  addLayer(layer: Layer): void;
  removeLayer(id: string): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  destroy(): void;
}

// Maplibre implementation
class MaplibreAdapter implements MapAdapter {
  private map: maplibregl.Map | null = null;

  initialize(container: HTMLElement, options: MapOptions) {
    this.map = new maplibregl.Map({
      container,
      style: options.style || 'https://tiles.stadiamaps.com/styles/osm_bright.json',
      center: options.center,
      zoom: options.zoom
    });
  }

  setCenter(center: [number, number]) {
    this.map?.setCenter(center);
  }

  // ... other methods
}

// Mapbox implementation (similar)
class MapboxAdapter implements MapAdapter {
  private map: mapboxgl.Map | null = null;

  initialize(container: HTMLElement, options: MapOptions) {
    mapboxgl.accessToken = options.accessToken!;

    this.map = new mapboxgl.Map({
      container,
      style: options.style || 'mapbox://styles/mapbox/streets-v12',
      center: options.center,
      zoom: options.zoom
    });
  }

  // ... other methods
}

// Factory function
function createMapAdapter(provider: MapProvider): MapAdapter {
  switch (provider) {
    case 'maplibre':
      return new MaplibreAdapter();
    case 'mapbox':
      return new MapboxAdapter();
    default:
      throw new Error(`Unknown map provider: ${provider}`);
  }
}
```

## Component Design

### 1. Map Component (High-level wrapper)

**Usage**:
```svelte
<script>
import { Map } from '@composable-svelte/core/maps';
import { createStore } from '@composable-svelte/core';
import { mapReducer } from '@composable-svelte/core/maps';

const store = createStore({
  initialState: createInitialMapState({
    provider: 'maplibre',
    viewport: {
      center: [-74.006, 40.7128],  // NYC
      zoom: 12,
      bearing: 0,
      pitch: 0
    },
    markers: [
      {
        id: 'marker-1',
        position: [-74.006, 40.7128],
        popup: {
          content: '<h3>New York City</h3>',
          isOpen: true
        }
      }
    ]
  }),
  reducer: mapReducer,
  dependencies: {}
});
</script>

<Map
  {store}
  width="100%"
  height="600px"
  interactive={true}
  onMarkerClick={(marker) => console.log('Clicked:', marker)}
  onMapClick={(lngLat) => console.log('Map clicked:', lngLat)}
/>
```

**Features**:
- Automatic resize handling
- Event delegation for markers, layers, popups
- Responsive touch gestures
- Keyboard navigation (arrow keys pan, +/- zoom)

### 2. MapPrimitive Component (Low-level)

**Responsibilities**:
- Initialize Mapbox/Maplibre instance
- Sync map state with reducer state
- Handle map lifecycle (mount, update, unmount)
- Dispatch interaction events to store

**Implementation Pattern**:
```svelte
<script lang="ts">
import { createMapAdapter } from './utils/map-adapter';

let containerElement: HTMLDivElement | null = $state(null);
let mapAdapter: MapAdapter | null = $state(null);

// Initialize map on mount
$effect(() => {
  if (!containerElement) return;

  mapAdapter = createMapAdapter(state.provider);

  mapAdapter.initialize(containerElement, {
    center: state.viewport.center,
    zoom: state.viewport.zoom,
    bearing: state.viewport.bearing,
    pitch: state.viewport.pitch,
    style: state.style
  });

  // Attach event listeners
  mapAdapter.on('moveend', handleMoveEnd);
  mapAdapter.on('zoomend', handleZoomEnd);
  mapAdapter.on('click', handleClick);
  mapAdapter.on('load', handleLoad);

  return () => {
    mapAdapter?.destroy();
    mapAdapter = null;
  };
});

// Sync markers when state changes
$effect(() => {
  if (!mapAdapter) return;

  // Diff markers (add new, remove old, update existing)
  syncMarkers(mapAdapter, state.markers);
});

// Sync layers when state changes
$effect(() => {
  if (!mapAdapter) return;

  syncLayers(mapAdapter, state.layers);
});

// Sync viewport when state changes (but not during user interaction)
$effect(() => {
  if (!mapAdapter || state.isDragging || state.isZooming) return;

  mapAdapter.setCenter(state.viewport.center);
  mapAdapter.setZoom(state.viewport.zoom);
  mapAdapter.setBearing(state.viewport.bearing);
  mapAdapter.setPitch(state.viewport.pitch);
});

function handleMoveEnd() {
  const center = mapAdapter!.getCenter();
  const zoom = mapAdapter!.getZoom();

  dispatch({
    type: 'viewportChanged',
    viewport: { center, zoom, bearing: state.viewport.bearing, pitch: state.viewport.pitch }
  });
}

function handleClick(event: MapClickEvent) {
  dispatch({
    type: 'mapClicked',
    position: [event.lngLat.lng, event.lngLat.lat]
  });
}
</script>

<div bind:this={containerElement} class="map-container"></div>
```

### 3. Marker Component

**Declarative API**:
```svelte
<script>
import { Map, Marker } from '@composable-svelte/core/maps';

const store = createStore({...});
</script>

<Map {store}>
  <Marker
    position={[-74.006, 40.7128]}
    draggable={true}
    icon="/icons/pin-red.png"
    onclick={(position) => console.log('Marker clicked:', position)}
    ondragend={(position) => console.log('Marker moved:', position)}
  >
    <div slot="popup">
      <h3>Custom Popup Content</h3>
      <p>This is a custom HTML popup!</p>
    </div>
  </Marker>
</Map>
```

**Imperative API (via store)**:
```svelte
<script>
import { Map } from '@composable-svelte/core/maps';

function addMarker() {
  store.dispatch({
    type: 'addMarker',
    marker: {
      id: `marker-${Date.now()}`,
      position: [-74.006, 40.7128],
      icon: '/icons/pin-blue.png'
    }
  });
}
</script>

<button onclick={addMarker}>Add Marker</button>
<Map {store} />
```

### 4. Layer Components

**GeoJSON Layer**:
```svelte
<script>
import { Map, GeoJSONLayer } from '@composable-svelte/core/maps';

const geojsonData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-74.006, 40.7128] },
      properties: { name: 'NYC' }
    }
  ]
};
</script>

<Map {store}>
  <GeoJSONLayer
    id="my-layer"
    data={geojsonData}
    style={{
      fillColor: '#0080ff',
      fillOpacity: 0.5,
      strokeColor: '#000',
      strokeWidth: 2
    }}
    interactive={true}
    onFeatureClick={(feature) => console.log('Feature clicked:', feature)}
  />
</Map>
```

**Heatmap Layer**:
```svelte
<Map {store}>
  <HeatmapLayer
    id="crime-heatmap"
    data={crimeData}
    intensity={0.9}
    radius={20}
    colorGradient={[
      [0, 'rgba(0, 0, 255, 0)'],
      [0.5, 'rgba(0, 255, 0, 1)'],
      [1, 'rgba(255, 0, 0, 1)']
    ]}
  />
</Map>
```

### 5. Geocoding / Search

**Geocoder Component**:
```svelte
<script>
import { Map, Geocoder } from '@composable-svelte/core/maps';

function handleResultSelect(result: GeocodingResult) {
  store.dispatch({
    type: 'flyTo',
    center: result.center,
    zoom: 14
  });
}
</script>

<Geocoder
  placeholder="Search for a place..."
  onSelect={handleResultSelect}
  provider="nominatim"  // OpenStreetMap geocoding (free)
  // or provider="mapbox" (requires API key)
/>

<Map {store} />
```

## Feature Implementations

### 1. Marker Clustering

**Use case**: Display thousands of markers without cluttering the map

**Implementation**:
```typescript
// Reducer handles clustering logic
case 'updateMarkerClusters': {
  const clusters = clusterMarkers(state.markers, state.viewport.zoom);

  return [{
    ...state,
    markerClusters: clusters
  }, Effect.none()];
}

// Clustering algorithm (using supercluster library)
import Supercluster from 'supercluster';

function clusterMarkers(markers: Marker[], zoom: number): MarkerCluster[] {
  const index = new Supercluster({
    radius: 40,
    maxZoom: 16
  });

  // Load markers as GeoJSON
  index.load(markers.map(m => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: m.position },
    properties: { id: m.id, ...m.data }
  })));

  // Get clusters for current zoom
  const bounds = getBounds(state.viewport);
  const clusters = index.getClusters(bounds, zoom);

  return clusters.map(cluster => ({
    id: cluster.id,
    position: cluster.geometry.coordinates,
    count: cluster.properties.point_count,
    markers: cluster.properties.point_count
      ? index.getLeaves(cluster.id, Infinity)
      : [cluster]
  }));
}
```

### 2. Drawing Tools (Polygons, Lines, Circles)

**Use case**: Allow users to draw shapes on the map

**Implementation**:
```svelte
<script>
import { Map, DrawControl } from '@composable-svelte/core/maps';

const drawStore = createStore({
  initialState: {
    mode: 'none',  // 'point' | 'line' | 'polygon' | 'circle'
    currentDrawing: null,
    drawings: []
  },
  reducer: drawReducer
});

function handleDrawComplete(shape) {
  console.log('Drawing complete:', shape);
}
</script>

<Map {store}>
  <DrawControl
    {drawStore}
    onDrawComplete={handleDrawComplete}
    modes={['point', 'line', 'polygon', 'circle']}
  />
</Map>
```

### 3. Routing / Directions

**Use case**: Show directions between two points

**Implementation**:
```typescript
// Action to request route
case 'requestRoute': {
  const { origin, destination } = action;

  return [state, Effect.run(async (dispatch) => {
    try {
      const route = await fetchRoute(origin, destination);

      dispatch({
        type: 'routeReceived',
        route: {
          coordinates: route.geometry.coordinates,
          distance: route.distance,
          duration: route.duration,
          instructions: route.steps
        }
      });
    } catch (error) {
      dispatch({ type: 'routeError', error: error.message });
    }
  })];
}

// Fetch route from OpenRouteService (free, open source)
async function fetchRoute(origin: [number, number], destination: [number, number]) {
  const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.ORS_API_KEY
    },
    body: JSON.stringify({
      coordinates: [origin, destination]
    })
  });

  return response.json();
}
```

**Component usage**:
```svelte
<script>
function showRoute() {
  store.dispatch({
    type: 'requestRoute',
    origin: [-74.006, 40.7128],
    destination: [-118.2437, 34.0522]
  });
}
</script>

<button onclick={showRoute}>Show Route NYC → LA</button>
<Map {store} />
```

### 4. 3D Buildings

**Use case**: Show 3D building extrusions

**Implementation**:
```svelte
<Map {store}>
  <BuildingsLayer
    id="3d-buildings"
    extrusionHeight={['get', 'height']}  // Use building height from data
    extrusionBase={['get', 'min_height']}
    fillColor="#aaa"
    fillOpacity={0.6}
  />
</Map>
```

## Tile Providers

### Default Tile Providers

```typescript
const TILE_PROVIDERS = {
  // Open source (free, no API key)
  openstreetmap: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  },

  // Stadia Maps (generous free tier)
  stadia: {
    url: 'https://tiles.stadiamaps.com/styles/osm_bright.json',
    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap contributors'
  },

  // Maptiler (free tier: 100k requests/month)
  maptiler: {
    url: 'https://api.maptiler.com/maps/streets/style.json?key={key}',
    attribution: '© MapTiler © OpenStreetMap contributors'
  },

  // Mapbox (requires API key)
  mapbox: {
    url: 'mapbox://styles/mapbox/streets-v12',
    attribution: '© Mapbox © OpenStreetMap contributors'
  },

  // Custom
  custom: {
    url: '',  // User provides URL
    attribution: ''
  }
};
```

## Responsive Design

### Mobile Considerations

**Touch gestures**:
- Pinch to zoom (native Mapbox/Maplibre support)
- Two-finger rotate
- Two-finger pitch (tilt)

**UI adaptations**:
```svelte
<script>
import { Map, NavigationControl } from '@composable-svelte/core/maps';

// Detect mobile
const isMobile = window.innerWidth < 768;
</script>

<Map {store}>
  <NavigationControl
    position={isMobile ? 'bottom-right' : 'top-right'}
    showCompass={!isMobile}
    showZoom={true}
  />
</Map>
```

## Accessibility

### Keyboard Navigation

**Keybindings**:
- `Arrow keys`: Pan map
- `+/-`: Zoom in/out
- `Shift + Arrow Up/Down`: Pitch (tilt)
- `Shift + Arrow Left/Right`: Rotate
- `Escape`: Close popup
- `Tab`: Focus next marker
- `Enter`: Activate focused marker

### Screen Reader Support

**ARIA labels**:
```svelte
<div
  role="application"
  aria-label="Interactive map showing {markers.length} markers"
  aria-describedby="map-instructions"
>
  <Map {store} />
</div>

<div id="map-instructions" class="sr-only">
  Use arrow keys to pan, plus and minus to zoom.
  Press Tab to navigate markers, Enter to select.
</div>
```

## Testing Strategy

### Unit Tests (Reducer)

```typescript
describe('mapReducer', () => {
  it('updates center when setCenter dispatched', () => {
    const [newState] = mapReducer(
      initialState,
      { type: 'setCenter', center: [-74.006, 40.7128] },
      {}
    );

    expect(newState.viewport.center).toEqual([-74.006, 40.7128]);
  });

  it('adds marker when addMarker dispatched', () => {
    const marker = {
      id: 'marker-1',
      position: [-74.006, 40.7128] as [number, number]
    };

    const [newState] = mapReducer(
      initialState,
      { type: 'addMarker', marker },
      {}
    );

    expect(newState.markers).toContainEqual(marker);
  });
});
```

### Integration Tests

```typescript
describe('Map component', () => {
  it('renders markers', async () => {
    const store = createTestStore({
      initialState: createInitialMapState({
        markers: [
          { id: 'marker-1', position: [-74.006, 40.7128] }
        ]
      }),
      reducer: mapReducer
    });

    render(Map, { props: { store } });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /marker/i })).toBeInTheDocument();
    });
  });
});
```

## Examples

### Example 1: Store Locator

**Use case**: Find nearest store locations

```svelte
<script>
import { Map, Marker, Geocoder } from '@composable-svelte/core/maps';

const stores = [
  { id: 1, name: 'Store A', position: [-74.006, 40.7128] },
  { id: 2, name: 'Store B', position: [-73.935, 40.730] },
  // ...
];

const store = createStore({
  initialState: createInitialMapState({
    markers: stores.map(s => ({
      id: `store-${s.id}`,
      position: s.position,
      popup: {
        content: `<h3>${s.name}</h3>`,
        isOpen: false
      }
    }))
  }),
  reducer: mapReducer
});

function handleGeocode(result) {
  // Find nearest store
  const nearest = findNearestStore(result.center, stores);

  store.dispatch({ type: 'flyTo', center: nearest.position, zoom: 15 });
  store.dispatch({
    type: 'openPopup',
    popup: { id: `store-${nearest.id}` }
  });
}
</script>

<Geocoder onSelect={handleGeocode} />
<Map {store} />
```

### Example 2: Real-time Vehicle Tracking

**Use case**: Track delivery vehicles in real-time

```svelte
<script>
import { Map, Marker } from '@composable-svelte/core/maps';

const store = createStore({
  initialState: createInitialMapState({
    markers: []
  }),
  reducer: mapReducer,
  dependencies: {
    // WebSocket connection for real-time updates
    vehicleStream: createVehicleStream()
  }
});

// Listen to vehicle position updates
onMount(() => {
  const unsubscribe = deps.vehicleStream.subscribe((vehicle) => {
    store.dispatch({
      type: 'updateMarker',
      id: `vehicle-${vehicle.id}`,
      updates: {
        position: [vehicle.lng, vehicle.lat],
        data: { speed: vehicle.speed, bearing: vehicle.bearing }
      }
    });
  });

  return unsubscribe;
});
</script>

<Map {store} />
```

### Example 3: Choropleth Map

**Use case**: Visualize data by region (population density, election results, etc.)

```svelte
<script>
import { Map, GeoJSONLayer } from '@composable-svelte/core/maps';

// US states GeoJSON with population data
const statesData = await fetch('/data/us-states.geojson').then(r => r.json());

// Color scale based on population density
function getColorForDensity(density: number) {
  return density > 1000 ? '#800026' :
         density > 500  ? '#BD0026' :
         density > 200  ? '#E31A1C' :
         density > 100  ? '#FC4E2A' :
         density > 50   ? '#FD8D3C' :
         density > 20   ? '#FEB24C' :
         density > 10   ? '#FED976' :
                          '#FFEDA0';
}
</script>

<Map {store} viewport={{ center: [-95, 38], zoom: 4 }}>
  <GeoJSONLayer
    id="states"
    data={statesData}
    style={{
      fillColor: (feature) => getColorForDensity(feature.properties.density),
      fillOpacity: 0.7,
      strokeColor: '#fff',
      strokeWidth: 2
    }}
    onFeatureClick={(feature) => {
      console.log('State:', feature.properties.name);
    }}
  />
</Map>
```

## Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "maplibre-gl": "^4.0.0",
    "supercluster": "^8.0.1"
  },
  "optionalDependencies": {
    "mapbox-gl": "^3.0.0"
  },
  "devDependencies": {
    "@types/maplibre-gl": "^4.0.0",
    "@types/mapbox-gl": "^3.0.0",
    "@types/supercluster": "^7.1.0"
  }
}
```

## Implementation Phases

### Phase 12A: Core Foundation (Week 1-2)
- [ ] Map component infrastructure
- [ ] MapPrimitive with Maplibre GL integration
- [ ] Mapbox adapter (for users who want Mapbox)
- [ ] Basic mapReducer with viewport management
- [ ] Marker support
- [ ] Pan/zoom interactions
- [ ] Unit tests for reducer

### Phase 12B: Layers & Interactivity (Week 3-4)
- [ ] GeoJSON layer component
- [ ] Heatmap layer component
- [ ] Popup system
- [ ] Feature hover/click handling
- [ ] Layer visibility toggling
- [ ] Integration tests

### Phase 12C: Advanced Features (Week 5-6)
- [ ] Marker clustering (supercluster)
- [ ] Geocoding/search component
- [ ] Drawing tools
- [ ] Routing/directions
- [ ] 3D buildings layer
- [ ] Multiple tile provider support

### Phase 12D: Polish & Documentation (Week 7-8)
- [ ] Styleguide integration
- [ ] Component documentation
- [ ] Usage examples
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Production examples

## Success Criteria

1. **Functional**:
   - ✅ Support both Maplibre GL and Mapbox GL
   - ✅ All core features working (markers, layers, popups, geocoding)
   - ✅ Smooth 60fps interactions
   - ✅ Responsive mobile support

2. **Code Quality**:
   - ✅ 90%+ test coverage
   - ✅ Full TypeScript types
   - ✅ Follows Composable Architecture patterns

3. **Performance**:
   - ✅ Handle 10,000+ markers with clustering
   - ✅ Smooth pan/zoom on low-end devices
   - ✅ Initial load < 2s
   - ✅ Bundle size < 150KB (gzipped, excluding map library)

4. **Accessibility**:
   - ✅ Keyboard navigation works
   - ✅ Screen reader compatible
   - ✅ WCAG 2.1 AA compliance

5. **Documentation**:
   - ✅ Component API documentation
   - ✅ 5+ interactive examples in styleguide
   - ✅ Migration guide from raw Mapbox GL
   - ✅ Best practices guide

## Open Questions

1. **Offline Maps**: Should we support offline tile caching?
   - Could use IndexedDB to cache tiles
   - Low priority for Phase 12

2. **Custom Map Styles**: How to make it easy to customize map appearance?
   - Support Mapbox Studio style URLs
   - Provide style editor component?

3. **Multiple Maps**: How to handle multiple independent maps on one page?
   - Each map has its own store
   - Share tile cache between maps

4. **Vector Tiles**: Should we support custom vector tile sources?
   - Yes - Maplibre/Mapbox support this out of the box
   - Just expose the API

## References

- [Maplibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/api/)
- [OpenStreetMap](https://www.openstreetmap.org/)
- [Stadia Maps](https://stadiamaps.com/)
- [Supercluster](https://github.com/mapbox/supercluster)
- [Phase 11: Interactive Charts](../phase-11/PHASE-11-PLAN.md)
