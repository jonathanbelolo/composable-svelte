# @composable-svelte/maps

> Interactive map components for Composable Svelte

**Status**: 🚧 **In Development** (Phase 12B Complete, Phase 12C In Progress)

## Overview

`@composable-svelte/maps` provides state-driven, interactive map components built on top of [Maplibre GL](https://maplibre.org/) (open source), with an optional [Mapbox GL](https://www.mapbox.com/mapbox-gl-js) adapter you install and opt into yourself. All map state is managed using the Composable Architecture patterns from `@composable-svelte/core`.

## Features

- 🗺️ **State-Driven**: All map state managed via reducers (viewport, markers, layers)
- 🌍 **Open Source**: Built on Maplibre GL (no API key required)
- 🔌 **Bring your own engine**: `MapAdapter` is a real extension point — MapLibre by default, Mapbox behind `@composable-svelte/maps/mapbox`, or your own
- 🎨 **Multiple Tile Providers**: Switch between OpenStreetMap, Stadia Maps, CARTO, Maptiler, and more
- 🖱️ **Interactive**: Pan, zoom, markers, popups
- 📊 **GeoJSON & Heatmap Layers**: Render polygons, points, and density visualizations
- ⚡ **Performant**: GPU-accelerated rendering via WebGL
- ♿ **Accessible**: ARIA labels, keyboard navigation
- 📱 **Responsive**: Touch gestures, adaptive UI
- 🧪 **Testable**: Comprehensive reducer tests with TestStore

## Installation

```bash
pnpm add @composable-svelte/maps
```

**Peer dependencies**:
- `@composable-svelte/core` ^0.13.1
- `svelte` ^5.20.0

## Quick Start

<!-- consumer-file: stores.ts -->
```typescript
import { Map, createInitialMapState, mapReducer } from '@composable-svelte/maps';
import { createStore } from '@composable-svelte/core';

export const store = createStore({
  initialState: createInitialMapState({
    center: [-74.006, 40.7128],  // NYC
    zoom: 12,
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
```

<!-- consumer-file: Map.svelte -->
```svelte
<script lang="ts">
  import { Map } from "@composable-svelte/maps";
  import { store } from "./stores";
</script>
<Map
  {store}
  width="100%"
  height="600px"
/>
```

## Map Providers

### Maplibre GL (Default)

Free and open source. No API key required.

```typescript
const store = createStore({
  initialState: createInitialMapState({
    center: [-74.006, 40.7128],
    zoom: 12
  }),
  reducer: mapReducer
});
```

### Mapbox GL (optional)

`mapbox-gl` is an **optional peer dependency**: it is not installed unless you
ask for it, and nothing in this package's root imports it. It also ships under
the [Mapbox Terms of Service](https://www.mapbox.com/legal/tos), "for use only
with the relevant Mapbox product(s)", and needs an active Mapbox account — so
installing it is your decision to make, not this package's.

```bash
npm install mapbox-gl
```

```svelte
<script lang="ts">
  import { Map, mapReducer, createInitialMapState } from '@composable-svelte/maps';
  import { MapboxAdapter } from '@composable-svelte/maps/mapbox';
  import { createStore } from '@composable-svelte/core';

  const store = createStore({
    initialState: createInitialMapState({
      accessToken: import.meta.env.VITE_MAPBOX_TOKEN,
      center: [-74.006, 40.7128],
      zoom: 12
    }),
    reducer: mapReducer,
    dependencies: {}
  });
</script>

<Map {store} adapter={new MapboxAdapter()} />
```

The adapter throws if no `accessToken` is set, rather than letting Mapbox answer
with a 401 that looks like a broken map.

### Any other engine

`MapAdapter` is the whole contract. Implement it and pass it as `adapter` — the
same route `MapboxAdapter` takes, and the one the tests use to drive
`MapPrimitive` without a WebGL context.

The component owns the adapter it attaches, including a supplied adapter. It
removes event listeners and calls `destroy()` when the component unmounts or its
managed owner retires. Create a fresh adapter for a replacement map view.
The attached adapter and store are fixed for that component instance; key the
component if a standalone caller needs to replace either one.

### Managed map view

For the ownership contract, operation policy, troubleshooting, and a runnable
installed-package recipe, see [Managed integration](./MANAGED.md). The full
component reference is in [API.md](./API.md).

`Map`, `MapPrimitive`, `GeoJSONLayer`, `HeatmapLayer`, `MapPopup`, and
`TileProviderControl` accept a managed child view directly. In a
`defineViews` render component, pass the provided `store` prop to `Map`; the
application root owns the map state and actions. A retired view releases the
map engine promptly, even if an outgoing transition keeps the DOM mounted.
The outgoing map canvas therefore disappears when its owner retires; an exit
transition can animate the surrounding static layout but does not keep a live
map engine running.
For application business events, dispatch a typed child action from the render
component and handle its presented action in the parent reducer. The
`onMapClick` prop remains available for standalone use.

For example, this is the map render component supplied to `defineViews`:

```svelte
<script lang="ts">
  import { Map, type MapState, type MapAction } from '@composable-svelte/maps';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';

  let { store, surface }: PresentationFeatureViewProps<MapState, MapAction> = $props();
</script>

<div use:surface>
  <Map {store} onMapClick={(lngLat) => store.dispatch({ type: 'mapClicked', lngLat })} />
</div>
```

Pass that same `store` to declarative layers, popups, and the tile provider
control inside the render component. Their pending work stops when the view
retires. Native marker drag, popup close, and feature click or hover currently
do not dispatch corresponding store actions; use the documented `mapClicked`
action for map clicks.
`MapPopup` copies its child markup into the native popup when it opens. Later
changes to child content and event handlers inside that markup are not copied;
`isOpen` and `position` prop changes are synchronized.

The parent reducer handles the presented `mapClicked` action. The package's
Chromium test suite (`pnpm test:browser` from the package directory) exercises
this pattern with a real MapLibre engine.

## Tile Providers

Switch between different map styles on the fly.

### Using Built-in Providers

```typescript
const store = createStore({
  initialState: createInitialMapState({
    tileProvider: 'carto-dark',  // 'openstreetmap', 'stadia', 'carto-light', 'carto-dark', 'maptiler'
    center: [-74.006, 40.7128],
    zoom: 12
  }),
  reducer: mapReducer
});
```

### Dynamic Provider Switching

```svelte
<script>
  import { Map, TileProviderControl } from '@composable-svelte/maps';
</script>

<Map store={mapStore}>
  <TileProviderControl store={mapStore} position="top-right" />
</Map>
```

### Custom Tile Provider

<!-- consumer-file: custom.ts -->
```typescript
import { createStore } from '@composable-svelte/core';
import { createInitialMapState, mapReducer } from '@composable-svelte/maps';

const store = createStore({
  initialState: createInitialMapState({}),
  reducer: mapReducer
});
store.dispatch({
  type: 'changeTileProvider',
  provider: 'custom',
  customURL: 'https://your-tiles.com/style.json',
  customAttribution: '© Your Maps'
});
```


## API

### Types

```typescript
interface MapState {
  accessToken?: string;   // tile provider API key, or Mapbox access token
  viewport: {
    center: [number, number];  // [lng, lat]
    zoom: number;
    bearing: number;
    pitch: number;
  };
  markers: Marker[];
  // ...
}

type MapAction =
  | { type: 'setCenter'; center: [number, number] }
  | { type: 'setZoom'; zoom: number }
  | { type: 'addMarker'; marker: Marker }
  // ...
```

### Functions

```typescript
// Create initial map state
function createInitialMapState(config: {
  accessToken?: string;
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
}): MapState

// Map reducer
const mapReducer: Reducer<MapState, MapAction, {}>
```

## Roadmap

### Phase 12A: Core Foundation ✅ **COMPLETE**
- [x] Map component infrastructure
- [x] MapPrimitive with Maplibre GL integration
- [x] Injectable map adapters (MapLibre built in, Mapbox opt-in)
- [x] Basic mapReducer with viewport management
- [x] Marker support
- [x] Pan/zoom interactions
- [x] Unit tests for reducer

### Phase 12B: Layers & Interactivity ✅ **COMPLETE**
- [x] GeoJSON layer component
- [x] Heatmap layer component
- [x] Popup system
- [x] Feature hover/click handling
- [x] Multiple tile providers
- [x] TileProviderControl component

### Phase 12C: Advanced Features 🚧 **IN PROGRESS**
- [x] Multiple tile provider support
- [ ] 3D buildings layer
- [ ] Marker clustering with supercluster
- [ ] Geocoding/search component
- [ ] Drawing tools (polygon, line, circle)
- [ ] Routing/directions support

## Development Status

**Phase 12B Complete, Phase 12C in progress!** See the [Phase 12 Plan](https://github.com/jonathanbelolo/composable-svelte/blob/main/plans/phase-12/PHASE-12-PLAN.md) for detailed roadmap.

## Dependencies

- `maplibre-gl` ^4.7.1 — open source mapping library, a real dependency
- `mapbox-gl` ^3.0.0 — **optional peer**, installed only if you want the Mapbox
  adapter. It was previously an `optionalDependency`, which npm installs by
  default, so every consumer received 58 MB of an SDK nothing imported.

## License

MIT © Jonathan Belolo

## Related Packages

- [`@composable-svelte/core`](https://www.npmjs.com/package/@composable-svelte/core) - Core Composable Architecture
- [`@composable-svelte/charts`](https://www.npmjs.com/package/@composable-svelte/charts) - Data visualization components

## Resources

- [Maplibre GL Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [Mapbox GL Documentation](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Phase 12 Plan](https://github.com/jonathanbelolo/composable-svelte/blob/main/plans/phase-12/PHASE-12-PLAN.md)

### Custom adapter camera completion

The built-in MapLibre and Mapbox adapters tag each flight with an increasing
`currentFlightId` and pass `{ flightId }` through engine event data. This lets
MapPrimitive distinguish synchronous completion of an interrupted old flight
from completion of its replacement, including duration-zero flights. Custom
adapters can implement the same optional MapAdapter capability: update the ID
before invoking the engine and preserve each flight's ID in its `moveend` data.
Adapters omitting it retain legacy completion behavior and cannot provide this
interrupted-flight distinction. Ordinary untagged user movement still updates
the viewport. A viewport observer can replace a target or unmount the map safely.

Pending layers belong to their adapter's map and style listener. Removal, style
replacement, and destruction retire obsolete callbacks; callers do not install
style-ready listeners or retry layer addition themselves.
