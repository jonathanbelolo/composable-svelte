import { defineApplication, ManagedIntegrationBuilder, optionalSlot, defineViews } from '@composable-svelte/core/application';
import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import { createInitialMapState, mapReducer, type MapState, type MapAction } from '@composable-svelte/maps';
import MapFeature from './MapFeature.svelte';

export interface State { map: MapState | null; lastClick: [number, number] | null }
export type Action = { type: 'map'; action: PresentationAction<MapAction> } | { type: 'close' };
const rootReducer: Reducer<State, Action, object> = (state, action) => {
  if (action.type === 'close') return [{ ...state, map: null }, Effect.none()];
  if (action.type === 'map' && action.action.type === 'presented' && action.action.action.type === 'mapClicked') {
    return [{ ...state, lastClick: action.action.action.lngLat }, Effect.none()];
  }
  return [state, Effect.none()];
};
const mapSlot = optionalSlot<State, Action>()('map');
export const composition = new ManagedIntegrationBuilder<State, Action, object>(rootReducer)
  .with(mapSlot, mapReducer).build();
export const definition = defineApplication(composition, {
  initialState: () => ({ map: createInitialMapState({ center: [0, 0], zoom: 2 }), lastClick: null })
});
export const views = defineViews(composition, { map: { render: MapFeature } });
