/**
 * Ripple Effect Shader
 *
 * Phase 3.1: Ripple effect preset
 *
 * Creates animated ripple distortions emanating from a center point.
 * Useful for water effects, click animations, and dynamic distortions.
 */

import type { CustomShaderEffect } from '../../overlay/overlay-types.js';

/**
 * Ripple effect options
 */
export interface RippleOptions {
	/**
	 * Center point of ripple (normalized [0,1])
	 * Default: [0.5, 0.5] (center)
	 */
	center?: [number, number];

	/**
	 * Wave amplitude (distortion strength)
	 * Default: 0.03
	 */
	amplitude?: number;

	/**
	 * Wave frequency (ripple density)
	 * Default: 20.0
	 */
	frequency?: number;

	/**
	 * Animation speed
	 * Default: 2.0
	 */
	speed?: number;

	/**
	 * Wave decay (fade with distance)
	 * Default: 0.5
	 */
	decay?: number;
}

/**
 * Ripple effect fragment shader
 */
const RIPPLE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform vec2 uCenter;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uTime;
uniform float uSpeed;
uniform float uDecay;

varying vec2 vTexCoord;

void main() {
  // Calculate distance from center
  vec2 toCenter = vTexCoord - uCenter;
  float distance = length(toCenter);

  // Calculate ripple wave
  float ripple = sin(distance * uFrequency - uTime * uSpeed);

  // Apply decay with distance
  float decay = exp(-distance * uDecay);

  // Calculate distortion
  vec2 distortion = normalize(toCenter) * ripple * uAmplitude * decay;

  // Sample texture with distorted coordinates
  vec2 distortedCoord = vTexCoord + distortion;
  vec4 color = texture2D(uTexture, distortedCoord);

  gl_FragColor = color;
}
`;

/**
 * Create ripple effect shader
 *
 * @param options - Ripple effect options
 * @returns Custom shader effect
 */
export function createRippleEffect(options: RippleOptions = {}): CustomShaderEffect {
	const center = options.center ?? [0.5, 0.5];
	const amplitude = options.amplitude ?? 0.03;
	const frequency = options.frequency ?? 20.0;
	const speed = options.speed ?? 2.0;
	const decay = options.decay ?? 0.5;

	return {
		fragment: RIPPLE_FRAGMENT_SHADER,
		uniforms: {
			uCenter: center,
			uAmplitude: amplitude,
			uFrequency: frequency,
			uSpeed: speed,
			uDecay: decay
		}
	};
}

/**
 * Preset: Gentle ripple (subtle water effect)
 */
export const RIPPLE_GENTLE: CustomShaderEffect = createRippleEffect({
	amplitude: 0.01,
	frequency: 15.0,
	speed: 1.0,
	decay: 0.3
});

/**
 * Preset: Strong ripple (dramatic distortion)
 */
export const RIPPLE_STRONG: CustomShaderEffect = createRippleEffect({
	amplitude: 0.05,
	frequency: 25.0,
	speed: 3.0,
	decay: 0.7
});

/**
 * Preset: Pulse ripple (expanding rings)
 */
export const RIPPLE_PULSE: CustomShaderEffect = createRippleEffect({
	amplitude: 0.02,
	frequency: 30.0,
	speed: 5.0,
	decay: 1.0
});
