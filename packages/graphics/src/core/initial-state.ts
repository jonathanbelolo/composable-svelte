/**
 * @file initial-state.ts
 * @description Helper to create initial graphics state
 */

import type { GraphicsState, RendererConfig } from './types';

export interface InitialGraphicsConfig {
  renderer?: Partial<RendererConfig>;
  backgroundColor?: string;
}

/**
 * Create initial graphics state with sensible defaults
 */
export function createInitialGraphicsState(
  config: InitialGraphicsConfig = {}
): GraphicsState {
  return {
    // Renderer
    renderer: {
      activeRenderer: null,
      isInitialized: false,
      capabilities: {
        supportsWebGPU: false,
        supportsWebGL: false,
        maxTextureSize: 0,
        maxVertexAttributes: 0
      },
      error: null
    },

    // Scene
    scene: {
      id: 'root',
      children: [],
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      visible: true
    },
    backgroundColor: config.backgroundColor || '#1a1a1a',

    // Camera (default perspective camera)
    camera: {
      type: 'perspective',
      position: [0, 5, 10],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.1,
      far: 1000
    },

    // Lights (default ambient light)
    lights: [
      {
        type: 'ambient',
        intensity: 0.5,
        color: '#ffffff'
      }
    ],

    // Meshes
    meshes: [],

    // Animations
    animations: [],

    // Loading state
    isLoading: true,
    loadingProgress: 0
  };
}
