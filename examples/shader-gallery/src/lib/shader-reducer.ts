/**
 * Shader Gallery Reducer - Pure state management
 */

import { Effect, type EffectType } from '@composable-svelte/core';
import type {
  ShaderGalleryState,
  ShaderGalleryAction,
  ShaderGalleryDeps
} from './shader-types';

export function createInitialShaderGalleryState(): ShaderGalleryState {
  return {
    shaderEffect: 'wave',
    images: new Map()
  };
}

export function shaderGalleryReducer(
  state: ShaderGalleryState,
  action: ShaderGalleryAction,
  _deps: ShaderGalleryDeps
): [ShaderGalleryState, EffectType<ShaderGalleryAction>] {
  switch (action.type) {
    case 'setShaderEffect': {
      return [
        {
          ...state,
          shaderEffect: action.effect
        },
        Effect.none()
      ];
    }

    case 'registerImage': {
      const newImages = new Map(state.images);
      newImages.set(action.id, {
        id: action.id,
        src: action.src
      });

      return [
        {
          ...state,
          images: newImages
        },
        Effect.none()
      ];
    }

    case 'unregisterImage': {
      const newImages = new Map(state.images);
      newImages.delete(action.id);

      return [
        {
          ...state,
          images: newImages
        },
        Effect.none()
      ];
    }

    default: {
      const _exhaustive: never = action;
      return [state, Effect.none()];
    }
  }
}
