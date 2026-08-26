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
 *
 * There were `text` and `html` members, backed by html2canvas — which was never
 * a dependency, so that path could not have run. Both are gone; this comment
 * outlived them by two commits.
 */
export type ElementType = 'image' | 'video' | 'canvas';

/**
 * Update strategies for texture updates
 *
 * - static: Never update after initial creation (default for images)
 * - frame: Update every animation frame (default for videos)
 * - manual: Update only when explicitly triggered via updateElement()
 *   (default for canvas elements)
 *
 * There was a `reactive` strategy, assigned only to the `text` and `html`
 * element types, and it went with them.
 */
export type UpdateStrategy = 'static' | 'frame' | 'manual';

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
 * Element bounds in viewport coordinates
 */
export interface ElementBounds {
	x: number; // Left position in pixels
	y: number; // Top position in pixels
	width: number; // Width in pixels
	height: number; // Height in pixels
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
	 * Element bounds in viewport (for positioning)
	 */
	bounds: ElementBounds;

	/**
	 * WebGL texture reference (internal)
	 */
	texture?: WebGLTexture;

	/**
	 * Dimensions of the texture actually created, in pixels
	 *
	 * Not the element's dimensions: an oversize image is scaled down to
	 * `maxTextureSize`, and these report what was uploaded. The memory
	 * accounting deallocates against them on unregister.
	 *
	 * These were written as `textureWidth`/`textureHeight` through an `any`
	 * cast, so an exported interface carried two properties it did not declare
	 * and `getElement()` handed them out untyped.
	 */
	width?: number | undefined;
	height?: number | undefined;

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
	 * Target FPS for render loop
	 * Default: 60 (desktop), 30 (mobile)
	 */
	targetFPS?: number;

	/**
	 * A ceiling on texture dimensions, in pixels. Defaults to the driver's own.
	 *
	 * It **downscales** rather than refuses, and it can only narrow: a value
	 * above the driver maximum is clamped to it. Must be a whole number of at
	 * least 1 — anything else is reported on the console and **ignored**, which
	 * leaves the driver limit in force rather than failing the registration.
	 *
	 * If the driver reports nothing usable, the ceiling falls back to 2048
	 * rather than becoming unlimited. That can be well below the real device
	 * maximum, and is reported too.
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
 * What `createOverlay` needs, as opposed to what a consumer can configure.
 *
 * `canvas` used to sit on `OverlayOptions`, documented as "render into an
 * existing canvas instead of the component's own" — and it could never do that.
 * `WebGLOverlay.svelte` calls `createOverlay({ ...options, canvas })` with its
 * own `bind:this` canvas spread *last*, so a consumer's value was always
 * overwritten; and `createOverlay` — the one path that honours it — is not
 * exported. It was a field on a public type that no reachable call could act
 * on, so it belongs on the internal init shape instead.
 */
export interface OverlayInit extends OverlayOptions {
	/** Canvas element to render to. One is created if absent. */
	canvas?: HTMLCanvasElement | undefined;
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
			updateStrategy?: UpdateStrategy | undefined;
			/**
			 * Called once the element's texture actually exists.
			 *
			 * Only the overlay knows when the async creation settled, so the
			 * callback lives here. `WebGLOverlay.svelte` used to fire its own copy
			 * from a fixed 100ms timer, which reported success on CORS rejection,
			 * on an oversize texture and on an unloaded image. Failures go to
			 * `OverlayOptions.onError`.
			 */
			onTextureLoaded?: (() => void) | undefined;
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
	 * Re-read an element's bounds
	 *
	 * Position is tracked automatically; this is for the case tracking cannot
	 * see — a CSS transform that moves the element without a scroll or resize.
	 *
	 * Declared here because it exists on the implementation and always has.
	 * `WebGLOverlay.svelte` reached it through a `@ts-expect-error` whose
	 * comment said "exists in implementation but not in interface", which is a
	 * description of the drift rather than a reason for it.
	 *
	 * @param id - Element identifier
	 */
	updateElementPosition(id: string): void;

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
	/** The DOM element to read pixels from. */
	element: HTMLElement;

	/** Which of the three supported element kinds it is. */
	type: ElementType;
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

