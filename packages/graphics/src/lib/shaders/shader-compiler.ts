/**
 * Shader Compiler
 *
 * Phase 2.2: Shader compiler
 *
 * Compiles and links GLSL shaders into WebGL programs with:
 * - Compilation error handling
 * - Link error handling
 * - Attribute/uniform location caching
 * - Validation and debugging utilities
 */

import { OverlayError, OverlayErrorCode } from '../utils/overlay-error.js';
import {
	validateShaderSource,
	ensurePrecision,
	getShaderTypeName
} from './default-shaders.js';

/**
 * Shader compilation result
 */
export interface ShaderCompilationResult {
	/**
	 * Compiled shader (if successful)
	 */
	shader?: WebGLShader;

	/**
	 * Error (if failed)
	 */
	error?: OverlayError;

	/**
	 * Compilation log (warnings and errors)
	 */
	log?: string;
}

/**
 * Program link result
 */
export interface ProgramLinkResult {
	/**
	 * Linked program (if successful)
	 */
	program?: WebGLProgram;

	/**
	 * Error (if failed)
	 */
	error?: OverlayError;

	/**
	 * Link log (warnings and errors)
	 */
	log?: string;
}

/**
 * Compiled program with cached locations
 */
export interface CompiledProgram {
	/**
	 * WebGL program
	 */
	program: WebGLProgram;

	/**
	 * Attribute locations cache
	 */
	attributes: Map<string, number>;

	/**
	 * Uniform locations cache
	 */
	uniforms: Map<string, WebGLUniformLocation>;

	/**
	 * Vertex shader source
	 */
	vertexSource: string;

	/**
	 * Fragment shader source
	 */
	fragmentSource: string;
}

/**
 * Shader Compiler
 *
 * Handles all shader compilation and program linking.
 */
export class ShaderCompiler {
	constructor(private gl: WebGLRenderingContext) {}

	/**
	 * Compile a shader from source
	 *
	 * @param source - GLSL source code
	 * @param type - Shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
	 * @returns Compilation result
	 */
	compileShader(source: string, type: number): ShaderCompilationResult {
		const gl = this.gl;
		const typeName = getShaderTypeName(gl, type);

		// Validate shader source
		const validation = validateShaderSource(source, typeName as 'vertex' | 'fragment');
		if (!validation.valid) {
			return {
				error: OverlayError.shaderCompilationFailed(
					typeName,
					validation.errors.join(', ')
				),
				log: validation.errors.join('\n')
			};
		}

		// Ensure precision qualifier
		const finalSource = ensurePrecision(source);

		// Create shader
		const shader = gl.createShader(type);
		if (!shader) {
			return {
				error: OverlayError.shaderCompilationFailed(
					typeName,
					'Failed to create shader object'
				)
			};
		}

		// Set source and compile
		gl.shaderSource(shader, finalSource);
		gl.compileShader(shader);

		// Check compilation status
		const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
		const log = gl.getShaderInfoLog(shader) || '';

		if (!success) {
			// Compilation failed
			gl.deleteShader(shader);

			return {
				error: OverlayError.shaderCompilationFailed(typeName, log),
				log
			};
		}

		return { shader, log };
	}

	/**
	 * Link vertex and fragment shaders into a program
	 *
	 * @param vertexShader - Compiled vertex shader
	 * @param fragmentShader - Compiled fragment shader
	 * @returns Program link result
	 */
	linkProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): ProgramLinkResult {
		const gl = this.gl;

		// Create program
		const program = gl.createProgram();
		if (!program) {
			return {
				error: OverlayError.shaderCompilationFailed(
					'program',
					'Failed to create program object'
				)
			};
		}

		// Attach shaders
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);

		// Link program
		gl.linkProgram(program);

		// Check link status
		const success = gl.getProgramParameter(program, gl.LINK_STATUS);
		const log = gl.getProgramInfoLog(program) || '';

		if (!success) {
			// Link failed
			gl.deleteProgram(program);

			return {
				error: OverlayError.shaderCompilationFailed('program', `Link failed: ${log}`),
				log
			};
		}

		return { program, log };
	}

	/**
	 * Compile and link a complete program
	 *
	 * Convenience method that handles full shader compilation pipeline.
	 *
	 * @param vertexSource - Vertex shader source
	 * @param fragmentSource - Fragment shader source
	 * @param attributeNames - Expected attribute names
	 * @param uniformNames - Expected uniform names
	 * @returns Compiled program or error
	 */
	compileProgram(
		vertexSource: string,
		fragmentSource: string,
		attributeNames: string[] = [],
		uniformNames: string[] = []
	): CompiledProgram | OverlayError {
		const gl = this.gl;

		// Compile vertex shader
		const vertexResult = this.compileShader(vertexSource, gl.VERTEX_SHADER);
		if (vertexResult.error) {
			return vertexResult.error;
		}

		// Compile fragment shader
		const fragmentResult = this.compileShader(fragmentSource, gl.FRAGMENT_SHADER);
		if (fragmentResult.error) {
			// Clean up vertex shader
			if (vertexResult.shader) {
				gl.deleteShader(vertexResult.shader);
			}
			return fragmentResult.error;
		}

		// Link program
		const linkResult = this.linkProgram(vertexResult.shader!, fragmentResult.shader!);
		if (linkResult.error) {
			// Clean up shaders
			gl.deleteShader(vertexResult.shader!);
			gl.deleteShader(fragmentResult.shader!);
			return linkResult.error;
		}

		const program = linkResult.program!;

		// Clean up shader objects (no longer needed after linking)
		gl.deleteShader(vertexResult.shader!);
		gl.deleteShader(fragmentResult.shader!);

		// Cache attribute locations
		const attributes = new Map<string, number>();
		for (const name of attributeNames) {
			const location = gl.getAttribLocation(program, name);
			if (location >= 0) {
				attributes.set(name, location);
			}
			// Note: Attributes not found are silently ignored (shader may not use them)
		}

		// Cache uniform locations
		const uniforms = new Map<string, WebGLUniformLocation>();
		for (const name of uniformNames) {
			const location = gl.getUniformLocation(program, name);
			if (location) {
				uniforms.set(name, location);
			}
			// Note: Uniforms not found are silently ignored (shader may not use them)
		}

		return {
			program,
			attributes,
			uniforms,
			vertexSource,
			fragmentSource
		};
	}

	/**
	 * Get all active attributes in a program
	 *
	 * Useful for introspection and debugging.
	 *
	 * @param program - WebGL program
	 * @returns Array of attribute info
	 */
	getActiveAttributes(program: WebGLProgram): Array<{ name: string; location: number; type: number }> {
		const gl = this.gl;
		const count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
		const attributes: Array<{ name: string; location: number; type: number }> = [];

		for (let i = 0; i < count; i++) {
			const info = gl.getActiveAttrib(program, i);
			if (info) {
				const location = gl.getAttribLocation(program, info.name);
				attributes.push({
					name: info.name,
					location,
					type: info.type
				});
			}
		}

		return attributes;
	}

	/**
	 * Get all active uniforms in a program
	 *
	 * Useful for introspection and debugging.
	 *
	 * @param program - WebGL program
	 * @returns Array of uniform info
	 */
	getActiveUniforms(program: WebGLProgram): Array<{ name: string; location: WebGLUniformLocation | null; type: number }> {
		const gl = this.gl;
		const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		const uniforms: Array<{ name: string; location: WebGLUniformLocation | null; type: number }> = [];

		for (let i = 0; i < count; i++) {
			const info = gl.getActiveUniform(program, i);
			if (info) {
				const location = gl.getUniformLocation(program, info.name);
				uniforms.push({
					name: info.name,
					location,
					type: info.type
				});
			}
		}

		return uniforms;
	}

	/**
	 * Validate program
	 *
	 * Runs WebGL validation checks on a program.
	 *
	 * @param program - WebGL program
	 * @returns Validation result
	 */
	validateProgram(program: WebGLProgram): { valid: boolean; log?: string } {
		const gl = this.gl;

		gl.validateProgram(program);

		const valid = gl.getProgramParameter(program, gl.VALIDATE_STATUS);
		const log = gl.getProgramInfoLog(program) || '';

		return { valid, log };
	}

	/**
	 * Delete program and free resources
	 *
	 * @param program - WebGL program to delete
	 */
	deleteProgram(program: WebGLProgram): void {
		this.gl.deleteProgram(program);
	}

	/**
	 * Get program info for debugging
	 *
	 * @param program - WebGL program
	 * @returns Program info object
	 */
	getProgramInfo(program: WebGLProgram): {
		attributes: Array<{ name: string; location: number; type: string }>;
		uniforms: Array<{ name: string; type: string }>;
		linked: boolean;
		validated: boolean;
	} {
		const gl = this.gl;

		const attributes = this.getActiveAttributes(program).map((attr) => ({
			name: attr.name,
			location: attr.location,
			type: this.getTypeName(attr.type)
		}));

		const uniforms = this.getActiveUniforms(program).map((uniform) => ({
			name: uniform.name,
			type: this.getTypeName(uniform.type)
		}));

		const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
		const validated = gl.getProgramParameter(program, gl.VALIDATE_STATUS);

		return { attributes, uniforms, linked, validated };
	}

	/**
	 * Get human-readable type name
	 *
	 * @param type - WebGL type constant
	 * @returns Type name
	 */
	private getTypeName(type: number): string {
		const gl = this.gl;

		const typeMap: Record<number, string> = {
			[gl.FLOAT]: 'float',
			[gl.FLOAT_VEC2]: 'vec2',
			[gl.FLOAT_VEC3]: 'vec3',
			[gl.FLOAT_VEC4]: 'vec4',
			[gl.INT]: 'int',
			[gl.INT_VEC2]: 'ivec2',
			[gl.INT_VEC3]: 'ivec3',
			[gl.INT_VEC4]: 'ivec4',
			[gl.BOOL]: 'bool',
			[gl.BOOL_VEC2]: 'bvec2',
			[gl.BOOL_VEC3]: 'bvec3',
			[gl.BOOL_VEC4]: 'bvec4',
			[gl.FLOAT_MAT2]: 'mat2',
			[gl.FLOAT_MAT3]: 'mat3',
			[gl.FLOAT_MAT4]: 'mat4',
			[gl.SAMPLER_2D]: 'sampler2D',
			[gl.SAMPLER_CUBE]: 'samplerCube'
		};

		return typeMap[type] || `unknown(${type})`;
	}
}
