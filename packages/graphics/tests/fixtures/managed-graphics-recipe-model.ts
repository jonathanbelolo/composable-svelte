/**
 * @file managed-graphics-recipe-model.ts
 * Managed Graphics Recipe Model for Batch D3 proof
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
import { graphicsReducer } from '../../src/core/reducer.js';
import { createInitialGraphicsState } from '../../src/core/initial-state.js';
import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';

export interface AppDeps {}

export interface AppState {
  title: string;
  scene: GraphicsState | null;
  sidebarScene: GraphicsState | null;
  lastInitializedRenderer: string | null;
}

export type AppAction =
  | { type: 'scene'; action: PresentationAction<GraphicsAction> }
  | { type: 'sidebarScene'; action: PresentationAction<GraphicsAction> }
  | { type: 'openScene' }
  | { type: 'closeScene' }
  | { type: 'replaceScene' }
  | { type: 'openBothScenes' }
  | { type: 'closeSceneA' };

export const sceneSlot = optionalSlot<AppState, AppAction>()('scene');
export const sidebarSceneSlot = optionalSlot<AppState, AppAction>()('sidebarScene');

export const rootReducer: Reducer<AppState, AppAction, AppDeps> = (state, action) => {
  switch (action.type) {
    case 'scene': {
      if (action.action.type === 'presented' && action.action.action.type === 'rendererInitialized') {
        return [
          {
            ...state,
            lastInitializedRenderer: action.action.action.renderer
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'openScene':
      return [
        {
          ...state,
          scene: createInitialGraphicsState({ sceneId: 'main-scene' })
        },
        Effect.none()
      ];

    case 'closeScene':
      return [{ ...state, scene: null }, Effect.none()];

    case 'replaceScene':
      return [
        {
          ...state,
          scene: createInitialGraphicsState({ sceneId: 'main-scene-replaced' })
        },
        Effect.none()
      ];

    case 'openBothScenes':
      return [
        {
          ...state,
          scene: createInitialGraphicsState({ sceneId: 'scene-a' }),
          sidebarScene: createInitialGraphicsState({ sceneId: 'scene-b' })
        },
        Effect.none()
      ];

    case 'closeSceneA':
      return [{ ...state, scene: null }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

export const composition = new ManagedIntegrationBuilder<AppState, AppAction, AppDeps>(rootReducer)
  .with(sceneSlot, graphicsReducer, { replaceOn: (action) => action.type === 'replaceScene' })
  .with(sidebarSceneSlot, graphicsReducer)
  .build();

export const initialAppState = (): AppState => ({
  title: 'Managed Graphics Proof Application',
  scene: createInitialGraphicsState({ sceneId: 'initial-scene' }),
  sidebarScene: null,
  lastInitializedRenderer: null
});

export const graphicsAppDefinition = defineApplication(composition, {
  initialState: initialAppState
});
