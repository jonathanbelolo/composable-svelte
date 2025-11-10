/**
 * WebGL Overlay
 *
 * Phase 1.4 + 2: WebGLOverlay component with shader system
 *
 * Main orchestrator that brings together:
 * - WebGLContextManager (context loss/recovery)
 * - TextureFactory (texture creation)
 * - UpdateScheduler (update strategies)
 * - RenderLoop (animation frame management)
 * - DeviceCapabilities (platform detection)
 * - BrowserCompatibility (browser quirks)
 * - ShaderProgramManager (shader compilation/caching)
 * - RenderPipeline (WebGL rendering)
 */

import { WebGLContextManager } from '../utils/webgl-context-manager.js';
import { TextureFactory } from './texture-factory.js';
import { UpdateScheduler } from './update-scheduler.js';
import { RenderLoop } from '../utils/render-loop.js';
import { DeviceCapabilities } from '../utils/device-capabilities.js';
import { BrowserCompatibility } from '../utils/browser-compatibility.js';
import { OverlayError, OverlayErrorCode } from '../utils/overlay-error.js';
import { checkWebGLSupport } from '../utils/webgl-support.js';
import { ShaderProgramManager } from '../shaders/shader-program-manager.js';
import { RenderPipeline } from '../shaders/render-pipeline.js';
import { DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from '../shaders/default-shaders.js';
import type {
	OverlayOptions,
	OverlayContextAPI,
	ElementRegistration,
	ElementType,
	ShaderEffect,
	UpdateStrategy
} from './overlay-types.js';
import type { CompiledProgram } from '../shaders/shader-compiler.js';

/**
 * Create WebGL overlay
 *
 * Main entry point for the overlay system.
 *
 * @param options - Overlay initialization options
 * @returns Overlay context API or error
 */
export function createOverlay(options: OverlayOptions = {}): OverlayContextAPI | OverlayError {
	// Check WebGL support
	const webglSupport = checkWebGLSupport();
	if (!webglSupport.supported) {
		return OverlayError.webGLNotSupported(webglSupport.reason);
	}

	try {
		return new WebGLOverlay(options);
	} catch (error) {
		console.error('[WebGLOverlay] Initialization failed:', error);
		return OverlayError.webGLNotSupported(
			error instanceof Error ? error.message : String(error)
		);
	}
}

/**
 * WebGL Overlay implementation
 *
 * Internal implementation of the overlay system.
 */
class WebGLOverlay implements OverlayContextAPI {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext | null = null;
	private contextManager: WebGLContextManager;
	private textureFactory: TextureFactory | null = null;
	private updateScheduler: UpdateScheduler;
	private renderLoop: RenderLoop;
	private deviceCapabilities: DeviceCapabilities | null = null;
	private browserCompatibility: BrowserCompatibility;
	private programManager: ShaderProgramManager | null = null;
	private renderPipeline: RenderPipeline | null = null;
	private elements = new Map<string, ElementRegistration>();
	private elementPrograms = new Map<string, CompiledProgram>();
	private options: Required<OverlayOptions>;
	private destroyed = false;

	constructor(options: OverlayOptions = {}) {
		// Initialize browser compatibility first
		this.browserCompatibility = new BrowserCompatibility();

		// Set up canvas
		this.canvas = options.canvas || this.createCanvas();

		// Initialize context manager
		this.contextManager = new WebGLContextManager();

		// Set up context loss/restore callbacks
		if (options.handleContextLoss !== false) {
			this.contextManager.onContextLost(() => {
				console.warn('[WebGLOverlay] WebGL context lost');
				if (this.options.onContextLost) {
					this.options.onContextLost();
				}
			});

			this.contextManager.onContextRestored(() => {
				console.info('[WebGLOverlay] WebGL context restored');
				this.recreateResources();
				if (this.options.onContextRestored) {
					this.options.onContextRestored();
				}
			});
		}

		// Initialize WebGL context
		this.gl = this.contextManager.initialize(this.canvas);
		if (!this.gl) {
			throw new Error('Failed to initialize WebGL context');
		}

		// Initialize device capabilities
		this.deviceCapabilities = new DeviceCapabilities(this.gl);

		// Merge options with defaults
		this.options = {
			canvas: this.canvas,
			targetFPS: options.targetFPS ?? this.deviceCapabilities.getRecommendedFPS(),
			maxTextureSize: options.maxTextureSize ?? this.deviceCapabilities.getMaxTextureSize(),
			memoryBudget: options.memoryBudget ?? 200 * 1024 * 1024, // 200MB default
			debug: options.debug ?? false,
			handleContextLoss: options.handleContextLoss ?? true,
			onContextLost: options.onContextLost,
			onContextRestored: options.onContextRestored,
			onError: options.onError
		};

		// Initialize texture factory
		this.textureFactory = new TextureFactory(
			this.gl,
			this.options.maxTextureSize,
			this.options.memoryBudget,
			this.browserCompatibility.needsCORSWorkaround()
		);

		// Initialize shader program manager
		this.programManager = new ShaderProgramManager(this.gl);

		// Initialize render pipeline
		this.renderPipeline = new RenderPipeline(this.gl, this.programManager);

		// Initialize update scheduler
		this.updateScheduler = new UpdateScheduler();
		this.updateScheduler.setUpdateCallback((elementId) => {
			this.handleElementUpdate(elementId);
		});

		// Initialize render loop
		this.renderLoop = new RenderLoop(this.options.targetFPS);

		// Log initialization
		if (this.options.debug) {
			console.info('[WebGLOverlay] Initialized', {
				device: this.deviceCapabilities.getDeviceInfo(),
				browser: this.browserCompatibility.getBrowserInfo(),
				targetFPS: this.options.targetFPS,
				maxTextureSize: this.options.maxTextureSize,
				memoryBudget: `${Math.round(this.options.memoryBudget / 1024 / 1024)}MB`
			});
		}
	}

	/**
	 * Register an element for WebGL rendering
	 */
	registerElement(
		id: string,
		element: HTMLElement,
		options: {
			type: ElementType;
			shader: ShaderEffect;
			updateStrategy?: UpdateStrategy;
		}
	): ElementRegistration | OverlayError {
		if (this.destroyed) {
			return OverlayError.invalidElement(id, 'Overlay has been destroyed');
		}

		if (this.elements.has(id)) {
			return OverlayError.invalidElement(id, `Element with ID '${id}' already registered`);
		}

		// Determine update strategy
		const updateStrategy = options.updateStrategy ?? this.inferUpdateStrategy(options.type);

		// Create element registration
		const registration: ElementRegistration = {
			id,
			element,
			type: options.type,
			updateStrategy,
			shader: options.shader,
			needsUpdate: true
		};

		// Create initial texture
		this.createElementTexture(registration);

		// Compile shader program
		this.compileElementShader(registration);

		// Add to elements map
		this.elements.set(id, registration);

		// Register with update scheduler
		this.updateScheduler.registerElement(registration);

		// Log registration
		if (this.options.debug) {
			console.info(`[WebGLOverlay] Registered element '${id}' (${options.type}, ${updateStrategy})`);
		}

		return registration;
	}

	/**
	 * Unregister an element
	 */
	unregisterElement(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[WebGLOverlay] Element '${id}' not found`);
			return;
		}

		// Unregister from update scheduler
		this.updateScheduler.unregisterElement(id);

		// Delete texture
		if (registration.texture && this.textureFactory) {
			const width = (registration as any).textureWidth || 0;
			const height = (registration as any).textureHeight || 0;
			this.textureFactory.deleteTexture(registration.texture, width, height);
		}

		// Remove from elements map
		this.elements.delete(id);

		// Log unregistration
		if (this.options.debug) {
			console.info(`[WebGLOverlay] Unregistered element '${id}'`);
		}
	}

	/**
	 * Update a specific element's texture
	 */
	updateElement(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[WebGLOverlay] Element '${id}' not found`);
			return;
		}

		if (registration.updateStrategy === 'manual') {
			this.updateScheduler.triggerUpdate(id);
		} else {
			console.warn(
				`[WebGLOverlay] Element '${id}' has strategy '${registration.updateStrategy}', use that strategy instead of updateElement()`
			);
		}
	}

	/**
	 * Update shader uniforms for an element
	 */
	updateUniforms(id: string, uniforms: Record<string, number | number[]>): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[WebGLOverlay] Element '${id}' not found`);
			return;
		}

		// Update shader uniforms (implementation depends on shader system in Phase 2)
		if (typeof registration.shader === 'object') {
			registration.shader.uniforms = {
				...registration.shader.uniforms,
				...uniforms
			};
		}

		// Mark as needing re-render
		registration.needsUpdate = true;
	}

	/**
	 * Change shader effect for an element
	 */
	setShader(id: string, shader: ShaderEffect): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[WebGLOverlay] Element '${id}' not found`);
			return;
		}

		registration.shader = shader;
		registration.needsUpdate = true;
	}

	/**
	 * Start the render loop
	 */
	start(): void {
		if (this.destroyed) {
			console.warn('[WebGLOverlay] Cannot start - overlay destroyed');
			return;
		}

		if (this.renderLoop.isRunning()) {
			console.warn('[WebGLOverlay] Render loop already running');
			return;
		}

		this.renderLoop.start((deltaTime) => {
			this.render(deltaTime);
		});

		if (this.options.debug) {
			console.info('[WebGLOverlay] Render loop started');
		}
	}

	/**
	 * Stop the render loop
	 */
	stop(): void {
		this.renderLoop.stop();

		if (this.options.debug) {
			console.info('[WebGLOverlay] Render loop stopped');
		}
	}

	/**
	 * Check if render loop is running
	 */
	isRunning(): boolean {
		return this.renderLoop.isRunning();
	}

	/**
	 * Get current FPS
	 */
	getCurrentFPS(): number {
		return this.renderLoop.getCurrentFPS();
	}

	/**
	 * Get all registered elements
	 */
	getElements(): ReadonlyArray<ElementRegistration> {
		return Array.from(this.elements.values());
	}

	/**
	 * Get a specific element registration
	 */
	getElement(id: string): ElementRegistration | undefined {
		return this.elements.get(id);
	}

	/**
	 * Get WebGL context
	 */
	getContext(): WebGLRenderingContext | null {
		return this.gl;
	}

	/**
	 * Get canvas element
	 */
	getCanvas(): HTMLCanvasElement {
		return this.canvas;
	}

	/**
	 * Destroy overlay and clean up all resources
	 */
	destroy(): void {
		if (this.destroyed) return;

		// Stop render loop
		this.stop();

		// Unregister all elements
		for (const id of Array.from(this.elements.keys())) {
			this.unregisterElement(id);
		}

		// Destroy update scheduler
		this.updateScheduler.destroy();

		// Clean up shader system
		if (this.programManager) {
			this.programManager.destroy();
		}

		if (this.renderPipeline) {
			this.renderPipeline.destroy();
		}

		// Clear program cache
		this.elementPrograms.clear();

		// Clean up WebGL resources
		if (this.gl) {
			// Delete all textures (already done in unregisterElement)
			// Lose context to free GPU memory
			const loseContext = this.gl.getExtension('WEBGL_lose_context');
			if (loseContext) {
				loseContext.loseContext();
			}
		}

		this.destroyed = true;

		if (this.options.debug) {
			console.info('[WebGLOverlay] Destroyed');
		}
	}

	/**
	 * Create canvas element
	 */
	private createCanvas(): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.width = 800;
		canvas.height = 600;
		return canvas;
	}

	/**
	 * Infer update strategy from element type
	 */
	private inferUpdateStrategy(type: ElementType): UpdateStrategy {
		switch (type) {
			case 'image':
				return 'static'; // Images don't change
			case 'video':
				return 'frame'; // Videos need per-frame updates
			case 'canvas':
				return 'manual'; // Canvas updates are manual
			case 'text':
			case 'html':
				return 'reactive'; // HTML elements track changes reactively
			default:
				return 'static';
		}
	}

	/**
	 * Create texture for an element
	 */
	private async createElementTexture(registration: ElementRegistration): Promise<void> {
		if (!this.textureFactory || !this.gl) return;

		const result = await this.textureFactory.createTexture({
			element: registration.element,
			type: registration.type,
			gl: this.gl,
			maxTextureSize: this.options.maxTextureSize,
			needsCORSWorkaround: this.browserCompatibility.needsCORSWorkaround()
		});

		if (result.error) {
			registration.error = result.error;
			if (this.options.onError) {
				this.options.onError(result.error);
			}
			console.error(`[WebGLOverlay] Failed to create texture for '${registration.id}':`, result.error);
		} else {
			registration.texture = result.texture;
			registration.error = undefined;
			registration.needsUpdate = false;

			// Store dimensions for memory tracking
			(registration as any).textureWidth = result.width;
			(registration as any).textureHeight = result.height;
		}
	}

	/**
	 * Handle element update from scheduler
	 */
	private handleElementUpdate(elementId: string): void {
		const registration = this.elements.get(elementId);
		if (!registration || !registration.texture || !this.textureFactory) return;

		// Update texture
		const result = this.textureFactory.updateTexture(
			registration.texture,
			registration.element,
			registration.type
		);

		if (!result.success && result.error) {
			registration.error = result.error;
			if (this.options.onError) {
				this.options.onError(result.error);
			}
		} else {
			registration.error = undefined;
			registration.needsUpdate = true; // Mark for re-render
		}
	}

	/**
	 * Render frame
	 */
	private render(deltaTime: number): void {
		if (!this.gl || this.destroyed) return;

		const gl = this.gl;

		// Clear canvas
		gl.clearColor(0, 0, 0, 0); // Transparent
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Render each element
		for (const registration of this.elements.values()) {
			if (registration.texture && !registration.error) {
				this.renderElement(registration, deltaTime);
			}
		}
	}

	/**
	 * Render a single element
	 */
	private renderElement(registration: ElementRegistration, deltaTime: number): void {
		if (!this.renderPipeline || !this.programManager) return;

		// Get compiled program for this element
		const program = this.elementPrograms.get(registration.id);
		if (!program) return;

		// Get texture
		if (!registration.texture) return;

		// Prepare render options
		const uniforms: Record<string, number | number[]> = {};

		// Add time uniform if shader uses it
		if (program.uniforms.has('uTime')) {
			uniforms.uTime = performance.now() / 1000.0; // Convert to seconds
		}

		// Add deltaTime if shader uses it
		if (program.uniforms.has('uDeltaTime')) {
			uniforms.uDeltaTime = deltaTime / 1000.0; // Convert to seconds
		}

		// Add custom uniforms from shader effect
		if (typeof registration.shader === 'object' && registration.shader.uniforms) {
			Object.assign(uniforms, registration.shader.uniforms);
		}

		// Render the element
		this.renderPipeline.render(program, registration.texture, {
			uniforms,
			clear: false // Don't clear between elements
		});

		// Mark as rendered
		registration.needsUpdate = false;
	}

	/**
	 * Compile shader program for an element
	 */
	private compileElementShader(registration: ElementRegistration): void {
		if (!this.programManager) return;

		// Determine vertex and fragment shader source
		let vertexSource = DEFAULT_VERTEX_SHADER;
		let fragmentSource = DEFAULT_FRAGMENT_SHADER;

		// Handle custom shader effect
		if (typeof registration.shader === 'object') {
			if (registration.shader.vertex) {
				vertexSource = registration.shader.vertex;
			}
			fragmentSource = registration.shader.fragment;
		} else if (typeof registration.shader === 'string') {
			// Built-in preset (Phase 3 will add preset library)
			// For now, use default shader
		}

		// Compile program
		const result = this.programManager.getProgram(
			vertexSource,
			fragmentSource,
			['aPosition', 'aTexCoord'],
			['uTexture', 'uTime', 'uDeltaTime'] // Standard uniforms
		);

		if (result instanceof OverlayError) {
			registration.error = result;
			if (this.options.onError) {
				this.options.onError(result);
			}
			console.error(`[WebGLOverlay] Failed to compile shader for '${registration.id}':`, result);
		} else {
			// Cache compiled program
			this.elementPrograms.set(registration.id, result);
		}
	}

	/**
	 * Recreate resources after context loss
	 */
	private recreateResources(): void {
		if (!this.gl) return;

		console.info('[WebGLOverlay] Recreating resources after context restore');

		// Reinitialize device capabilities
		this.deviceCapabilities = new DeviceCapabilities(this.gl);

		// Reinitialize texture factory
		this.textureFactory = new TextureFactory(
			this.gl,
			this.options.maxTextureSize,
			this.options.memoryBudget,
			this.browserCompatibility.needsCORSWorkaround()
		);

		// Reinitialize shader program manager
		this.programManager = new ShaderProgramManager(this.gl);

		// Reinitialize render pipeline
		this.renderPipeline = new RenderPipeline(this.gl, this.programManager);

		// Clear program cache
		this.elementPrograms.clear();

		// Recreate all textures and shaders
		for (const registration of this.elements.values()) {
			this.createElementTexture(registration);
			this.compileElementShader(registration);
		}

		console.info('[WebGLOverlay] Resources recreated');
	}
}
