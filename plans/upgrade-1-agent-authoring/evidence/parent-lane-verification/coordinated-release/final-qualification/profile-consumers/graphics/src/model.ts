import { defineApplication, ManagedIntegrationBuilder, optionalSlot, defineViews } from '@composable-svelte/core/application';
import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import { createInitialGraphicsState, graphicsReducer, type GraphicsState, type GraphicsAction } from '@composable-svelte/graphics';
import GraphicsFeature from './GraphicsFeature.svelte';

export interface State {
  graphics: GraphicsState | null;
  clickedCount: number;
}

export type Action =
  | { type: 'graphics'; action: PresentationAction<GraphicsAction> }
  | { type: 'close' }
  | { type: 'rotate' };

const rootReducer: Reducer<State, Action, object> = (state, action) => {
  if (action.type === 'close') return [{ ...state, graphics: null }, Effect.none()];
  if (action.type === 'rotate') {
    return [{ ...state, clickedCount: state.clickedCount + 1 }, Effect.none()];
  }
  return [state, Effect.none()];
};

const graphicsSlot = optionalSlot<State, Action>()('graphics');
export const composition = new ManagedIntegrationBuilder<State, Action, object>(rootReducer)
  .with(graphicsSlot, graphicsReducer)
  .build();

export const definition = defineApplication(composition, {
  initialState: () => ({
    graphics: createInitialGraphicsState({
      backgroundColor: '#1a1a1a',
      sceneId: 'test-scene'
    }),
    clickedCount: 0
  })
});

export const views = defineViews(composition, { graphics: { render: GraphicsFeature } });
