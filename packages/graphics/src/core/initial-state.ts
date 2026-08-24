/**
 * @file initial-state.ts
 * @description Helper to create initial graphics state
 */

import type { GraphicsState } from './types.js';

export interface InitialGraphicsConfig {
  // `renderer?: Partial<RendererConfig>` used to sit here. It was accepted and
  // never read — the body below returns a hardcoded renderer literal — so all
  // four of its fields were unreachable. There is no way to force WebGL either:
  // `Scene.svelte` derives the preference from `activeRenderer !== 'webgl'`, and
  // `activeRenderer` is null until after init, so it is always true.
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
        // Named, so a consumer can remove or update the default light rather
        // than only being able to add alongside it.
        id: 'ambient-default',
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
    isLoading: true
  };
}
