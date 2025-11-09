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

    it('flyTo sets flyToTarget for smooth animation', () => {
      const action: MapAction = {
        type: 'flyTo',
        center: [-118.2437, 34.0522],
        zoom: 12,
        duration: 2000
      };

      const [newState] = mapReducer(initialState, action, {});

      expect(newState.flyToTarget).toEqual({
        center: [-118.2437, 34.0522],
        zoom: 12,
        duration: 2000
      });
    });

    it('flyToCompleted clears flyToTarget', () => {
      const stateWithFlyTo: MapState = {
        ...initialState,
        flyToTarget: {
          center: [-118.2437, 34.0522],
          zoom: 12
        }
      };

      const action: MapAction = { type: 'flyToCompleted' };
      const [newState] = mapReducer(stateWithFlyTo, action, {});

      expect(newState.flyToTarget).toBeUndefined();
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

    it('zoomIn sets flyToTarget with increased zoom', () => {
      const action: MapAction = { type: 'zoomIn' };
      const [newState] = mapReducer(initialState, action, {});

      expect(newState.flyToTarget).toEqual({
        center: [0, 0],
        zoom: 3, // was 2, now 3
        duration: 300
      });
    });

    it('zoomOut sets flyToTarget with decreased zoom', () => {
      const action: MapAction = { type: 'zoomOut' };
      const [newState] = mapReducer(initialState, action, {});

      expect(newState.flyToTarget).toEqual({
        center: [0, 0],
        zoom: 1, // was 2, now 1
        duration: 300
      });
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

describe('layer actions', () => {
  const initialState: MapState = createInitialMapState({
    provider: 'maplibre',
    center: [0, 0],
    zoom: 2
  });

  const sampleLayer = {
    id: 'test-layer',
    type: 'geojson' as const,
    data: {
      type: 'FeatureCollection' as const,
      features: []
    },
    style: {
      fillColor: '#0080ff',
      fillOpacity: 0.5
    },
    visible: true,
    interactive: true
  };

  it('addLayer adds a layer', () => {
    const action: MapAction = {
      type: 'addLayer',
      layer: sampleLayer
    };

    const [newState] = mapReducer(initialState, action, {});

    expect(newState.layers).toHaveLength(1);
    expect(newState.layers[0]).toEqual(sampleLayer);
  });

  it('removeLayer removes a layer by id', () => {
    const stateWithLayer: MapState = {
      ...initialState,
      layers: [sampleLayer]
    };

    const action: MapAction = {
      type: 'removeLayer',
      id: 'test-layer'
    };

    const [newState] = mapReducer(stateWithLayer, action, {});

    expect(newState.layers).toHaveLength(0);
  });

  it('toggleLayerVisibility toggles visibility', () => {
    const stateWithLayer: MapState = {
      ...initialState,
      layers: [{ ...sampleLayer, visible: true }]
    };

    const action: MapAction = {
      type: 'toggleLayerVisibility',
      id: 'test-layer'
    };

    const [newState] = mapReducer(stateWithLayer, action, {});

    expect(newState.layers[0].visible).toBe(false);
  });

  it('updateLayerStyle updates layer style', () => {
    const stateWithLayer: MapState = {
      ...initialState,
      layers: [sampleLayer]
    };

    const action: MapAction = {
      type: 'updateLayerStyle',
      id: 'test-layer',
      style: { fillColor: '#ff0000', fillOpacity: 0.8 }
    };

    const [newState] = mapReducer(stateWithLayer, action, {});

    expect(newState.layers[0].style.fillColor).toBe('#ff0000');
    expect(newState.layers[0].style.fillOpacity).toBe(0.8);
  });

  it('clearLayers removes all layers', () => {
    const stateWithLayers: MapState = {
      ...initialState,
      layers: [
        sampleLayer,
        { ...sampleLayer, id: 'layer-2' }
      ]
    };

    const action: MapAction = { type: 'clearLayers' };
    const [newState] = mapReducer(stateWithLayers, action, {});

    expect(newState.layers).toHaveLength(0);
  });
});

describe('popup actions', () => {
  const initialState: MapState = createInitialMapState({
    provider: 'maplibre',
    center: [0, 0],
    zoom: 2
  });

  const samplePopup = {
    id: 'test-popup',
    position: [-74.006, 40.7128] as [number, number],
    content: '<h3>Test Popup</h3>',
    isOpen: true,
    closeButton: true,
    closeOnClick: false
  };

  it('openPopup adds a popup', () => {
    const action: MapAction = {
      type: 'openPopup',
      popup: samplePopup
    };

    const [newState] = mapReducer(initialState, action, {});

    expect(newState.popups).toHaveLength(1);
    expect(newState.popups[0]).toEqual(samplePopup);
  });

  it('openPopup updates existing popup', () => {
    const stateWithPopup: MapState = {
      ...initialState,
      popups: [{ ...samplePopup, isOpen: false }]
    };

    const action: MapAction = {
      type: 'openPopup',
      popup: { ...samplePopup, content: '<h3>Updated</h3>' }
    };

    const [newState] = mapReducer(stateWithPopup, action, {});

    expect(newState.popups).toHaveLength(1);
    expect(newState.popups[0].content).toBe('<h3>Updated</h3>');
  });

  it('closePopup closes a popup by id', () => {
    const stateWithPopup: MapState = {
      ...initialState,
      popups: [samplePopup]
    };

    const action: MapAction = {
      type: 'closePopup',
      id: 'test-popup'
    };

    const [newState] = mapReducer(stateWithPopup, action, {});

    expect(newState.popups[0].isOpen).toBe(false);
  });

  it('closeAllPopups closes all popups', () => {
    const stateWithPopups: MapState = {
      ...initialState,
      popups: [
        samplePopup,
        { ...samplePopup, id: 'popup-2' }
      ]
    };

    const action: MapAction = { type: 'closeAllPopups' };
    const [newState] = mapReducer(stateWithPopups, action, {});

    expect(newState.popups.every(p => !p.isOpen)).toBe(true);
  });
});
