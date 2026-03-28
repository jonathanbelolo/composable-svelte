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

  // Which demo section is currently active (only one map rendered at a time)
  let activeDemo = $state<string>('basic');

  const demos = [
    { id: 'basic', label: 'Basic Map' },
    { id: 'geojson', label: 'GeoJSON Layer' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'interactive', label: 'Controls' },
    { id: 'tiles', label: 'Tile Providers' },
    { id: 'popup', label: 'Popup' }
  ];

  // Stores are created lazily when their demo becomes active
  function createBasicStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-74.006, 40.7128],
        zoom: 12,
        markers: [
          {
            id: 'marker-1',
            position: [-74.006, 40.7128],
            popup: { content: '<h3>Times Square</h3><p>The heart of NYC</p>', isOpen: true }
          },
          {
            id: 'marker-2',
            position: [-73.935, 40.73],
            popup: { content: '<h3>Queens</h3><p>The largest borough</p>', isOpen: false }
          },
          {
            id: 'marker-3',
            position: [-73.968, 40.785],
            popup: { content: '<h3>Central Park</h3><p>Urban oasis</p>', isOpen: false }
          }
        ]
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  function createGeojsonStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-100, 40],
        zoom: 3
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  function createHeatmapStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-118.2437, 34.0522],
        zoom: 10
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  function createInteractiveStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-122.431, 37.773],
        zoom: 12
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  function createTileStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-0.1278, 51.5074],
        zoom: 12
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  function createPopupStore() {
    return createStore({
      initialState: createInitialMapState({
        provider: 'maplibre',
        center: [-122.431, 37.773],
        zoom: 12
      }),
      reducer: mapReducer,
      dependencies: {}
    });
  }

  // Lazy store cache — only created when first accessed
  const storeCache = new globalThis.Map<string, ReturnType<typeof createBasicStore>>();

  function getStore(id: string) {
    if (!storeCache.has(id)) {
      switch (id) {
        case 'basic': storeCache.set(id, createBasicStore()); break;
        case 'geojson': storeCache.set(id, createGeojsonStore()); break;
        case 'heatmap': storeCache.set(id, createHeatmapStore()); break;
        case 'interactive': storeCache.set(id, createInteractiveStore()); break;
        case 'tiles': storeCache.set(id, createTileStore()); break;
        case 'popup': storeCache.set(id, createPopupStore()); break;
      }
    }
    return storeCache.get(id)!;
  }

  // Sample GeoJSON data
  const statesGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'California', population: 39538223 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-124.48, 42.00], [-124.48, 32.53], [-114.13, 32.53], [-114.13, 42.00], [-124.48, 42.00]]]
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Texas', population: 29145505 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-106.65, 31.85], [-93.51, 33.96], [-93.51, 25.84], [-106.65, 25.84], [-106.65, 31.85]]]
        }
      }
    ]
  };

  // Sample heatmap data
  const crimeHeatmapData = {
    type: 'FeatureCollection',
    features: Array.from({ length: 200 }, () => {
      const clusterCenterLng = -118.2437 + (Math.random() - 0.5) * 0.4;
      const clusterCenterLat = 34.0522 + (Math.random() - 0.5) * 0.3;
      return {
        type: 'Feature',
        properties: { severity: Math.random() * 10 },
        geometry: {
          type: 'Point',
          coordinates: [
            clusterCenterLng + (Math.random() - 0.5) * 0.05,
            clusterCenterLat + (Math.random() - 0.5) * 0.05
          ]
        }
      };
    })
  };

  // Interactive controls
  function zoomIn() { getStore('interactive').dispatch({ type: 'zoomIn' }); }
  function zoomOut() { getStore('interactive').dispatch({ type: 'zoomOut' }); }
  function flyToNewYork() {
    getStore('interactive').dispatch({ type: 'flyTo', center: [-74.006, 40.7128], zoom: 12, duration: 2000 });
  }
  function flyToLondon() {
    getStore('interactive').dispatch({ type: 'flyTo', center: [-0.1278, 51.5074], zoom: 12, duration: 2000 });
  }
  function addRandomMarker() {
    const store = getStore('interactive');
    const id = `marker-${Date.now()}`;
    const sf = store.state.viewport.center;
    store.dispatch({
      type: 'addMarker',
      marker: { id, position: [sf[0] + (Math.random() - 0.5) * 0.1, sf[1] + (Math.random() - 0.5) * 0.1] }
    });
  }
</script>

<div class="space-y-6">
  <!-- Demo selector tabs -->
  <div class="flex flex-wrap gap-2">
    {#each demos as demo}
      <Button
        variant={activeDemo === demo.id ? 'default' : 'outline'}
        size="sm"
        onclick={() => activeDemo = demo.id}
      >
        {demo.label}
      </Button>
    {/each}
  </div>

  <!-- Only one map rendered at a time to avoid WebGL context limits -->
  {#if activeDemo === 'basic'}
    {@const store = getStore('basic')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">Basic Map with Markers</h3>
        <p class="text-muted-foreground text-sm">Interactive map powered by Maplibre GL with custom markers and popups</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="h-[400px] w-full rounded-lg overflow-hidden border">
            <Map {store} />
          </div>
          <div class="mt-4 text-sm text-muted-foreground">
            <p><strong>Features:</strong> Pan, zoom, click markers to open popups</p>
            <p><strong>Center:</strong> {store.state.viewport.center.map(c => c.toFixed(4)).join(', ')}</p>
            <p><strong>Zoom:</strong> {store.state.viewport.zoom.toFixed(2)}</p>
            <p><strong>Markers:</strong> {store.state.markers.length}</p>
          </div>
        </CardContent>
      </Card>
    </section>

  {:else if activeDemo === 'geojson'}
    {@const store = getStore('geojson')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">GeoJSON Layer</h3>
        <p class="text-muted-foreground text-sm">Render GeoJSON data with custom styling for polygons and features</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="h-[400px] w-full rounded-lg overflow-hidden border">
            <Map {store}>
              <GeoJSONLayer
                {store}
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
          </div>
        </CardContent>
      </Card>
    </section>

  {:else if activeDemo === 'heatmap'}
    {@const store = getStore('heatmap')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">Heatmap Layer</h3>
        <p class="text-muted-foreground text-sm">Visualize point density with color gradients - 200 data points in Los Angeles</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="h-[400px] w-full rounded-lg overflow-hidden border">
            <Map {store}>
              <HeatmapLayer
                {store}
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
            <p><strong>Data Points:</strong> {crimeHeatmapData.features.length}</p>
            <p><strong>Gradient:</strong> Blue (low) to Red (high)</p>
          </div>
        </CardContent>
      </Card>
    </section>

  {:else if activeDemo === 'interactive'}
    {@const store = getStore('interactive')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">Interactive Controls</h3>
        <p class="text-muted-foreground text-sm">Programmatically control the map via reducer actions</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onclick={zoomIn}>Zoom In</Button>
              <Button variant="outline" size="sm" onclick={zoomOut}>Zoom Out</Button>
              <Button variant="outline" size="sm" onclick={flyToNewYork}>Fly to NYC</Button>
              <Button variant="outline" size="sm" onclick={flyToLondon}>Fly to London</Button>
              <Button variant="outline" size="sm" onclick={addRandomMarker}>Add Marker</Button>
            </div>
            <div class="h-[400px] w-full rounded-lg overflow-hidden border">
              <Map {store} />
            </div>
            <div class="text-sm text-muted-foreground">
              <p><strong>Zoom:</strong> {store.state.viewport.zoom.toFixed(2)}</p>
              <p><strong>Center:</strong> {store.state.viewport.center.map(c => c.toFixed(4)).join(', ')}</p>
              <p><strong>Markers:</strong> {store.state.markers.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>

  {:else if activeDemo === 'tiles'}
    {@const store = getStore('tiles')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">Tile Providers</h3>
        <p class="text-muted-foreground text-sm">Switch between different map styles and tile providers</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="h-[400px] w-full rounded-lg overflow-hidden border relative">
            <Map {store}>
              <TileProviderControl {store} position="top-right" />
            </Map>
          </div>
          <div class="mt-4 text-sm text-muted-foreground">
            <p><strong>Current Provider:</strong> {store.state.tileProvider}</p>
            <p><strong>Available:</strong> OpenStreetMap, Stadia Maps, CARTO Light/Dark, and more</p>
          </div>
        </CardContent>
      </Card>
    </section>

  {:else if activeDemo === 'popup'}
    {@const store = getStore('popup')}
    <section class="space-y-4">
      <div>
        <h3 class="text-xl font-semibold mb-2">Standalone Popup</h3>
        <p class="text-muted-foreground text-sm">Add popups independent of markers with custom HTML content</p>
      </div>
      <Card>
        <CardContent class="pt-6">
          <div class="h-[400px] w-full rounded-lg overflow-hidden border">
            <Map {store}>
              <MapPopup
                {store}
                id="info-popup"
                position={[-122.431, 37.773]}
                isOpen={true}
                closeButton={true}
                closeOnClick={false}
              >
                <div class="p-2">
                  <h4 class="font-semibold text-sm">San Francisco</h4>
                  <p class="text-xs text-muted-foreground mt-1">The City by the Bay</p>
                </div>
              </MapPopup>
            </Map>
          </div>
        </CardContent>
      </Card>
    </section>
  {/if}

  <!-- Features Overview (always visible) -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold mb-2">Features Overview</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each [
        ['Maplibre GL', 'Open-source map library with no API key required'],
        ['Markers & Popups', 'Interactive markers with custom popup content'],
        ['GeoJSON Layers', 'Render polygons, lines, and points from GeoJSON'],
        ['Heatmap Layers', 'Density visualization with color gradients'],
        ['State Management', 'Pure reducers with testable state transitions'],
        ['Multiple Tile Providers', 'Switch between OpenStreetMap, Stadia, CARTO, and more']
      ] as [title, desc]}
        <Card>
          <CardHeader><CardTitle class="text-sm">{title}</CardTitle></CardHeader>
          <CardContent><p class="text-xs text-muted-foreground">{desc}</p></CardContent>
        </Card>
      {/each}
    </div>
  </section>
</div>
