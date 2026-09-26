/**
 * Shader Gallery Types - Integrated with Composable Architecture
 */

export type ShaderEffect = 'none' | 'wave' | 'pixelate' | 'chromatic';

export interface ImageRegistration {
  id: string;
  src: string;
}

export interface ShaderGalleryState {
  // Current shader effect
  shaderEffect: ShaderEffect;

  // Registered images
  images: Map<string, ImageRegistration>;
}

export type ShaderGalleryAction =
  | { type: 'setShaderEffect'; effect: ShaderEffect }
  | { type: 'registerImage'; id: string; src: string }
  | { type: 'unregisterImage'; id: string };

export interface ShaderGalleryDeps {
  // Empty for now
}
