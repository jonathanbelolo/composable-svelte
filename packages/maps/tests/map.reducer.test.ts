/**
 * @file map.reducer.test.ts
 * @description Unit tests for map reducer
 */

import { describe, it, expect } from 'vitest';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import type { MapState, MapAction } from '../src/lib/types/map.types';

describe('mapReducer', () => {
  const initialState: MapState = createInitialMapState({
    provider: 'maplibre',
    center: [0, 0],
    zoom: 2
  });

  describe('viewport actions', () => {
    it('setCenter updates center', () => {
      const action: MapAction = {
        type: 'setCenter',
        center: [-74.006, 40.7128]
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.center).toEqual([-74.006, 40.7128]);
      expect(newState.viewport.zoom).toBe(2); // Other props unchanged
    });

    it('setZoom updates zoom level', () => {
      const action: MapAction = {
        type: 'setZoom',
        zoom: 10
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.zoom).toBe(10);
      expect(newState.viewport.center).toEqual([0, 0]); // Other props unchanged
    });

    it('setBearing updates bearing', () => {
      const action: MapAction = {
        type: 'setBearing',
        bearing: 45
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.bearing).toBe(45);
    });

    it('setPitch updates pitch', () => {
      const action: MapAction = {
        type: 'setPitch',
        pitch: 30
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.pitch).toBe(30);
    });

    it('flyTo updates center and zoom', () => {
      const action: MapAction = {
        type: 'flyTo',
        center: [-118.2437, 34.0522],
        zoom: 12
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.center).toEqual([-118.2437, 34.0522]);
      expect(newState.viewport.zoom).toBe(12);
    });

    it('resetNorth resets bearing and pitch', () => {
      const rotatedState: MapState = {
        ...initialState,
        viewport: {
          ...initialState.viewport,
          bearing: 90,
          pitch: 45
        }
      };

      const action: MapAction = { type: 'resetNorth' };
      const [newState] = mapReducer(rotatedState, action, {});

      expect(newState.viewport.bearing).toBe(0);
      expect(newState.viewport.pitch).toBe(0);
    });
  });

  describe('interaction actions', () => {
    it('panStart sets isDragging to true', () => {
      const action: MapAction = {
        type: 'panStart',
        position: [0, 0]
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.isDragging).toBe(true);
    });

    it('panEnd sets isDragging to false', () => {
      const draggingState: MapState = {
        ...initialState,
        isDragging: true
      };

      const action: MapAction = { type: 'panEnd' };
      const [newState] = mapReducer(draggingState, action, {});

      expect(newState.isDragging).toBe(false);
    });

    it('zoomIn increases zoom by 1', () => {
      const action: MapAction = { type: 'zoomIn' };
      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.zoom).toBe(3); // was 2
    });

    it('zoomOut decreases zoom by 1', () => {
      const action: MapAction = { type: 'zoomOut' };
      const [newState] = mapReducer(initialState, action, {});

      expect(newState.viewport.zoom).toBe(1); // was 2
    });
  });

  describe('marker actions', () => {
    it('addMarker adds a marker', () => {
      const marker = {
        id: 'marker-1',
        position: [-74.006, 40.7128] as [number, number]
      };

      const action: MapAction = {
        type: 'addMarker',
        marker
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.markers).toHaveLength(1);
      expect(newState.markers[0]).toEqual(marker);
    });

    it('removeMarker removes a marker by id', () => {
      const stateWithMarker: MapState = {
        ...initialState,
        markers: [
          { id: 'marker-1', position: [-74.006, 40.7128] },
          { id: 'marker-2', position: [-118.2437, 34.0522] }
        ]
      };

      const action: MapAction = {
        type: 'removeMarker',
        id: 'marker-1'
      };

      const [newState] = mapReducer(stateWithMarker, action, {});

      expect(newState.markers).toHaveLength(1);
      expect(newState.markers[0].id).toBe('marker-2');
    });

    it('updateMarker updates marker properties', () => {
      const stateWithMarker: MapState = {
        ...initialState,
        markers: [{ id: 'marker-1', position: [-74.006, 40.7128] }]
      };

      const action: MapAction = {
        type: 'updateMarker',
        id: 'marker-1',
        updates: { draggable: true }
      };

      const [newState] = mapReducer(stateWithMarker, action, {});

      expect(newState.markers[0].draggable).toBe(true);
    });

    it('moveMarker updates marker position', () => {
      const stateWithMarker: MapState = {
        ...initialState,
        markers: [{ id: 'marker-1', position: [-74.006, 40.7128] }]
      };

      const action: MapAction = {
        type: 'moveMarker',
        id: 'marker-1',
        position: [-118.2437, 34.0522]
      };

      const [newState] = mapReducer(stateWithMarker, action, {});

      expect(newState.markers[0].position).toEqual([-118.2437, 34.0522]);
    });

    it('clearMarkers removes all markers', () => {
      const stateWithMarkers: MapState = {
        ...initialState,
        markers: [
          { id: 'marker-1', position: [-74.006, 40.7128] },
          { id: 'marker-2', position: [-118.2437, 34.0522] }
        ]
      };

      const action: MapAction = { type: 'clearMarkers' };
      const [newState] = mapReducer(stateWithMarkers, action, {});

      expect(newState.markers).toHaveLength(0);
    });
  });

  describe('map lifecycle actions', () => {
    it('mapLoaded sets isLoaded to true', () => {
      const action: MapAction = { type: 'mapLoaded' };
      const [newState] = mapReducer(initialState, action, {});

      expect(newState.isLoaded).toBe(true);
      expect(newState.isLoading).toBe(false);
      expect(newState.error).toBeNull();
    });

    it('mapError sets error state', () => {
      const action: MapAction = {
        type: 'mapError',
        error: 'Failed to load map'
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.isLoaded).toBe(false);
      expect(newState.isLoading).toBe(false);
      expect(newState.error).toBe('Failed to load map');
    });

    it('changeStyle updates style', () => {
      const action: MapAction = {
        type: 'changeStyle',
        style: 'mapbox://styles/mapbox/dark-v11'
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.style).toBe('mapbox://styles/mapbox/dark-v11');
    });
  });
});

describe('createInitialMapState', () => {
  it('creates initial state with defaults', () => {
    const state = createInitialMapState({});

    expect(state.provider).toBe('maplibre');
    expect(state.viewport.center).toEqual([0, 0]);
    expect(state.viewport.zoom).toBe(2);
    expect(state.viewport.bearing).toBe(0);
    expect(state.viewport.pitch).toBe(0);
    expect(state.markers).toEqual([]);
    expect(state.isLoaded).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('creates initial state with custom config', () => {
    const state = createInitialMapState({
      provider: 'mapbox',
      accessToken: 'test-token',
      center: [-74.006, 40.7128],
      zoom: 12,
      bearing: 45,
      pitch: 30
    });

    expect(state.provider).toBe('mapbox');
    expect(state.accessToken).toBe('test-token');
    expect(state.viewport.center).toEqual([-74.006, 40.7128]);
    expect(state.viewport.zoom).toBe(12);
    expect(state.viewport.bearing).toBe(45);
    expect(state.viewport.pitch).toBe(30);
  });

  it('uses openstreetmap style by default', () => {
    const state = createInitialMapState({ provider: 'maplibre' });

    expect(state.style).toBe('https://demotiles.maplibre.org/style.json');
    expect(state.tileProvider).toBe('openstreetmap');
  });

  it('uses specified tile provider', () => {
    const state = createInitialMapState({ provider: 'mapbox', tileProvider: 'carto-dark' });

    expect(state.tileProvider).toBe('carto-dark');
    expect(state.style).toBe('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json');
  });
});
