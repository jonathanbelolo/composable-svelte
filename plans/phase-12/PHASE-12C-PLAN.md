# Phase 12C: Advanced Features - Implementation Plan

**Status**: In Progress
**Dependencies**: Phase 12A (Core Foundation), Phase 12B (Layers & Interactivity)
**Timeline**: Week 5-6 of Phase 12
**Priority**: Medium

## Overview

Phase 12C implements advanced mapping features that enable sophisticated use cases:
- **Marker Clustering**: Handle thousands of markers efficiently
- **Geocoding/Search**: Find locations by name or address
- **Drawing Tools**: Allow users to draw shapes on the map
- **Routing**: Display directions between points
- **3D Buildings**: Visualize building extrusions
- **Multiple Tile Providers**: Support various map styles

## Goals

1. Implement marker clustering using supercluster library
2. Create geocoding search component with multiple provider support
3. Add drawing tools for polygons, lines, and circles
4. Implement routing with OpenRouteService integration
5. Add 3D buildings layer support
6. Support multiple tile providers (OpenStreetMap, Stadia, Maptiler, etc.)

## Feature Breakdown

### Feature 1: Marker Clustering

**Goal**: Display thousands of markers without performance issues

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  markerClustering: {
    enabled: boolean;
    radius: number;  // Clustering radius in pixels
    maxZoom: number; // Max zoom to cluster at
    clusters: Array<{
      id: string;
      position: [number, number];
      count: number;
      markers: string[];  // IDs of markers in cluster
    }>;
  };
}
```

**Actions**:
```typescript
| { type: 'enableClustering'; radius?: number; maxZoom?: number }
| { type: 'disableClustering' }
| { type: 'updateClusters' }  // Internal action to recalculate clusters
```

**Dependencies**:
```json
{
  "supercluster": "^8.0.1"
}
```

**Implementation**:
1. Add supercluster to package.json
2. Create clustering reducer logic in map.reducer.ts
3. Create MarkerCluster.svelte component
4. Update MapPrimitive to render clusters
5. Add cluster click handlers (zoom to expand)

**Files to Create/Modify**:
- `packages/maps/src/lib/clustering/cluster.ts` (NEW)
- `packages/maps/src/lib/clustering/cluster.types.ts` (NEW)
- `packages/maps/src/lib/components/MarkerCluster.svelte` (NEW)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY - add clustering logic)
- `packages/maps/src/lib/types/map.types.ts` (MODIFY - add clustering types)

---

### Feature 2: Geocoding/Search

**Goal**: Search for locations by name or address

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  geocoding: {
    query: string;
    isSearching: boolean;
    results: Array<{
      id: string;
      name: string;
      position: [number, number];
      bbox?: [[number, number], [number, number]];
      type: string;  // 'city', 'street', 'poi', etc.
    }>;
    error: string | null;
  };
}
```

**Actions**:
```typescript
| { type: 'geocodingSearch'; query: string }
| { type: 'geocodingResults'; results: GeocodingResult[] }
| { type: 'geocodingSelect'; result: GeocodingResult }
| { type: 'geocodingClear' }
| { type: 'geocodingError'; error: string }
```

**Geocoding Providers**:
1. **Nominatim** (OpenStreetMap) - Free, no API key
2. **Mapbox Geocoding** - Requires API key
3. **Maptiler Geocoding** - Requires API key

**Implementation**:
1. Create geocoding utilities for each provider
2. Create Geocoder.svelte component (search input with results dropdown)
3. Add geocoding effects in reducer
4. Add geocoding state management

**Files to Create/Modify**:
- `packages/maps/src/lib/geocoding/nominatim.ts` (NEW)
- `packages/maps/src/lib/geocoding/mapbox.ts` (NEW)
- `packages/maps/src/lib/geocoding/geocoding.types.ts` (NEW)
- `packages/maps/src/lib/components/Geocoder.svelte` (NEW)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY)

---

### Feature 3: Drawing Tools

**Goal**: Allow users to draw shapes on the map

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  drawing: {
    mode: 'none' | 'point' | 'line' | 'polygon' | 'circle';
    currentDrawing: {
      id: string;
      type: 'point' | 'line' | 'polygon' | 'circle';
      coordinates: [number, number][];
      radius?: number;  // For circles
    } | null;
    drawings: Array<{
      id: string;
      type: 'point' | 'line' | 'polygon' | 'circle';
      coordinates: [number, number][];
      radius?: number;
      style: DrawingStyle;
    }>;
  };
}
```

**Actions**:
```typescript
| { type: 'startDrawing'; mode: DrawingMode }
| { type: 'addDrawingPoint'; position: [number, number] }
| { type: 'completeDrawing' }
| { type: 'cancelDrawing' }
| { type: 'deleteDrawing'; id: string }
| { type: 'clearDrawings' }
```

**Implementation**:
1. Create drawing state management
2. Create DrawControl.svelte component (toolbar with mode buttons)
3. Add map click handlers for drawing
4. Render drawings as GeoJSON layers
5. Add keyboard shortcuts (Esc to cancel, Enter to complete)

**Files to Create/Modify**:
- `packages/maps/src/lib/drawing/drawing.types.ts` (NEW)
- `packages/maps/src/lib/components/DrawControl.svelte` (NEW)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY)

---

### Feature 4: Routing/Directions

**Goal**: Display routes between points

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  routing: {
    isCalculating: boolean;
    waypoints: Array<{
      id: string;
      position: [number, number];
      name?: string;
    }>;
    route: {
      coordinates: [number, number][];
      distance: number;  // meters
      duration: number;  // seconds
      instructions: Array<{
        text: string;
        distance: number;
        duration: number;
        position: [number, number];
      }>;
    } | null;
    error: string | null;
  };
}
```

**Actions**:
```typescript
| { type: 'addWaypoint'; position: [number, number]; name?: string }
| { type: 'removeWaypoint'; id: string }
| { type: 'calculateRoute' }
| { type: 'routeCalculated'; route: Route }
| { type: 'routeError'; error: string }
| { type: 'clearRoute' }
```

**Routing Provider**: OpenRouteService (free, open source)

**Implementation**:
1. Create routing utilities (API client for OpenRouteService)
2. Create RoutingControl.svelte component
3. Add waypoint management
4. Render route as LineString layer
5. Display turn-by-turn instructions

**Files to Create/Modify**:
- `packages/maps/src/lib/routing/openrouteservice.ts` (NEW)
- `packages/maps/src/lib/routing/routing.types.ts` (NEW)
- `packages/maps/src/lib/components/RoutingControl.svelte` (NEW)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY)

---

### Feature 5: 3D Buildings

**Goal**: Show building extrusions for visual depth

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  buildings3D: {
    enabled: boolean;
    extrusionOpacity: number;
    fillColor: string;
  };
}
```

**Actions**:
```typescript
| { type: 'enable3DBuildings'; extrusionOpacity?: number; fillColor?: string }
| { type: 'disable3DBuildings' }
| { type: 'update3DBuildingStyle'; extrusionOpacity?: number; fillColor?: string }
```

**Implementation**:
1. Create Buildings3DLayer.svelte component
2. Use Maplibre's 3D extrusion capabilities
3. Fetch building height data from OpenStreetMap

**Files to Create/Modify**:
- `packages/maps/src/lib/components/Buildings3DLayer.svelte` (NEW)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY)

---

### Feature 6: Multiple Tile Providers

**Goal**: Support various map styles and tile sources

**State Changes**:
```typescript
interface MapState {
  // ... existing fields
  tileProvider: 'openstreetmap' | 'stadia' | 'maptiler' | 'mapbox' | 'custom';
  customTileURL?: string;
  customAttribution?: string;
}
```

**Actions**:
```typescript
| { type: 'changeTileProvider'; provider: TileProvider; customURL?: string; customAttribution?: string }
```

**Supported Providers**:
1. **OpenStreetMap** - Free, no API key
2. **Stadia Maps** - Free tier available
3. **Maptiler** - Free tier (100k requests/month)
4. **Mapbox** - Requires API key
5. **Custom** - User-provided tile URL

**Implementation**:
1. Create tile provider configuration
2. Update MapPrimitive to switch styles
3. Create TileProviderControl.svelte component (dropdown)

**Files to Create/Modify**:
- `packages/maps/src/lib/utils/tile-providers.ts` (NEW)
- `packages/maps/src/lib/components/TileProviderControl.svelte` (NEW)
- `packages/maps/src/lib/utils/maplibre-adapter.ts` (MODIFY)
- `packages/maps/src/lib/reducer/map.reducer.ts` (MODIFY)

---

## Implementation Order

**Priority 1** (High Value, Low Complexity):
1. Multiple Tile Providers - Quick win, enhances visual variety
2. 3D Buildings - Simple layer addition, impressive visual effect

**Priority 2** (High Value, Medium Complexity):
3. Marker Clustering - Critical for performance with many markers
4. Geocoding/Search - Essential for user-friendly maps

**Priority 3** (Medium Value, Higher Complexity):
5. Drawing Tools - Useful for specific use cases
6. Routing - Complex but valuable for navigation apps

## Testing Strategy

### Unit Tests
- Clustering algorithm accuracy
- Geocoding provider integration
- Drawing shape validation
- Route calculation

### Integration Tests
- Cluster rendering with map zoom
- Search results display
- Drawing completion workflow
- Route display and waypoint management

### Visual Tests
- 3D buildings render correctly
- Clusters expand on click
- Route line follows roads
- Drawings appear as expected

## Dependencies to Add

```json
{
  "dependencies": {
    "supercluster": "^8.0.1",
    "@types/supercluster": "^7.1.0"
  }
}
```

## Success Criteria

1. ✅ Marker clustering handles 10,000+ markers smoothly
2. ✅ Geocoding search returns results in < 500ms
3. ✅ Drawing tools work on desktop and mobile
4. ✅ Routing displays accurate turn-by-turn directions
5. ✅ 3D buildings render at 60fps
6. ✅ Tile provider switching works seamlessly
7. ✅ All features integrate with existing Composable Architecture
8. ✅ Comprehensive tests for all features
9. ✅ Styleguide examples demonstrate each feature

## Documentation

Each feature will include:
- Type definitions and state structure
- Reducer action documentation
- Component API reference
- Usage examples
- Integration guide

## Timeline

**Week 5**:
- Days 1-2: Multiple tile providers + 3D buildings
- Days 3-4: Marker clustering
- Day 5: Geocoding/search

**Week 6**:
- Days 1-2: Drawing tools
- Days 3-4: Routing
- Day 5: Testing, documentation, styleguide integration
