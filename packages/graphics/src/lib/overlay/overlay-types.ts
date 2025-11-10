/**
 * Core Types for WebGLOverlay
 *
 * Phase 1.1: Core types and interfaces
 *
 * These types define the public API surface for the overlay system.
 */

import type { OverlayError } from '../utils/overlay-error.js';

/**
 * Supported element types for WebGL overlay
 *
 * - image: Static or animated images
 * - video: Video elements (with frame extraction)
 * - canvas: Canvas elements (2D or WebGL)
 * - text: Text elements (via html2canvas)
 * - html: Complex HTML elements (via html2canvas)
 */
export type ElementType = 'image' | 'video' | 'canvas' | 'text' | 'html';

/**
 * Update strategies for texture updates
 *
 * - static: Never update after initial creation (default for images)
 * - frame: Update every animation frame (for videos)
 * - manual: Update only when explicitly triggered via updateElement()
 * - reactive: Update when Svelte detects changes (via $effect)
 */
export type UpdateStrategy = 'static' | 'frame' | 'manual' | 'reactive';

/**
 * Shader effect type
 *
 * - Built-in presets: 'ripple', 'wave', 'pixelate', etc.
 * - Custom: User-defined shader with fragment/vertex source
 */
export type ShaderEffect = string | CustomShaderEffect;

/**
 * Custom shader effect definition
 */
export interface CustomShaderEffect {
	/**
	 * Vertex shader source (GLSL)
	 * If not provided, uses default passthrough vertex shader
	 */
	vertex?: string;

	/**
	 * Fragment shader source (GLSL)
	 * Required for custom effects
	 */
	fragment: string;

	/**
	 * Uniform values to pass to shader
	 * Example: { time: 0.0, intensity: 1.0 }
	 */
	uniforms?: Record<string, number | number[]>;
}

/**
 * Element registration configuration
 *
 * Represents a single HTML element tracked by the overlay.
 */
export interface ElementRegistration {
	/**
	 * Unique identifier for this element
	 */
	id: string;

	/**
	 * HTML element reference
	 */
	element: HTMLElement;

	/**
	 * Element type (determines how texture is created)
	 */
	type: ElementType;

	/**
	 * Update strategy (how often to update texture)
	 */
	updateStrategy: UpdateStrategy;

	/**
	 * Shader effect to apply
	 */
	shader: ShaderEffect;

	/**
	 * WebGL texture reference (internal)
	 */
	texture?: WebGLTexture;

	/**
	 * Last update timestamp (for frame limiting)
	 */
	lastUpdate?: number;

	/**
	 * Whether this element's texture needs updating
	 */
	needsUpdate?: boolean;

	/**
	 * Animation frame ID (for video elements)
	 */
	animationFrameId?: number;

	/**
	 * Error state (if texture creation failed)
	 */
	error?: OverlayError;
}

/**
 * Overlay initialization options
 */
export interface OverlayOptions {
	/**
	 * Canvas element to render to
	 * If not provided, creates a new canvas
	 */
	canvas?: HTMLCanvasElement;

	/**
	 * Target FPS for render loop
	 * Default: 60 (desktop), 30 (mobile)
	 */
	targetFPS?: number;

	/**
	 * Maximum texture size (auto-detected if not provided)
	 */
	maxTextureSize?: number;

	/**
	 * Memory budget for textures in bytes
	 * Default: 200MB (200 * 1024 * 1024)
	 */
	memoryBudget?: number;

	/**
	 * Whether to enable debug logging
	 * Default: false
	 */
	debug?: boolean;

	/**
	 * Whether to automatically handle context loss
	 * Default: true
	 */
	handleContextLoss?: boolean;

	/**
	 * Callback when context is lost
	 */
	onContextLost?: () => void;

	/**
	 * Callback when context is restored
	 */
	onContextRestored?: () => void;

	/**
	 * Callback when an error occurs
	 */
	onError?: (error: OverlayError) => void;
}

/**
 * Overlay context API
 *
 * The main API surface returned by createOverlay().
 * This is what components interact with.
 */
export interface OverlayContextAPI {
	/**
	 * Register an element for WebGL rendering
	 *
	 * @param id - Unique identifier
	 * @param element - HTML element to track
	 * @param options - Registration options
	 * @returns Registration object or error
	 */
	registerElement(
		id: string,
		element: HTMLElement,
		options: {
			type: ElementType;
			shader: ShaderEffect;
			updateStrategy?: UpdateStrategy;
		}
	): ElementRegistration | OverlayError;

	/**
	 * Unregister an element
	 *
	 * Cleans up texture and stops updates.
	 *
	 * @param id - Element identifier
	 */
	unregisterElement(id: string): void;

	/**
	 * Update a specific element's texture
	 *
	 * For manual update strategy.
	 *
	 * @param id - Element identifier
	 */
	updateElement(id: string): void;

	/**
	 * Update shader uniforms for an element
	 *
	 * @param id - Element identifier
	 * @param uniforms - New uniform values
	 */
	updateUniforms(id: string, uniforms: Record<string, number | number[]>): void;

	/**
	 * Change shader effect for an element
	 *
	 * @param id - Element identifier
	 * @param shader - New shader effect
	 */
	setShader(id: string, shader: ShaderEffect): void;

	/**
	 * Start the render loop
	 */
	start(): void;

	/**
	 * Stop the render loop
	 */
	stop(): void;

	/**
	 * Check if render loop is running
	 */
	isRunning(): boolean;

	/**
	 * Get current FPS
	 */
	getCurrentFPS(): number;

	/**
	 * Get all registered elements
	 */
	getElements(): ReadonlyArray<ElementRegistration>;

	/**
	 * Get a specific element registration
	 *
	 * @param id - Element identifier
	 */
	getElement(id: string): ElementRegistration | undefined;

	/**
	 * Get WebGL context
	 *
	 * For advanced users who need direct access.
	 */
	getContext(): WebGLRenderingContext | null;

	/**
	 * Get canvas element
	 */
	getCanvas(): HTMLCanvasElement;

	/**
	 * Destroy overlay and clean up all resources
	 */
	destroy(): void;
}

/**
 * Internal texture creation options
 */
export interface TextureCreationOptions {
	/**
	 * Element to create texture from
	 */
	element: HTMLElement;

	/**
	 * Element type
	 */
	type: ElementType;

	/**
	 * WebGL context
	 */
	gl: WebGLRenderingContext;

	/**
	 * Maximum texture size
	 */
	maxTextureSize: number;

	/**
	 * Whether to apply CORS workaround (Safari)
	 */
	needsCORSWorkaround: boolean;
}

/**
 * Texture creation result
 */
export interface TextureCreationResult {
	/**
	 * Created texture (if successful)
	 */
	texture?: WebGLTexture;

	/**
	 * Actual texture width
	 */
	width?: number;

	/**
	 * Actual texture height
	 */
	height?: number;

	/**
	 * Error (if failed)
	 */
	error?: OverlayError;
}

/**
 * Shader program cache entry
 */
export interface ShaderProgramEntry {
	/**
	 * Compiled WebGL program
	 */
	program: WebGLProgram;

	/**
	 * Uniform locations cache
	 */
	uniforms: Map<string, WebGLUniformLocation>;

	/**
	 * Attribute locations cache
	 */
	attributes: Map<string, number>;

	/**
	 * Reference count (for cleanup)
	 */
	refCount: number;
}
