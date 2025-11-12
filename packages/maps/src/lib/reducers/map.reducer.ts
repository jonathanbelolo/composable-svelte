/**
 * @file map.reducer.ts
 * @description Core map state management using Composable Architecture
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { MapState, MapAction, LngLat, TileProvider } from '../types/map.types';
import { getStyleURL } from '../utils/tile-providers';

/**
 * Map reducer
 * Pure reducer function that manages all map state transitions
 */
export const mapReducer: Reducer<MapState, MapAction, {}> = (
  state,
  action,
  _deps
) => {
  switch (action.type) {
    // ========================================================================
    // Viewport Actions
    // ========================================================================

    case 'setCenter': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            center: action.center
          }
        },
        Effect.none()
      ];
    }

    case 'setZoom': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            zoom: action.zoom
          }
        },
        Effect.none()
      ];
    }

    case 'setBearing': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            bearing: action.bearing
          }
        },
        Effect.none()
      ];
    }

    case 'setPitch': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            pitch: action.pitch
          }
        },
        Effect.none()
      ];
    }

    case 'fitBounds': {
      // Note: Actual bounds calculation will be done by the map adapter
      // This just stores the target bounds
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            bounds: action.bounds
          }
        },
        Effect.none()
      ];
    }

    case 'flyTo': {
      // Set flyTo target to trigger smooth animation in MapPrimitive
      // Don't update viewport directly - let the map animation update it
      const { center, zoom, duration } = action;
      return [
        {
          ...state,
          flyToTarget: {
            center,
            ...(zoom !== undefined && { zoom }),
            ...(duration !== undefined && { duration })
          }
        },
        Effect.none()
      ];
    }

    case 'flyToCompleted': {
      // Clear flyTo target after animation starts
      const { flyToTarget, ...rest } = state;
      return [
        rest,
        Effect.none()
      ];
    }

    case 'resetNorth': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            bearing: 0,
            pitch: 0
          }
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Interaction Actions
    // ========================================================================

    case 'panStart': {
      return [
        {
          ...state,
          isDragging: true
        },
        Effect.none()
      ];
    }

    case 'panMove': {
      // Pan delta is handled by the map adapter
      return [state, Effect.none()];
    }

    case 'panEnd': {
      return [
        {
          ...state,
          isDragging: false
        },
        Effect.none()
      ];
    }

    case 'zoomIn': {
      // Use flyTo for smooth zoom animation
      const targetZoom = Math.min(state.viewport.zoom + 1, 22); // Max zoom 22
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            zoom: targetZoom
          },
          flyToTarget: {
            center: state.viewport.center,
            zoom: targetZoom,
            duration: 300 // Shorter duration for zoom
          }
        },
        Effect.none()
      ];
    }

    case 'zoomOut': {
      // Use flyTo for smooth zoom animation
      const targetZoom = Math.max(state.viewport.zoom - 1, 0); // Min zoom 0
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            zoom: targetZoom
          },
          flyToTarget: {
            center: state.viewport.center,
            zoom: targetZoom,
            duration: 300 // Shorter duration for zoom
          }
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Marker Actions
    // ========================================================================

    case 'addMarker': {
      return [
        {
          ...state,
          markers: [...state.markers, action.marker]
        },
        Effect.none()
      ];
    }

    case 'removeMarker': {
      return [
        {
          ...state,
          markers: state.markers.filter((m) => m.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'updateMarker': {
      return [
        {
          ...state,
          markers: state.markers.map((m) =>
            m.id === action.id ? { ...m, ...action.updates } : m
          )
        },
        Effect.none()
      ];
    }

    case 'moveMarker': {
      return [
        {
          ...state,
          markers: state.markers.map((m) =>
            m.id === action.id ? { ...m, position: action.position } : m
          )
        },
        Effect.none()
      ];
    }

    case 'clearMarkers': {
      return [
        {
          ...state,
          markers: []
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Viewport Change (from map component)
    // ========================================================================

    case 'viewportChanged': {
      return [
        {
          ...state,
          viewport: action.viewport
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Map Lifecycle Actions
    // ========================================================================

    case 'mapLoaded': {
      return [
        {
          ...state,
          isLoaded: true,
          isLoading: false,
          error: null
        },
        Effect.none()
      ];
    }

    case 'mapError': {
      return [
        {
          ...state,
          isLoaded: false,
          isLoading: false,
          error: action.error
        },
        Effect.none()
      ];
    }

    case 'changeStyle': {
      return [
        {
          ...state,
          style: action.style
        },
        Effect.none()
      ];
    }

    // Layer actions
    case 'addLayer': {
      return [
        {
          ...state,
          layers: [...state.layers, action.layer]
        },
        Effect.none()
      ];
    }

    case 'removeLayer': {
      return [
        {
          ...state,
          layers: state.layers.filter((layer) => layer.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'toggleLayerVisibility': {
      return [
        {
          ...state,
          layers: state.layers.map((layer) =>
            layer.id === action.id ? { ...layer, visible: !layer.visible } : layer
          )
        },
        Effect.none()
      ];
    }

    case 'updateLayerStyle': {
      return [
        {
          ...state,
          layers: state.layers.map((layer) =>
            layer.id === action.id
              ? { ...layer, style: { ...layer.style, ...action.style } }
              : layer
          )
        },
        Effect.none()
      ];
    }

    case 'clearLayers': {
      return [
        {
          ...state,
          layers: []
        },
        Effect.none()
      ];
    }

    // Popup actions
    case 'openPopup': {
      // Update existing popup or add new one
      const existingIndex = state.popups.findIndex((p) => p.id === action.popup.id);

      return [
        {
          ...state,
          popups:
            existingIndex >= 0
              ? state.popups.map((p) =>
                  p.id === action.popup.id ? { ...action.popup, isOpen: true } : p
                )
              : [...state.popups, { ...action.popup, isOpen: true }]
        },
        Effect.none()
      ];
    }

    case 'closePopup': {
      return [
        {
          ...state,
          popups: state.popups.map((popup) =>
            popup.id === action.id ? { ...popup, isOpen: false } : popup
          )
        },
        Effect.none()
      ];
    }

    case 'closeAllPopups': {
      return [
        {
          ...state,
          popups: state.popups.map((popup) => ({ ...popup, isOpen: false }))
        },
        Effect.none()
      ];
    }

    // Feature interaction actions
    case 'featureHovered': {
      return [
        {
          ...state,
          hoveredFeature: action.feature
        },
        Effect.none()
      ];
    }

    case 'featureUnhovered': {
      return [
        {
          ...state,
          hoveredFeature: null
        },
        Effect.none()
      ];
    }

    case 'featureClicked': {
      return [
        {
          ...state,
          selectedFeatures: [...state.selectedFeatures, action.feature]
        },
        Effect.none()
      ];
    }

    case 'clearSelection': {
      return [
        {
          ...state,
          selectedFeatures: []
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Tile Provider Actions
    // ========================================================================

    case 'changeTileProvider': {
      const { provider, customURL, customAttribution } = action;
      return [
        {
          ...state,
          tileProvider: provider,
          ...(customURL ? { customTileURL: customURL } : {}),
          ...(customAttribution ? { customAttribution } : {})
        },
        Effect.none()
      ];
    }

    default: {
      const _exhaustive: never = action;
      return [state, Effect.none()];
    }
  }
};

/**
 * Create initial map state
 */
export function createInitialMapState(config: {
  provider?: 'maplibre' | 'mapbox';
  accessToken?: string;
  tileProvider?: TileProvider;
  center?: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  style?: string;
  markers?: any[];
}): MapState {
  const provider = config.provider ?? 'maplibre';
  const tileProvider = config.tileProvider ?? 'openstreetmap';

  return {
    provider,
    ...(config.accessToken ? { accessToken: config.accessToken } : {}),
    tileProvider,
    viewport: {
      center: config.center ?? [0, 0],
      zoom: config.zoom ?? 2,
      bearing: config.bearing ?? 0,
      pitch: config.pitch ?? 0
    },
    isInteractive: true,
    isDragging: false,
    isZooming: false,
    markers: config.markers ?? [],
    layers: [],
    popups: [],
    hoveredFeature: null,
    selectedFeatures: [],
    style:
      config.style ??
      getStyleURL(tileProvider, config.accessToken),
    isLoaded: false,
    isLoading: false,
    error: null
  };
}
