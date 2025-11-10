/**
 * Shader Program Manager
 *
 * Phase 2.3: Shader program manager
 *
 * Manages shader program lifecycle with:
 * - Program caching (avoid recompilation)
 * - Reference counting (automatic cleanup)
 * - Uniform binding utilities
 * - Program reuse across elements
 */

import { ShaderCompiler, type CompiledProgram } from './shader-compiler.js';
import { OverlayError } from '../utils/overlay-error.js';
import { DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './default-shaders.js';

/**
 * Program cache entry
 */
interface ProgramCacheEntry {
	/**
	 * Compiled program
	 */
	program: CompiledProgram;

	/**
	 * Reference count (number of elements using this program)
	 */
	refCount: number;

	/**
	 * Cache key (vertex + fragment shader hash)
	 */
	key: string;
}

/**
 * Shader Program Manager
 *
 * Manages compiled shader programs with caching and reference counting.
 */
export class ShaderProgramManager {
	private compiler: ShaderCompiler;
	private cache = new Map<string, ProgramCacheEntry>();
	private defaultProgram: CompiledProgram | null = null;

	constructor(private gl: WebGLRenderingContext) {
		this.compiler = new ShaderCompiler(gl);
	}

	/**
	 * Get or compile a shader program
	 *
	 * Programs are cached by shader source, so identical shaders
	 * reuse the same compiled program.
	 *
	 * @param vertexSource - Vertex shader source
	 * @param fragmentSource - Fragment shader source
	 * @param attributeNames - Expected attribute names
	 * @param uniformNames - Expected uniform names
	 * @returns Compiled program or error
	 */
	getProgram(
		vertexSource: string,
		fragmentSource: string,
		attributeNames: string[] = [],
		uniformNames: string[] = []
	): CompiledProgram | OverlayError {
		// Generate cache key
		const key = this.generateCacheKey(vertexSource, fragmentSource);

		// Check cache
		const cached = this.cache.get(key);
		if (cached) {
			// Increment reference count
			cached.refCount++;
			return cached.program;
		}

		// Compile new program
		const result = this.compiler.compileProgram(
			vertexSource,
			fragmentSource,
			attributeNames,
			uniformNames
		);

		if (result instanceof OverlayError) {
			return result;
		}

		// Add to cache
		this.cache.set(key, {
			program: result,
			refCount: 1,
			key
		});

		return result;
	}

	/**
	 * Release a program reference
	 *
	 * Decrements reference count and deletes program when count reaches 0.
	 *
	 * @param program - Program to release
	 */
	releaseProgram(program: CompiledProgram): void {
		// Find cache entry
		for (const [key, entry] of this.cache.entries()) {
			if (entry.program === program) {
				entry.refCount--;

				// Delete if no more references
				if (entry.refCount <= 0) {
					this.compiler.deleteProgram(program.program);
					this.cache.delete(key);
				}

				return;
			}
		}
	}

	/**
	 * Get default program
	 *
	 * Returns cached default program or compiles it on first use.
	 *
	 * @returns Default program or error
	 */
	getDefaultProgram(): CompiledProgram | OverlayError {
		if (this.defaultProgram) {
			return this.defaultProgram;
		}

		const result = this.getProgram(
			DEFAULT_VERTEX_SHADER,
			DEFAULT_FRAGMENT_SHADER,
			['aPosition', 'aTexCoord'],
			['uTexture']
		);

		if (!(result instanceof OverlayError)) {
			this.defaultProgram = result;
		}

		return result;
	}

	/**
	 * Set uniform value
	 *
	 * Convenience method for setting uniform values with type checking.
	 *
	 * @param program - Program to set uniform on
	 * @param name - Uniform name
	 * @param value - Uniform value
	 */
	setUniform(program: CompiledProgram, name: string, value: number | number[]): void {
		const location = program.uniforms.get(name);
		if (!location) {
			console.warn(`[ShaderProgramManager] Uniform '${name}' not found in program`);
			return;
		}

		const gl = this.gl;

		// Determine type and set uniform
		if (typeof value === 'number') {
			gl.uniform1f(location, value);
		} else if (Array.isArray(value)) {
			switch (value.length) {
				case 1:
					gl.uniform1fv(location, value);
					break;
				case 2:
					gl.uniform2fv(location, value);
					break;
				case 3:
					gl.uniform3fv(location, value);
					break;
				case 4:
					gl.uniform4fv(location, value);
					break;
				case 9:
					gl.uniformMatrix3fv(location, false, value);
					break;
				case 16:
					gl.uniformMatrix4fv(location, false, value);
					break;
				default:
					console.warn(
						`[ShaderProgramManager] Unsupported uniform array length: ${value.length}`
					);
			}
		}
	}

	/**
	 * Set multiple uniforms at once
	 *
	 * @param program - Program to set uniforms on
	 * @param uniforms - Uniform name-value pairs
	 */
	setUniforms(program: CompiledProgram, uniforms: Record<string, number | number[]>): void {
		for (const [name, value] of Object.entries(uniforms)) {
			this.setUniform(program, name, value);
		}
	}

	/**
	 * Bind texture to uniform sampler
	 *
	 * @param program - Program to bind texture on
	 * @param uniformName - Sampler uniform name
	 * @param texture - WebGL texture
	 * @param textureUnit - Texture unit (0-31)
	 */
	bindTexture(
		program: CompiledProgram,
		uniformName: string,
		texture: WebGLTexture,
		textureUnit: number = 0
	): void {
		const location = program.uniforms.get(uniformName);
		if (!location) {
			console.warn(`[ShaderProgramManager] Uniform '${uniformName}' not found in program`);
			return;
		}

		const gl = this.gl;

		// Activate texture unit
		gl.activeTexture(gl.TEXTURE0 + textureUnit);

		// Bind texture
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Set sampler to texture unit
		gl.uniform1i(location, textureUnit);
	}

	/**
	 * Use a program
	 *
	 * Makes program active for rendering.
	 *
	 * @param program - Program to use
	 */
	useProgram(program: CompiledProgram): void {
		this.gl.useProgram(program.program);
	}

	/**
	 * Enable vertex attributes
	 *
	 * @param program - Program to enable attributes for
	 * @param attributeNames - Attributes to enable (defaults to all)
	 */
	enableAttributes(program: CompiledProgram, attributeNames?: string[]): void {
		const names = attributeNames || Array.from(program.attributes.keys());

		for (const name of names) {
			const location = program.attributes.get(name);
			if (location !== undefined) {
				this.gl.enableVertexAttribArray(location);
			}
		}
	}

	/**
	 * Disable vertex attributes
	 *
	 * @param program - Program to disable attributes for
	 * @param attributeNames - Attributes to disable (defaults to all)
	 */
	disableAttributes(program: CompiledProgram, attributeNames?: string[]): void {
		const names = attributeNames || Array.from(program.attributes.keys());

		for (const name of names) {
			const location = program.attributes.get(name);
			if (location !== undefined) {
				this.gl.disableVertexAttribArray(location);
			}
		}
	}

	/**
	 * Get program statistics
	 *
	 * @returns Statistics object
	 */
	getStatistics(): {
		cachedPrograms: number;
		totalReferences: number;
		cacheKeys: string[];
	} {
		let totalReferences = 0;
		const cacheKeys: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			totalReferences += entry.refCount;
			cacheKeys.push(key);
		}

		return {
			cachedPrograms: this.cache.size,
			totalReferences,
			cacheKeys
		};
	}

	/**
	 * Clear all cached programs
	 *
	 * WARNING: This will invalidate all programs in use!
	 * Only call during cleanup or testing.
	 */
	clearCache(): void {
		for (const entry of this.cache.values()) {
			this.compiler.deleteProgram(entry.program.program);
		}

		this.cache.clear();
		this.defaultProgram = null;
	}

	/**
	 * Get program info for debugging
	 *
	 * @param program - Program to get info for
	 * @returns Program info
	 */
	getProgramInfo(program: CompiledProgram): {
		attributes: string[];
		uniforms: string[];
		refCount: number;
		cacheKey: string;
	} {
		// Find cache entry
		for (const [key, entry] of this.cache.entries()) {
			if (entry.program === program) {
				return {
					attributes: Array.from(program.attributes.keys()),
					uniforms: Array.from(program.uniforms.keys()),
					refCount: entry.refCount,
					cacheKey: key
				};
			}
		}

		return {
			attributes: Array.from(program.attributes.keys()),
			uniforms: Array.from(program.uniforms.keys()),
			refCount: 0,
			cacheKey: 'not-cached'
		};
	}

	/**
	 * Generate cache key from shader sources
	 *
	 * Uses simple hash for cache lookup.
	 *
	 * @param vertexSource - Vertex shader source
	 * @param fragmentSource - Fragment shader source
	 * @returns Cache key
	 */
	private generateCacheKey(vertexSource: string, fragmentSource: string): string {
		// Simple hash function for cache key
		const hash = (str: string): number => {
			let h = 0;
			for (let i = 0; i < str.length; i++) {
				h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
			}
			return h;
		};

		const vertexHash = hash(vertexSource);
		const fragmentHash = hash(fragmentSource);

		return `${vertexHash}_${fragmentHash}`;
	}

	/**
	 * Destroy manager and clean up all resources
	 */
	destroy(): void {
		this.clearCache();
	}
}
