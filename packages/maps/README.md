# @composable-svelte/maps

> Interactive map components for Composable Svelte

**Status**: 🚧 **In Development** (Phase 12A)

## Overview

`@composable-svelte/maps` provides state-driven, interactive map components built on top of [Maplibre GL](https://maplibre.org/) (open source) with [Mapbox GL](https://www.mapbox.com/mapbox-gljs) compatibility. All map state is managed using the Composable Architecture patterns from `@composable-svelte/core`.

## Features

- 🗺️ **State-Driven**: All map state managed via reducers (viewport, markers, layers)
- 🌍 **Open Source**: Built on Maplibre GL (no API key required)
- 📦 **Mapbox Compatible**: Optional Mapbox GL support for users with API keys
- 🖱️ **Interactive**: Pan, zoom, markers, popups
- ⚡ **Performant**: GPU-accelerated rendering via WebGL
- ♿ **Accessible**: ARIA labels, keyboard navigation
- 📱 **Responsive**: Touch gestures, adaptive UI
- 🧪 **Testable**: Comprehensive reducer tests with TestStore

## Installation

```bash
pnpm add @composable-svelte/maps
```

**Peer dependencies**:
- `@composable-svelte/core` ^0.3.0
- `svelte` ^5.0.0

## Quick Start

```typescript
import { Map, createInitialMapState, mapReducer } from '@composable-svelte/maps';
import { createStore } from '@composable-svelte/core';

const store = createStore({
  initialState: createInitialMapState({
    provider: 'maplibre',
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

```svelte
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
    provider: 'maplibre',
    center: [-74.006, 40.7128],
    zoom: 12
  }),
  reducer: mapReducer
});
```

### Mapbox GL (Optional)

Requires Mapbox API key. Better performance and more features.

```typescript
const store = createStore({
  initialState: createInitialMapState({
    provider: 'mapbox',
    accessToken: process.env.MAPBOX_TOKEN,
    center: [-74.006, 40.7128],
    zoom: 12
  }),
  reducer: mapReducer
});
```

## API

### Types

```typescript
interface MapState {
  provider: 'maplibre' | 'mapbox';
  accessToken?: string;
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
  provider?: 'maplibre' | 'mapbox';
  accessToken?: string;
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
}): MapState

// Map reducer
const mapReducer: Reducer<MapState, MapAction, {}>
```

## Roadmap

### Phase 12A: Core Foundation ✅ **IN PROGRESS**
- [x] Map component infrastructure
- [x] MapPrimitive with Maplibre GL integration
- [x] Mapbox adapter support
- [x] Basic mapReducer with viewport management
- [x] Marker support
- [x] Pan/zoom interactions
- [ ] Unit tests for reducer

### Phase 12B: Layers & Interactivity (Planned)
- [ ] GeoJSON layer component
- [ ] Heatmap layer component
- [ ] Popup system
- [ ] Feature hover/click handling

### Phase 12C: Advanced Features (Planned)
- [ ] Marker clustering
- [ ] Geocoding/search component
- [ ] Drawing tools
- [ ] Routing/directions

## Development Status

**Phase 12A in progress!** See the [Phase 12 Plan](../../plans/phase-12/PHASE-12-PLAN.md) for detailed roadmap.

## Dependencies

- `maplibre-gl` ^4.7.0 - Open source mapping library
- `mapbox-gl` ^3.7.0 (optional) - Mapbox GL JS

## License

MIT © Jonathan Belolo

## Related Packages

- [`@composable-svelte/core`](../core) - Core Composable Architecture
- [`@composable-svelte/charts`](../charts) - Data visualization components

## Resources

- [Maplibre GL Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [Mapbox GL Documentation](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Phase 12 Plan](../../plans/phase-12/PHASE-12-PLAN.md)
