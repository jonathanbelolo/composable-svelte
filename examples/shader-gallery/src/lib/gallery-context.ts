/**
 * Gallery Context - Shared types and context key for ShaderGallery
 */

import type { ShaderEffect } from '@composable-svelte/graphics';

export const GALLERY_CONTEXT_KEY = 'shader-gallery';

export interface ShaderGalleryContext {
  isFallback: () => boolean;
  registerImageElement: (
    id: string,
    element: HTMLImageElement,
    src: string,
    shader: ShaderEffect | undefined,
    onTextureLoaded?: () => void
  ) => boolean;
  unregisterImageElement: (id: string, element: HTMLImageElement) => void;
  updateImageShader: (id: string, shader: ShaderEffect | undefined) => void;
  updateImagePosition: (id: string) => void;
}

// The demo's None choice is an explicit passthrough custom shader, not an
// unrecognized preset name or an undefined value outside the graphics type.
export const passthroughShader: ShaderEffect = {
  fragment: `precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }`
};
