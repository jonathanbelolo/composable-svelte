/**
 * Shader Gallery Types - Integrated with Composable Architecture
 */

import type { Vector3 } from '@composable-svelte/graphics';

export type ShaderEffect = 'none' | 'wave' | 'pixelate' | 'chromatic';

export interface ImageRegistration {
  id: string;
  src: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  loaded: boolean;
}

export interface ShaderGalleryState {
  // Current shader effect
  shaderEffect: ShaderEffect;

  // Registered images
  images: Map<string, ImageRegistration>;

  // Canvas dimensions
  canvasWidth: number;
  canvasHeight: number;

  // Babylon.js initialization
  isInitialized: boolean;
  error: string | null;
}

export type ShaderGalleryAction =
  | { type: 'initialized' }
  | { type: 'initializationFailed'; error: string }
  | { type: 'setShaderEffect'; effect: ShaderEffect }
  | { type: 'registerImage'; id: string; src: string; element: HTMLImageElement }
  | { type: 'unregisterImage'; id: string }
  | { type: 'updateImageBounds'; id: string; bounds: DOMRect }
  | { type: 'setCanvasSize'; width: number; height: number };

export interface ShaderGalleryDeps {
  // Empty for now
}
