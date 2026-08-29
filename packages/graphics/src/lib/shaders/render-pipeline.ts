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
	/** So an unusable pipeline says so once rather than on every frame. */
	private reportedUninitialized = false;

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

		// A pipeline with no geometry cannot draw anything.
		//
		// `initialized = true` used to be unconditional, so a failed allocation
		// produced a pipeline that reported itself ready and then ran the whole
		// of `render()` — bind the program, set the uniforms, `drawArrays` with
		// no vertex buffer bound — drawing nothing, every frame, in silence. The
		// two `if (buffer)` guards above read as careful handling and were
		// actually the mechanism: they skipped the upload and let the caller
		// carry on regardless.
		//
		// `createBuffer` returns `null` when the context is lost or the driver is
		// out of memory, so this is an ordinary failure, not a theoretical one.
		if (!this.quadBuffer || !this.texCoordBuffer) {
			// Whichever one succeeded is of no use alone, and holding it would
			// leak a GL handle for the life of the pipeline.
			if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
			if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
			this.quadBuffer = null;
			this.texCoordBuffer = null;

			console.error(
				'[RenderPipeline] Could not allocate the quad buffers — the pipeline cannot draw'
			);
			return;
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
			// Once, not per frame. This branch was unreachable until
			// `initializeBuffers` stopped claiming success it had not had, and the
			// render loop calls this for every element on every frame — so making
			// the failure audible made it audible sixty times a second, which
			// buries the one line that says what actually went wrong.
			//
			// The same trade the overlay's `reportRefusal` exists for, missed
			// again in the commit that fixed the silence.
			if (!this.reportedUninitialized) {
				this.reportedUninitialized = true;
				console.error('[RenderPipeline] Pipeline not initialized');
			}
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
		// `opacity` used to be read here, gated on a `uOpacity` uniform that no
		// shipped shader declares — and `renderElement` never passed it anyway.
		// A consumer-facing option that could not affect a pixel.

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

		// Clear once at the beginning. Bound to a local: the second read was
		// `items[0].options.clearColor` without the `?.` the line above used, so
		// an item with no `options` would have thrown here.
		const first = items[0];
		if (first?.options?.clear) {
			this.clear(first.options.clearColor || [0, 0, 0, 0]);
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
