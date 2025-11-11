/**
 * Render Pipeline
 *
 * Phase 2.4: Rendering pipeline
 *
 * Handles WebGL rendering with:
 * - Quad geometry (2 triangles for full-screen quad)
 * - Vertex buffer management
 * - Texture binding and rendering
 * - Viewport management
 * - Blend mode configuration
 */

import type { CompiledProgram } from './shader-compiler.js';
import type { ShaderProgramManager } from './shader-program-manager.js';
import type { ElementBounds } from '../overlay/overlay-types.js';
import { domToNDC, createQuadVertices } from '../utils/coordinate-converter.js';

/**
 * Render options
 */
export interface RenderOptions {
	/**
	 * Element bounds in DOM pixel coordinates
	 * If not provided, renders fullscreen quad
	 */
	bounds?: ElementBounds;

	/**
	 * Canvas width in pixels (required if bounds is provided)
	 */
	canvasWidth?: number;

	/**
	 * Canvas height in pixels (required if bounds is provided)
	 */
	canvasHeight?: number;

	/**
	 * Opacity (alpha blending)
	 * Default: 1.0 (fully opaque)
	 */
	opacity?: number;

	/**
	 * Custom uniforms to pass to shader
	 */
	uniforms?: Record<string, number | number[]>;

	/**
	 * Whether to clear canvas before rendering
	 * Default: false
	 */
	clear?: boolean;

	/**
	 * Clear color (RGBA)
	 * Default: [0, 0, 0, 0] (transparent)
	 */
	clearColor?: [number, number, number, number];
}

/**
 * Render Pipeline
 *
 * Manages WebGL rendering state and draw calls.
 */
export class RenderPipeline {
	private quadBuffer: WebGLBuffer | null = null;
	private texCoordBuffer: WebGLBuffer | null = null;
	private initialized = false;

	constructor(
		private gl: WebGLRenderingContext,
		private programManager: ShaderProgramManager
	) {
		this.initializeBuffers();
	}

	/**
	 * Initialize quad geometry buffers
	 *
	 * Creates buffers for quad rendering (2 triangles).
	 * Position buffer uses DYNAMIC_DRAW for per-element positioning.
	 */
	private initializeBuffers(): void {
		const gl = this.gl;

		// Default fullscreen quad vertices in NDC space
		// Format: [x, y] in NDC coordinates [-1, 1]
		const vertices = new Float32Array([
			// Triangle 1
			-1.0,
			1.0, // top-left
			1.0,
			1.0, // top-right
			-1.0,
			-1.0, // bottom-left

			// Triangle 2
			1.0,
			1.0, // top-right
			1.0,
			-1.0, // bottom-right
			-1.0,
			-1.0 // bottom-left
		]);

		// Texture coordinates (matches vertex order)
		// Format: [u, v] in texture space [0, 1]
		const texCoords = new Float32Array([
			// Triangle 1
			0.0,
			0.0, // top-left
			1.0,
			0.0, // top-right
			0.0,
			1.0, // bottom-left

			// Triangle 2
			1.0,
			0.0, // top-right
			1.0,
			1.0, // bottom-right
			0.0,
			1.0 // bottom-left
		]);

		// Create position buffer with DYNAMIC_DRAW (updated per element)
		this.quadBuffer = gl.createBuffer();
		if (this.quadBuffer) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
		}

		// Create texture coordinate buffer with STATIC_DRAW (never changes)
		this.texCoordBuffer = gl.createBuffer();
		if (this.texCoordBuffer) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
		}

		// Enable blending for transparency
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.initialized = true;
	}

	/**
	 * Render a texture with a shader program
	 *
	 * Main rendering method - draws a textured quad with the given shader.
	 *
	 * @param program - Compiled shader program
	 * @param texture - WebGL texture to render
	 * @param options - Render options
	 */
	render(program: CompiledProgram, texture: WebGLTexture, options: RenderOptions = {}): void {
		if (!this.initialized) {
			console.error('[RenderPipeline] Pipeline not initialized');
			return;
		}

		const gl = this.gl;

		// Clear canvas if requested
		if (options.clear) {
			const color = options.clearColor || [0, 0, 0, 0];
			gl.clearColor(color[0], color[1], color[2], color[3]);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}

		// Update quad position if bounds provided
		if (options.bounds && options.canvasWidth && options.canvasHeight) {
			this.updateQuadPosition(options.bounds, options.canvasWidth, options.canvasHeight);
		}

		// Use shader program
		this.programManager.useProgram(program);

		// Set up vertex attributes
		this.setupAttributes(program);

		// Bind texture
		this.programManager.bindTexture(program, 'uTexture', texture, 0);

		// Set uniforms
		this.setUniforms(program, options);

		// Draw quad
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		// Clean up
		this.cleanupAttributes(program);
	}

	/**
	 * Update quad position based on element bounds
	 *
	 * Converts DOM pixel coordinates to NDC and updates vertex buffer.
	 *
	 * @param bounds - Element bounds in DOM pixels
	 * @param canvasWidth - Canvas width in pixels
	 * @param canvasHeight - Canvas height in pixels
	 */
	private updateQuadPosition(bounds: ElementBounds, canvasWidth: number, canvasHeight: number): void {
		const gl = this.gl;

		// Convert DOM bounds to NDC
		const ndc = domToNDC(bounds, canvasWidth, canvasHeight);

		// Create positioned quad vertices
		const vertices = createQuadVertices(ndc);

		// Update quad buffer
		if (this.quadBuffer) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
		}
	}

	/**
	 * Set up vertex attributes
	 *
	 * @param program - Shader program
	 */
	private setupAttributes(program: CompiledProgram): void {
		const gl = this.gl;

		// Position attribute
		const positionLocation = program.attributes.get('aPosition');
		if (positionLocation !== undefined && this.quadBuffer) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
			gl.enableVertexAttribArray(positionLocation);
			gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		}

		// Texture coordinate attribute
		const texCoordLocation = program.attributes.get('aTexCoord');
		if (texCoordLocation !== undefined && this.texCoordBuffer) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
			gl.enableVertexAttribArray(texCoordLocation);
			gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
		}
	}

	/**
	 * Set shader uniforms
	 *
	 * @param program - Shader program
	 * @param options - Render options
	 */
	private setUniforms(program: CompiledProgram, options: RenderOptions): void {
		// Set opacity if program supports it
		if (options.opacity !== undefined && program.uniforms.has('uOpacity')) {
			this.programManager.setUniform(program, 'uOpacity', options.opacity);
		}

		// Set custom uniforms
		if (options.uniforms) {
			this.programManager.setUniforms(program, options.uniforms);
		}
	}

	/**
	 * Clean up vertex attributes
	 *
	 * @param program - Shader program
	 */
	private cleanupAttributes(program: CompiledProgram): void {
		this.programManager.disableAttributes(program);
	}

	/**
	 * Set viewport
	 *
	 * Updates the WebGL viewport to match canvas size.
	 *
	 * @param width - Viewport width
	 * @param height - Viewport height
	 */
	setViewport(width: number, height: number): void {
		this.gl.viewport(0, 0, width, height);
	}

	/**
	 * Clear canvas
	 *
	 * @param color - Clear color (RGBA) [0-1]
	 */
	clear(color: [number, number, number, number] = [0, 0, 0, 0]): void {
		const gl = this.gl;
		gl.clearColor(color[0], color[1], color[2], color[3]);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	/**
	 * Set blend mode
	 *
	 * @param srcFactor - Source blend factor
	 * @param dstFactor - Destination blend factor
	 */
	setBlendMode(srcFactor: number, dstFactor: number): void {
		this.gl.blendFunc(srcFactor, dstFactor);
	}

	/**
	 * Enable/disable blending
	 *
	 * @param enabled - Whether to enable blending
	 */
	setBlending(enabled: boolean): void {
		if (enabled) {
			this.gl.enable(this.gl.BLEND);
		} else {
			this.gl.disable(this.gl.BLEND);
		}
	}

	/**
	 * Render multiple textures in batch
	 *
	 * More efficient than individual render() calls.
	 *
	 * @param items - Array of render items
	 */
	renderBatch(
		items: Array<{
			program: CompiledProgram;
			texture: WebGLTexture;
			options?: RenderOptions;
		}>
	): void {
		if (!this.initialized) {
			console.error('[RenderPipeline] Pipeline not initialized');
			return;
		}

		// Clear once at the beginning
		if (items.length > 0 && items[0].options?.clear) {
			const color = items[0].options.clearColor || [0, 0, 0, 0];
			this.clear(color);
		}

		// Render each item
		for (const item of items) {
			// Skip clear for batch items
			const options = { ...item.options, clear: false };
			this.render(item.program, item.texture, options);
		}
	}

	/**
	 * Get render statistics
	 *
	 * @returns Statistics object
	 */
	getStatistics(): {
		initialized: boolean;
		hasQuadBuffer: boolean;
		hasTexCoordBuffer: boolean;
	} {
		return {
			initialized: this.initialized,
			hasQuadBuffer: this.quadBuffer !== null,
			hasTexCoordBuffer: this.texCoordBuffer !== null
		};
	}

	/**
	 * Destroy pipeline and clean up resources
	 */
	destroy(): void {
		const gl = this.gl;

		if (this.quadBuffer) {
			gl.deleteBuffer(this.quadBuffer);
			this.quadBuffer = null;
		}

		if (this.texCoordBuffer) {
			gl.deleteBuffer(this.texCoordBuffer);
			this.texCoordBuffer = null;
		}

		this.initialized = false;
	}
}
