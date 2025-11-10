/**
 * Wave Effect Shader
 *
 * Phase 3.2: Wave effect preset
 *
 * Creates sine wave distortions for wavy animations.
 * Useful for flowing effects, heat distortion, and organic motion.
 */

import type { CustomShaderEffect } from '../../overlay/overlay-types.js';

/**
 * Wave effect options
 */
export interface WaveOptions {
	/**
	 * Wave direction ('horizontal' | 'vertical' | 'both')
	 * Default: 'horizontal'
	 */
	direction?: 'horizontal' | 'vertical' | 'both';

	/**
	 * Wave amplitude (distortion strength)
	 * Default: 0.02
	 */
	amplitude?: number;

	/**
	 * Wave frequency (wave density)
	 * Default: 10.0
	 */
	frequency?: number;

	/**
	 * Animation speed
	 * Default: 1.0
	 */
	speed?: number;

	/**
	 * Phase offset (starting position of wave)
	 * Default: 0.0
	 */
	phase?: number;
}

/**
 * Wave effect fragment shader
 */
const WAVE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uTime;
uniform float uSpeed;
uniform float uPhase;
uniform float uDirection; // 0=horizontal, 1=vertical, 2=both

varying vec2 vTexCoord;

void main() {
  vec2 distortion = vec2(0.0);

  // Horizontal wave
  if (uDirection == 0.0 || uDirection == 2.0) {
    float wave = sin(vTexCoord.y * uFrequency + uTime * uSpeed + uPhase);
    distortion.x = wave * uAmplitude;
  }

  // Vertical wave
  if (uDirection == 1.0 || uDirection == 2.0) {
    float wave = sin(vTexCoord.x * uFrequency + uTime * uSpeed + uPhase);
    distortion.y = wave * uAmplitude;
  }

  // Sample texture with distorted coordinates
  vec2 distortedCoord = vTexCoord + distortion;
  vec4 color = texture2D(uTexture, distortedCoord);

  gl_FragColor = color;
}
`;

/**
 * Create wave effect shader
 *
 * @param options - Wave effect options
 * @returns Custom shader effect
 */
export function createWaveEffect(options: WaveOptions = {}): CustomShaderEffect {
	const direction = options.direction ?? 'horizontal';
	const amplitude = options.amplitude ?? 0.02;
	const frequency = options.frequency ?? 10.0;
	const speed = options.speed ?? 1.0;
	const phase = options.phase ?? 0.0;

	// Map direction to uniform value
	const directionValue = direction === 'horizontal' ? 0.0 : direction === 'vertical' ? 1.0 : 2.0;

	return {
		fragment: WAVE_FRAGMENT_SHADER,
		uniforms: {
			uAmplitude: amplitude,
			uFrequency: frequency,
			uSpeed: speed,
			uPhase: phase,
			uDirection: directionValue
		}
	};
}

/**
 * Preset: Gentle horizontal wave
 */
export const WAVE_GENTLE_HORIZONTAL: CustomShaderEffect = createWaveEffect({
	direction: 'horizontal',
	amplitude: 0.01,
	frequency: 8.0,
	speed: 0.5
});

/**
 * Preset: Strong horizontal wave
 */
export const WAVE_STRONG_HORIZONTAL: CustomShaderEffect = createWaveEffect({
	direction: 'horizontal',
	amplitude: 0.04,
	frequency: 12.0,
	speed: 2.0
});

/**
 * Preset: Gentle vertical wave
 */
export const WAVE_GENTLE_VERTICAL: CustomShaderEffect = createWaveEffect({
	direction: 'vertical',
	amplitude: 0.01,
	frequency: 8.0,
	speed: 0.5
});

/**
 * Preset: Strong vertical wave
 */
export const WAVE_STRONG_VERTICAL: CustomShaderEffect = createWaveEffect({
	direction: 'vertical',
	amplitude: 0.04,
	frequency: 12.0,
	speed: 2.0
});

/**
 * Preset: Flowing effect (both directions)
 */
export const WAVE_FLOWING: CustomShaderEffect = createWaveEffect({
	direction: 'both',
	amplitude: 0.015,
	frequency: 10.0,
	speed: 1.5
});

/**
 * Preset: Heat distortion effect
 */
export const WAVE_HEAT: CustomShaderEffect = createWaveEffect({
	direction: 'both',
	amplitude: 0.005,
	frequency: 20.0,
	speed: 3.0
});
