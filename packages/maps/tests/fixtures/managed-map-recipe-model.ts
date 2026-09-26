/**
 * Managed Map Recipe Model for Batch B2 proof
 * Uses real Composable Svelte core production APIs:
 * - defineApplication
 * - ManagedIntegrationBuilder
 * - optionalSlot
 * - defineViews
 * - ChildView, FeatureViewProps
 */

import {
  defineApplication,
  ManagedIntegrationBuilder,
  optionalSlot,
  type ChildView,
  type FeatureViewProps,
  type PresentationFeatureViewProps
} from '@composable-svelte/core/application';
import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../../src/lib/reducers/map.reducer.js';
import type { MapState, MapAction, MapAdapter, LngLat } from '../../src/lib/types/map.types.js';

export interface AppDeps {}

export interface AppState {
  title: string;
  map: MapState | null;
  sidebarMap: MapState | null;
  lastClickedCoords: LngLat | null;
}

export type AppAction =
  | { type: 'map'; action: PresentationAction<MapAction> }
  | { type: 'sidebarMap'; action: PresentationAction<MapAction> }
  | { type: 'openMap' }
  | { type: 'closeMap' }
  | { type: 'replaceMap' }
  | { type: 'openBothMaps' }
  | { type: 'closeMapA' };

export const mapSlot = optionalSlot<AppState, AppAction>()('map');
export const sidebarMapSlot = optionalSlot<AppState, AppAction>()('sidebarMap');

export const rootReducer: Reducer<AppState, AppAction, AppDeps> = (state, action) => {
  switch (action.type) {
    case 'map': {
      if (action.action.type === 'presented' && action.action.action.type === 'mapClicked') {
        return [
          {
            ...state,
            lastClickedCoords: action.action.action.lngLat
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'openMap':
      return [
        {
          ...state,
          map: createInitialMapState({
            center: [0, 0],
            zoom: 2,
            bearing: 0,
            pitch: 0
          })
        },
        Effect.none()
      ];

    case 'closeMap':
      return [{ ...state, map: null }, Effect.none()];

    case 'replaceMap':
      return [
        {
          ...state,
          map: createInitialMapState({
            center: [50, 50],
            zoom: 10,
            bearing: 0,
            pitch: 0
          })
        },
        Effect.none()
      ];

    case 'openBothMaps':
      return [
        {
          ...state,
          map: createInitialMapState({
            center: [10, 20],
            zoom: 4,
            bearing: 0,
            pitch: 0
          }),
          sidebarMap: createInitialMapState({
            center: [30, 40],
            zoom: 6,
            bearing: 0,
            pitch: 0
          })
        },
        Effect.none()
      ];

    case 'closeMapA':
      return [{ ...state, map: null }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

export const composition = new ManagedIntegrationBuilder<AppState, AppAction, AppDeps>(rootReducer)
  .with(mapSlot, mapReducer, { replaceOn: (action) => action.type === 'replaceMap' })
  .with(sidebarMapSlot, mapReducer)
  .build();

export const initialAppState = (): AppState => ({
  title: 'Managed Map Proof Application',
  map: createInitialMapState({
    center: [12.4924, 41.8902],
    zoom: 10,
    bearing: 0,
    pitch: 0
  }),
  sidebarMap: null,
  lastClickedCoords: null
});

export const mapAppDefinition = defineApplication(composition, {
  initialState: initialAppState
});
