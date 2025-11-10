/**
 * Shader Gallery Reducer - Pure state management
 */

import { Effect } from '@composable-svelte/core';
import type {
  ShaderGalleryState,
  ShaderGalleryAction,
  ShaderGalleryDeps
} from './shader-types';

export function createInitialShaderGalleryState(): ShaderGalleryState {
  return {
    shaderEffect: 'wave',
    images: new Map(),
    canvasWidth: 0,
    canvasHeight: 0,
    isInitialized: false,
    error: null
  };
}

export function shaderGalleryReducer(
  state: ShaderGalleryState,
  action: ShaderGalleryAction,
  _deps: ShaderGalleryDeps
): [ShaderGalleryState, Effect<ShaderGalleryAction>] {
  switch (action.type) {
    case 'initialized': {
      return [
        {
          ...state,
          isInitialized: true,
          error: null
        },
        Effect.none()
      ];
    }

    case 'initializationFailed': {
      return [
        {
          ...state,
          isInitialized: false,
          error: action.error
        },
        Effect.none()
      ];
    }

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
      const bounds = action.element.getBoundingClientRect();
      const newImages = new Map(state.images);
      newImages.set(action.id, {
        id: action.id,
        src: action.src,
        bounds: {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height
        },
        loaded: action.element.complete
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

    case 'updateImageBounds': {
      const image = state.images.get(action.id);
      if (!image) {
        return [state, Effect.none()];
      }

      const newImages = new Map(state.images);
      newImages.set(action.id, {
        ...image,
        bounds: {
          x: action.bounds.left,
          y: action.bounds.top,
          width: action.bounds.width,
          height: action.bounds.height
        }
      });

      return [
        {
          ...state,
          images: newImages
        },
        Effect.none()
      ];
    }

    case 'setCanvasSize': {
      return [
        {
          ...state,
          canvasWidth: action.width,
          canvasHeight: action.height
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
