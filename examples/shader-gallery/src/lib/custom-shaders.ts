/**
 * Custom shader effects for shader gallery
 * Demonstrates how to create custom effects beyond the built-in presets
 */

import type { CustomShaderEffect } from '@composable-svelte/graphics';

/**
 * Chromatic aberration fragment shader
 * Splits RGB channels with animated offset for a glitch-like effect
 */
const CHROMATIC_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;

varying vec2 vTexCoord;

void main() {
  vec2 uv = vTexCoord;
  float offset = uIntensity * (0.003 + sin(uTime) * 0.002);

  // Sample each color channel with different offset
  float r = texture2D(uTexture, uv + vec2(offset, 0.0)).r;
  float g = texture2D(uTexture, uv).g;
  float b = texture2D(uTexture, uv - vec2(offset, 0.0)).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

/**
 * Create chromatic aberration effect
 *
 * @param intensity - RGB channel split intensity (0.0-2.0)
 * @returns Custom shader effect
 */
export function createChromaticAberrationEffect(
  intensity: number = 1.0
): CustomShaderEffect {
  return {
    fragment: CHROMATIC_FRAGMENT_SHADER,
    uniforms: {
      uIntensity: intensity
    }
  };
}

/**
 * Preset: Medium chromatic aberration
 */
export const CHROMATIC_MEDIUM = createChromaticAberrationEffect(1.0);

/**
 * Preset: Intense chromatic aberration
 */
export const CHROMATIC_INTENSE = createChromaticAberrationEffect(2.0);
