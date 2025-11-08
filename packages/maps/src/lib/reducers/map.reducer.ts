/**
 * @file map.reducer.ts
 * @description Core map state management using Composable Architecture
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { MapState, MapAction, LngLat } from '../types/map.types';

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
      // FlyTo is handled by the map adapter
      // Reducer just updates the target state
      const { center, zoom } = action;
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            center,
            ...(zoom !== undefined ? { zoom } : {})
          }
        },
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
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            zoom: state.viewport.zoom + 1
          }
        },
        Effect.none()
      ];
    }

    case 'zoomOut': {
      return [
        {
          ...state,
          viewport: {
            ...state.viewport,
            zoom: state.viewport.zoom - 1
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
  center?: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  style?: string;
  markers?: any[];
}): MapState {
  const provider = config.provider ?? 'maplibre';

  return {
    provider,
    ...(config.accessToken ? { accessToken: config.accessToken } : {}),
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
    style:
      config.style ??
      (provider === 'maplibre'
        ? 'https://demotiles.maplibre.org/style.json'
        : 'mapbox://styles/mapbox/streets-v12'),
    isLoaded: false,
    isLoading: false,
    error: null
  };
}
