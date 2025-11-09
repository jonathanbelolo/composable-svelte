<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    Map,
    GeoJSONLayer,
    HeatmapLayer,
    MapPopup,
    TileProviderControl,
    mapReducer,
    createInitialMapState
  } from '@composable-svelte/maps';
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent
  } from '@composable-svelte/core/components/ui/card/index.js';
  import { Button } from '@composable-svelte/core/components/ui/button/index.js';
  import 'maplibre-gl/dist/maplibre-gl.css';

  // Store for basic map with markers
  const basicMapStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-74.006, 40.7128], // NYC
      zoom: 12,
      markers: [
        {
          id: 'marker-1',
          position: [-74.006, 40.7128],
          popup: {
            content: '<h3>Times Square</h3><p>The heart of NYC</p>',
            isOpen: true
          }
        },
        {
          id: 'marker-2',
          position: [-73.935, 40.73],
          popup: {
            content: '<h3>Queens</h3><p>The largest borough</p>',
            isOpen: false
          }
        },
        {
          id: 'marker-3',
          position: [-73.968, 40.785],
          popup: {
            content: '<h3>Central Park</h3><p>Urban oasis</p>',
            isOpen: false
          }
        }
      ]
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Store for GeoJSON layer example
  const geojsonMapStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-100, 40],
      zoom: 3
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Sample GeoJSON data (US States outline)
  const statesGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'California', population: 39538223 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-124.48, 42.00],
            [-124.48, 32.53],
            [-114.13, 32.53],
            [-114.13, 42.00],
            [-124.48, 42.00]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Texas', population: 29145505 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-106.65, 31.85],
            [-93.51, 33.96],
            [-93.51, 25.84],
            [-106.65, 25.84],
            [-106.65, 31.85]
          ]]
        }
      }
    ]
  };

  // Store for heatmap example
  const heatmapStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-118.2437, 34.0522], // Los Angeles
      zoom: 10
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Sample heatmap data (200 crime incident points concentrated in downtown LA)
  const crimeHeatmapData = {
    type: 'FeatureCollection',
    features: Array.from({ length: 200 }, (_, i) => {
      // Create clusters of points for more realistic heatmap effect
      const clusterCenterLng = -118.2437 + (Math.random() - 0.5) * 0.4;
      const clusterCenterLat = 34.0522 + (Math.random() - 0.5) * 0.3;

      return {
        type: 'Feature',
        properties: {
          severity: Math.random() * 10,
          timestamp: Date.now() - Math.random() * 86400000 // Last 24 hours
        },
        geometry: {
          type: 'Point',
          coordinates: [
            clusterCenterLng + (Math.random() - 0.5) * 0.05, // Cluster points together
            clusterCenterLat + (Math.random() - 0.5) * 0.05
          ]
        }
      };
    })
  };

  // Store for interactive controls
  const interactiveStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-122.431, 37.773], // San Francisco
      zoom: 12
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Store for tile provider demo
  const tileProviderStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-0.1278, 51.5074], // London
      zoom: 12
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Store for standalone popup demo
  const popupStore = createStore({
    initialState: createInitialMapState({
      provider: 'maplibre',
      center: [-122.431, 37.773], // San Francisco
      zoom: 12
    }),
    reducer: mapReducer,
    dependencies: {}
  });

  // Control functions
  function zoomIn() {
    interactiveStore.dispatch({ type: 'zoomIn' });
  }

  function zoomOut() {
    interactiveStore.dispatch({ type: 'zoomOut' });
  }

  function flyToNewYork() {
    interactiveStore.dispatch({
      type: 'flyTo',
      center: [-74.006, 40.7128],
      zoom: 12,
      duration: 2000
    });
  }

  function flyToLondon() {
    interactiveStore.dispatch({
      type: 'flyTo',
      center: [-0.1278, 51.5074],
      zoom: 12,
      duration: 2000
    });
  }

  function addRandomMarker() {
    const id = `marker-${Date.now()}`;
    const sf = $interactiveStore.viewport.center;
    interactiveStore.dispatch({
      type: 'addMarker',
      marker: {
        id,
        position: [
          sf[0] + (Math.random() - 0.5) * 0.1,
          sf[1] + (Math.random() - 0.5) * 0.1
        ]
      }
    });
  }
</script>

<div class="space-y-12">
  <!-- Basic Map -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Map with Markers</h3>
      <p class="text-muted-foreground text-sm">
        Interactive map powered by Maplibre GL with custom markers and popups
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="h-[400px] w-full rounded-lg overflow-hidden border">
          <Map store={basicMapStore} />
        </div>
        <div class="mt-4 text-sm text-muted-foreground">
          <p><strong>Features:</strong> Pan, zoom, click markers to open popups</p>
          <p><strong>Center:</strong> {$basicMapStore.viewport.center.map(c => c.toFixed(4)).join(', ')}</p>
          <p><strong>Zoom:</strong> {$basicMapStore.viewport.zoom.toFixed(2)}</p>
          <p><strong>Markers:</strong> {$basicMapStore.markers.length}</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- GeoJSON Layer -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">GeoJSON Layer</h3>
      <p class="text-muted-foreground text-sm">
        Render GeoJSON data with custom styling for polygons and features
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="h-[400px] w-full rounded-lg overflow-hidden border">
          <Map store={geojsonMapStore}>
            <GeoJSONLayer
              store={geojsonMapStore}
              id="states-layer"
              data={statesGeoJSON}
              fillColor="#0080ff"
              fillOpacity={0.3}
              strokeColor="#0066cc"
              strokeWidth={2}
              visible={true}
              interactive={true}
            />
          </Map>
        </div>
        <div class="mt-4 text-sm text-muted-foreground">
          <p><strong>Layer Type:</strong> GeoJSON Polygon</p>
          <p><strong>Features:</strong> {statesGeoJSON.features.length} states</p>
          <p><strong>Style:</strong> Blue fill with darker stroke</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Heatmap Layer -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Heatmap Layer</h3>
      <p class="text-muted-foreground text-sm">
        Visualize point density with color gradients - Crime incidents heatmap showing hotspots
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="h-[400px] w-full rounded-lg overflow-hidden border">
          <Map store={heatmapStore}>
            <HeatmapLayer
              store={heatmapStore}
              id="crime-heatmap"
              data={crimeHeatmapData}
              intensity={1.2}
              radius={40}
              colorGradient={[
                [0, 'rgba(33, 102, 172, 0)'],
                [0.2, 'rgba(103, 169, 207, 0.4)'],
                [0.4, 'rgba(209, 229, 240, 0.6)'],
                [0.6, 'rgba(253, 219, 199, 0.8)'],
                [0.8, 'rgba(239, 138, 98, 0.9)'],
                [1, 'rgba(178, 24, 43, 1)']
              ]}
              visible={true}
            />
          </Map>
        </div>
        <div class="mt-4 text-sm text-muted-foreground">
          <p><strong>Layer Type:</strong> Heatmap (density visualization)</p>
          <p><strong>Data Points:</strong> {crimeHeatmapData.features.length} incident locations</p>
          <p><strong>Location:</strong> Los Angeles, CA</p>
          <p><strong>Gradient:</strong> Blue (low density) → White → Red (high density)</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Interactive Controls -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Controls</h3>
      <p class="text-muted-foreground text-sm">
        Programmatically control the map via reducer actions
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="space-y-4">
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onclick={zoomIn}>
              Zoom In
            </Button>
            <Button variant="outline" size="sm" onclick={zoomOut}>
              Zoom Out
            </Button>
            <Button variant="outline" size="sm" onclick={flyToNewYork}>
              Fly to NYC
            </Button>
            <Button variant="outline" size="sm" onclick={flyToLondon}>
              Fly to London
            </Button>
            <Button variant="outline" size="sm" onclick={addRandomMarker}>
              Add Marker
            </Button>
          </div>

          <div class="h-[400px] w-full rounded-lg overflow-hidden border">
            <Map store={interactiveStore} />
          </div>

          <div class="text-sm text-muted-foreground">
            <p><strong>Current Zoom:</strong> {$interactiveStore.viewport.zoom.toFixed(2)}</p>
            <p><strong>Center:</strong> {$interactiveStore.viewport.center.map(c => c.toFixed(4)).join(', ')}</p>
            <p><strong>Markers:</strong> {$interactiveStore.markers.length}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Tile Providers -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Tile Providers</h3>
      <p class="text-muted-foreground text-sm">
        Switch between different map styles and tile providers on the fly
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="h-[400px] w-full rounded-lg overflow-hidden border relative">
          <Map store={tileProviderStore}>
            <TileProviderControl store={tileProviderStore} position="top-right" />
          </Map>
        </div>
        <div class="mt-4 text-sm text-muted-foreground">
          <p><strong>Feature:</strong> Dynamic tile provider switching</p>
          <p><strong>Current Provider:</strong> {$tileProviderStore.tileProvider}</p>
          <p><strong>Available:</strong> OpenStreetMap, Stadia Maps, CARTO Light/Dark, and more</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Standalone Popup -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Standalone Popup</h3>
      <p class="text-muted-foreground text-sm">
        Add popups independent of markers with custom HTML content
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="h-[400px] w-full rounded-lg overflow-hidden border">
          <Map store={popupStore}>
            <MapPopup
              store={popupStore}
              id="info-popup"
              position={[-122.431, 37.773]}
              isOpen={true}
              closeButton={true}
              closeOnClick={false}
            >
              <div class="p-2">
                <h4 class="font-semibold text-sm">San Francisco</h4>
                <p class="text-xs text-muted-foreground mt-1">
                  The City by the Bay
                </p>
              </div>
            </MapPopup>
          </Map>
        </div>
        <div class="mt-4 text-sm text-muted-foreground">
          <p><strong>Feature:</strong> Declarative popup component</p>
          <p><strong>Content:</strong> Custom HTML with Svelte reactivity</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- State-Driven Architecture -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">State-Driven Architecture</h3>
      <p class="text-muted-foreground text-sm">
        All map interactions managed through Composable Architecture reducers
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Map State Structure</CardTitle>
        <CardDescription>Reactive state management with pure reducers</CardDescription>
      </CardHeader>
      <CardContent>
        <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto">{JSON.stringify({
  provider: $basicMapStore.provider,
  viewport: {
    center: $basicMapStore.viewport.center.map(c => parseFloat(c.toFixed(4))),
    zoom: parseFloat($basicMapStore.viewport.zoom.toFixed(2)),
    bearing: $basicMapStore.viewport.bearing,
    pitch: $basicMapStore.viewport.pitch
  },
  markers: $basicMapStore.markers.length,
  layers: $basicMapStore.layers.length,
  popups: $basicMapStore.popups.length,
  isInteractive: $basicMapStore.isInteractive,
  isLoaded: $basicMapStore.isLoaded
}, null, 2)}</pre>
      </CardContent>
    </Card>
  </section>

  <!-- Features Overview -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Features Overview</h3>
      <p class="text-muted-foreground text-sm">
        Comprehensive map components following Composable Architecture patterns
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ Maplibre GL</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Open-source map library with no API key required
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ Markers & Popups</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Interactive markers with custom popup content
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ GeoJSON Layers</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Render polygons, lines, and points from GeoJSON
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ Heatmap Layers</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Density visualization with color gradients
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ State Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Pure reducers with testable state transitions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ Type Safety</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Full TypeScript support with type inference
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">✓ Multiple Tile Providers</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Switch between OpenStreetMap, Stadia, CARTO, and more
          </p>
        </CardContent>
      </Card>
    </div>
  </section>
</div>
