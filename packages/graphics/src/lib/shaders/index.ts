/**
 * Shader System - Main Exports
 *
 * Phase 2: Shader System
 *
 * Complete shader compilation, management, and rendering pipeline.
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
