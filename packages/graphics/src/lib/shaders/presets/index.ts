/**
 * Shader Preset Registry
 *
 * Phase 3.4: Preset loader integration
 *
 * Central registry for all built-in shader effects.
 * Allows loading presets by name for easy integration.
 */

import type { CustomShaderEffect } from '../../overlay/overlay-types.js';

// Import all presets
import {
	createRippleEffect,
	RIPPLE_GENTLE,
	RIPPLE_STRONG,
	RIPPLE_PULSE,
	type RippleOptions
} from './ripple.js';

import {
	createWaveEffect,
	WAVE_GENTLE_HORIZONTAL,
	WAVE_STRONG_HORIZONTAL,
	WAVE_GENTLE_VERTICAL,
	WAVE_STRONG_VERTICAL,
	WAVE_FLOWING,
	WAVE_HEAT,
	type WaveOptions
} from './wave.js';

import {
	createPixelateEffect,
	PIXELATE_SMALL,
	PIXELATE_MEDIUM,
	PIXELATE_LARGE,
	createBlurEffect,
	BLUR_SLIGHT,
	BLUR_MEDIUM,
	BLUR_STRONG,
	createGlitchEffect,
	GLITCH_SUBTLE,
	GLITCH_MEDIUM,
	GLITCH_INTENSE,
	createZoomEffect,
	ZOOM_BREATHING,
	ZOOM_PULSE,
	ZOOM_INTENSE
} from './effects.js';

/**
 * Preset name type
 */
export type PresetName =
	// Ripple presets
	| 'ripple-gentle'
	| 'ripple-strong'
	| 'ripple-pulse'
	// Wave presets
	| 'wave-gentle-horizontal'
	| 'wave-strong-horizontal'
	| 'wave-gentle-vertical'
	| 'wave-strong-vertical'
	| 'wave-flowing'
	| 'wave-heat'
	// Pixelate presets
	| 'pixelate-small'
	| 'pixelate-medium'
	| 'pixelate-large'
	// Blur presets
	| 'blur-slight'
	| 'blur-medium'
	| 'blur-strong'
	// Glitch presets
	| 'glitch-subtle'
	| 'glitch-medium'
	| 'glitch-intense'
	// Zoom presets
	| 'zoom-breathing'
	| 'zoom-pulse'
	| 'zoom-intense';

/**
 * Preset registry
 *
 * Maps preset names to their shader effects.
 */
const PRESET_REGISTRY: Record<PresetName, CustomShaderEffect> = {
	// Ripple presets
	'ripple-gentle': RIPPLE_GENTLE,
	'ripple-strong': RIPPLE_STRONG,
	'ripple-pulse': RIPPLE_PULSE,

	// Wave presets
	'wave-gentle-horizontal': WAVE_GENTLE_HORIZONTAL,
	'wave-strong-horizontal': WAVE_STRONG_HORIZONTAL,
	'wave-gentle-vertical': WAVE_GENTLE_VERTICAL,
	'wave-strong-vertical': WAVE_STRONG_VERTICAL,
	'wave-flowing': WAVE_FLOWING,
	'wave-heat': WAVE_HEAT,

	// Pixelate presets
	'pixelate-small': PIXELATE_SMALL,
	'pixelate-medium': PIXELATE_MEDIUM,
	'pixelate-large': PIXELATE_LARGE,

	// Blur presets
	'blur-slight': BLUR_SLIGHT,
	'blur-medium': BLUR_MEDIUM,
	'blur-strong': BLUR_STRONG,

	// Glitch presets
	'glitch-subtle': GLITCH_SUBTLE,
	'glitch-medium': GLITCH_MEDIUM,
	'glitch-intense': GLITCH_INTENSE,

	// Zoom presets
	'zoom-breathing': ZOOM_BREATHING,
	'zoom-pulse': ZOOM_PULSE,
	'zoom-intense': ZOOM_INTENSE
};

/**
 * Get shader preset by name
 *
 * @param name - Preset name
 * @returns Shader effect or undefined
 */
export function getPreset(name: PresetName): CustomShaderEffect | undefined {
	return PRESET_REGISTRY[name];
}

/**
 * Check if preset exists
 *
 * @param name - Preset name
 * @returns true if preset exists
 */
export function hasPreset(name: string): name is PresetName {
	return name in PRESET_REGISTRY;
}

/**
 * Get all preset names
 *
 * @returns Array of preset names
 */
export function getAllPresetNames(): PresetName[] {
	return Object.keys(PRESET_REGISTRY) as PresetName[];
}

/**
 * Get presets by category
 *
 * @param category - Preset category
 * @returns Array of preset names in category
 */
export function getPresetsByCategory(
	category: 'ripple' | 'wave' | 'pixelate' | 'blur' | 'glitch' | 'zoom'
): PresetName[] {
	return getAllPresetNames().filter((name) => name.startsWith(category));
}

/**
 * Preset metadata
 */
export interface PresetMetadata {
	name: PresetName;
	category: string;
	description: string;
	animates: boolean;
}

/**
 * Get preset metadata
 *
 * @param name - Preset name
 * @returns Metadata or undefined
 */
export function getPresetMetadata(name: PresetName): PresetMetadata | undefined {
	const metadata: Record<PresetName, Omit<PresetMetadata, 'name'>> = {
		// Ripple presets
		'ripple-gentle': {
			category: 'ripple',
			description: 'Subtle water ripple effect',
			animates: true
		},
		'ripple-strong': {
			category: 'ripple',
			description: 'Dramatic ripple distortion',
			animates: true
		},
		'ripple-pulse': {
			category: 'ripple',
			description: 'Expanding ring pulses',
			animates: true
		},

		// Wave presets
		'wave-gentle-horizontal': {
			category: 'wave',
			description: 'Subtle horizontal wave',
			animates: true
		},
		'wave-strong-horizontal': {
			category: 'wave',
			description: 'Strong horizontal wave',
			animates: true
		},
		'wave-gentle-vertical': {
			category: 'wave',
			description: 'Subtle vertical wave',
			animates: true
		},
		'wave-strong-vertical': {
			category: 'wave',
			description: 'Strong vertical wave',
			animates: true
		},
		'wave-flowing': {
			category: 'wave',
			description: 'Flowing wave in both directions',
			animates: true
		},
		'wave-heat': {
			category: 'wave',
			description: 'Heat distortion effect',
			animates: true
		},

		// Pixelate presets
		'pixelate-small': {
			category: 'pixelate',
			description: 'Small pixel grid',
			animates: false
		},
		'pixelate-medium': {
			category: 'pixelate',
			description: 'Medium pixel grid',
			animates: false
		},
		'pixelate-large': {
			category: 'pixelate',
			description: 'Large pixel grid',
			animates: false
		},

		// Blur presets
		'blur-slight': {
			category: 'blur',
			description: 'Slight blur effect',
			animates: false
		},
		'blur-medium': {
			category: 'blur',
			description: 'Medium blur effect',
			animates: false
		},
		'blur-strong': {
			category: 'blur',
			description: 'Strong blur effect',
			animates: false
		},

		// Glitch presets
		'glitch-subtle': {
			category: 'glitch',
			description: 'Subtle digital glitch',
			animates: true
		},
		'glitch-medium': {
			category: 'glitch',
			description: 'Medium glitch distortion',
			animates: true
		},
		'glitch-intense': {
			category: 'glitch',
			description: 'Intense glitch effect',
			animates: true
		},

		// Zoom presets
		'zoom-breathing': {
			category: 'zoom',
			description: 'Slow breathing zoom',
			animates: true
		},
		'zoom-pulse': {
			category: 'zoom',
			description: 'Pulsing zoom effect',
			animates: true
		},
		'zoom-intense': {
			category: 'zoom',
			description: 'Intense zoom animation',
			animates: true
		}
	};

	const data = metadata[name];
	return data ? { name, ...data } : undefined;
}

// Re-export everything for convenience
export {
	// Ripple
	createRippleEffect,
	RIPPLE_GENTLE,
	RIPPLE_STRONG,
	RIPPLE_PULSE,
	type RippleOptions,
	// Wave
	createWaveEffect,
	WAVE_GENTLE_HORIZONTAL,
	WAVE_STRONG_HORIZONTAL,
	WAVE_GENTLE_VERTICAL,
	WAVE_STRONG_VERTICAL,
	WAVE_FLOWING,
	WAVE_HEAT,
	type WaveOptions,
	// Effects
	createPixelateEffect,
	PIXELATE_SMALL,
	PIXELATE_MEDIUM,
	PIXELATE_LARGE,
	createBlurEffect,
	BLUR_SLIGHT,
	BLUR_MEDIUM,
	BLUR_STRONG,
	createGlitchEffect,
	GLITCH_SUBTLE,
	GLITCH_MEDIUM,
	GLITCH_INTENSE,
	createZoomEffect,
	ZOOM_BREATHING,
	ZOOM_PULSE,
	ZOOM_INTENSE
};
