/**
 * Additional Shader Effects
 *
 * Phase 3.3: Additional effect presets
 *
 * Collection of various visual effects:
 * - Pixelate: Retro pixel art effect
 * - Blur: Gaussian-style blur
 * - Glitch: Digital glitch distortion
 * - Zoom: Zoom in/out effect
 */

import type { CustomShaderEffect } from '../../overlay/overlay-types.js';

// ============================================================================
// PIXELATE EFFECT
// ============================================================================

/**
 * Pixelate effect fragment shader
 */
const PIXELATE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uPixelSize;

varying vec2 vTexCoord;

void main() {
  // Calculate pixel grid
  vec2 pixelCoord = floor(vTexCoord / uPixelSize) * uPixelSize;

  // Sample texture at pixel center
  vec2 sampleCoord = pixelCoord + uPixelSize * 0.5;
  vec4 color = texture2D(uTexture, sampleCoord);

  gl_FragColor = color;
}
`;

/**
 * Create pixelate effect
 *
 * @param pixelSize - Size of pixels (0.001-0.1)
 * @returns Custom shader effect
 */
export function createPixelateEffect(pixelSize: number = 0.01): CustomShaderEffect {
	return {
		fragment: PIXELATE_FRAGMENT_SHADER,
		uniforms: {
			uPixelSize: pixelSize
		}
	};
}

export const PIXELATE_SMALL = createPixelateEffect(0.005);
export const PIXELATE_MEDIUM = createPixelateEffect(0.01);
export const PIXELATE_LARGE = createPixelateEffect(0.02);

// ============================================================================
// BLUR EFFECT
// ============================================================================

/**
 * Blur effect fragment shader (9-tap box blur)
 */
const BLUR_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uBlurAmount;

varying vec2 vTexCoord;

void main() {
  vec4 color = vec4(0.0);

  // 9-tap box blur
  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * uBlurAmount;
      color += texture2D(uTexture, vTexCoord + offset);
    }
  }

  // Average
  color /= 9.0;

  gl_FragColor = color;
}
`;

/**
 * Create blur effect
 *
 * @param blurAmount - Blur strength (0.001-0.01)
 * @returns Custom shader effect
 */
export function createBlurEffect(blurAmount: number = 0.003): CustomShaderEffect {
	return {
		fragment: BLUR_FRAGMENT_SHADER,
		uniforms: {
			uBlurAmount: blurAmount
		}
	};
}

export const BLUR_SLIGHT = createBlurEffect(0.001);
export const BLUR_MEDIUM = createBlurEffect(0.003);
export const BLUR_STRONG = createBlurEffect(0.006);

// ============================================================================
// GLITCH EFFECT
// ============================================================================

/**
 * Glitch effect fragment shader
 */
const GLITCH_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;

varying vec2 vTexCoord;

// Pseudo-random function
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 coord = vTexCoord;

  // Random block distortion
  float blockY = floor(vTexCoord.y * 20.0);
  float glitchRandom = random(vec2(blockY, floor(uTime * uSpeed)));

  if (glitchRandom > 0.9) {
    // Horizontal displacement
    float displacement = (random(vec2(blockY, uTime)) - 0.5) * uIntensity;
    coord.x += displacement;
  }

  // RGB channel split
  float splitOffset = uIntensity * 0.01;
  float r = texture2D(uTexture, coord + vec2(splitOffset, 0.0)).r;
  float g = texture2D(uTexture, coord).g;
  float b = texture2D(uTexture, coord - vec2(splitOffset, 0.0)).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

/**
 * Create glitch effect
 *
 * @param intensity - Glitch strength (0.0-1.0)
 * @param speed - Animation speed
 * @returns Custom shader effect
 */
export function createGlitchEffect(intensity: number = 0.3, speed: number = 2.0): CustomShaderEffect {
	return {
		fragment: GLITCH_FRAGMENT_SHADER,
		uniforms: {
			uIntensity: intensity,
			uSpeed: speed
		}
	};
}

export const GLITCH_SUBTLE = createGlitchEffect(0.1, 1.0);
export const GLITCH_MEDIUM = createGlitchEffect(0.3, 2.0);
export const GLITCH_INTENSE = createGlitchEffect(0.6, 4.0);

// ============================================================================
// ZOOM EFFECT
// ============================================================================

/**
 * Zoom effect fragment shader
 */
const ZOOM_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uZoomAmount;
uniform float uSpeed;
uniform vec2 uCenter;

varying vec2 vTexCoord;

void main() {
  // Calculate animated zoom factor
  float zoom = 1.0 + sin(uTime * uSpeed) * uZoomAmount;

  // Calculate zoomed coordinates from center
  vec2 toCenter = vTexCoord - uCenter;
  vec2 zoomedCoord = uCenter + toCenter / zoom;

  // Sample texture
  vec4 color = texture2D(uTexture, zoomedCoord);

  gl_FragColor = color;
}
`;

/**
 * Create zoom effect
 *
 * @param zoomAmount - Zoom intensity (0.0-1.0)
 * @param speed - Animation speed
 * @param center - Zoom center point [x, y]
 * @returns Custom shader effect
 */
export function createZoomEffect(
	zoomAmount: number = 0.2,
	speed: number = 1.0,
	center: [number, number] = [0.5, 0.5]
): CustomShaderEffect {
	return {
		fragment: ZOOM_FRAGMENT_SHADER,
		uniforms: {
			uZoomAmount: zoomAmount,
			uSpeed: speed,
			uCenter: center
		}
	};
}

export const ZOOM_BREATHING = createZoomEffect(0.1, 0.5);
export const ZOOM_PULSE = createZoomEffect(0.2, 2.0);
export const ZOOM_INTENSE = createZoomEffect(0.4, 3.0);
