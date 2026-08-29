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
 * Cache key for a source pair.
 *
 * The sources themselves, not a hash of them. This was a 32-bit polynomial
 * hash, and collisions in it are constructible — `'void main(){}//aB'` and
 * ``'void main(){}//`a'`` share one — which would have served an element the
 * wrong program and incremented the wrong refcount. `CompiledProgram` already
 * retains both sources, so keying on them costs no additional retention.
 *
 * The NUL separator keeps `(a, bc)` from colliding with `(ab, c)`; GLSL cannot
 * contain one.
 */
const cacheKey = (vertexSource: string, fragmentSource: string): string =>
	`${vertexSource}\u0000${fragmentSource}`;

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
	 * @returns Compiled program or error
	 */
	getProgram(vertexSource: string, fragmentSource: string): CompiledProgram | OverlayError {
		// Generate cache key
		const key = cacheKey(vertexSource, fragmentSource);

		// Check cache
		const cached = this.cache.get(key);
		if (cached) {
			// Increment reference count
			cached.refCount++;
			return cached.program;
		}

		// Compile new program. The compiler reads the program's own active
		// attributes and uniforms, so there is no name list to pass and no way
		// for a cache hit to hand back a program missing the caller's uniforms.
		const result = this.compiler.compileProgram(vertexSource, fragmentSource);

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
		// Straight through to the refcounted cache.
		//
		// This used to memoise the result in `this.defaultProgram`, which made
		// the first call take a reference and every later call take none — and
		// `releaseProgram` reaching zero deleted the program and dropped the
		// cache entry without clearing the field, so the next call handed back a
		// deleted handle. Every call takes a reference now, and every caller
		// owes a `releaseProgram`, which is the same contract as `getProgram`.
		return this.getProgram(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER);
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
	/**
	 * Warnings already given, so a per-frame mistake is said once.
	 *
	 * `setUniform` and `bindTexture` are both reached from `RenderPipeline.render`,
	 * which the render loop calls for every element on every frame. A shader that
	 * does not declare a uniform the caller sets — or does not declare
	 * `uTexture` — therefore warned sixty times a second: measured at 60 warnings
	 * over 60 frames. The message is worth saying and worth saying once; a flood
	 * buries whatever else the console holds.
	 *
	 * Keyed by the message, so two different missing uniforms are still two
	 * warnings. Not cleared: a program's declarations do not change, and a
	 * recompile builds a fresh `CompiledProgram` anyway.
	 */
	private readonly warned = new Set<string>();

	private warnOnce(message: string): void {
		if (this.warned.has(message)) return;
		this.warned.add(message);
		console.warn(message);
	}

	setUniform(program: CompiledProgram, name: string, value: number | number[]): void {
		const location = program.uniforms.get(name);
		if (!location) {
			this.warnOnce(`[ShaderProgramManager] Uniform '${name}' not found in program`);
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
					this.warnOnce(
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
			this.warnOnce(`[ShaderProgramManager] Uniform '${uniformName}' not found in program`);
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
	 * Destroy manager and clean up all resources
	 */
	destroy(): void {
		this.clearCache();
	}
}
