/**
 * Shader System - Main Exports
 *
 * Phase 2-3: Shader System & Presets
 *
 * Complete shader compilation, management, rendering pipeline, and built-in effects.
 */

// Default shaders
export {
	DEFAULT_VERTEX_SHADER,
	DEFAULT_FRAGMENT_SHADER,
	DEFAULT_SHADER_CONFIG,
	getShaderInfo,
	validateShaderSource,
	ensurePrecision,
	stripComments,
	minifyShader,
	getShaderTypeName
} from './default-shaders.js';

// Shader compiler
export { ShaderCompiler } from './shader-compiler.js';
export type {
	ShaderCompilationResult,
	ProgramLinkResult,
	CompiledProgram
} from './shader-compiler.js';

// Program manager
export { ShaderProgramManager } from './shader-program-manager.js';

// Render pipeline
export { RenderPipeline } from './render-pipeline.js';
export type { RenderOptions } from './render-pipeline.js';

// Shader presets (Phase 3)
export {
	// Registry functions
	getPreset,
	hasPreset,
	getAllPresetNames,
	getPresetsByCategory,
	getPresetMetadata,
	type PresetName,
	type PresetMetadata,
	// Individual presets
	RIPPLE_GENTLE,
	RIPPLE_STRONG,
	RIPPLE_PULSE,
	WAVE_GENTLE_HORIZONTAL,
	WAVE_STRONG_HORIZONTAL,
	WAVE_GENTLE_VERTICAL,
	WAVE_STRONG_VERTICAL,
	WAVE_FLOWING,
	WAVE_HEAT,
	PIXELATE_SMALL,
	PIXELATE_MEDIUM,
	PIXELATE_LARGE,
	BLUR_SLIGHT,
	BLUR_MEDIUM,
	BLUR_STRONG,
	GLITCH_SUBTLE,
	GLITCH_MEDIUM,
	GLITCH_INTENSE,
	ZOOM_BREATHING,
	ZOOM_PULSE,
	ZOOM_INTENSE,
	// Factory functions
	createRippleEffect,
	createWaveEffect,
	createPixelateEffect,
	createBlurEffect,
	createGlitchEffect,
	createZoomEffect,
	// Types
	type RippleOptions,
	type WaveOptions
} from './presets/index.js';
