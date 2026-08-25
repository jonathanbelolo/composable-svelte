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
import { debugLog, setDebugLogging } from '../utils/debug.js';
import { ShaderProgramManager } from '../shaders/shader-program-manager.js';
import { RenderPipeline } from '../shaders/render-pipeline.js';
import { DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from '../shaders/default-shaders.js';
import { getPreset, hasPreset, type PresetName } from '../shaders/presets/index.js';
import { PositionTracker } from './position-tracker.js';
import type {
	OverlayOptions,
	OverlayContextAPI,
	ElementRegistration,
	ElementType,
	ShaderEffect,
	UpdateStrategy,
	ElementBounds
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
	private positionTracker: PositionTracker;
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

		// Set up context loss/restore callbacks.
		//
		// The consumer is always told; `handleContextLoss` gates only whether we
		// *recover* for them. Both callbacks used to live inside the disabled
		// block, so `handleContextLoss: false` — exactly what someone intending
		// to handle loss themselves would pass — silently removed the
		// notification they were relying on, while the low-level listeners in
		// `WebGLContextManager` stayed registered regardless.
		const recoverAutomatically = options.handleContextLoss !== false;

		this.contextManager.onContextLost(() => {
			console.warn('[WebGLOverlay] WebGL context lost');
			if (this.options.onContextLost) {
				this.options.onContextLost();
			}
		});

		this.contextManager.onContextRestored(() => {
			debugLog('[WebGLOverlay] WebGL context restored');
			if (recoverAutomatically) {
				this.recreateResources();
			}
			if (this.options.onContextRestored) {
				this.options.onContextRestored();
			}
		});

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
			targetFPS: options.targetFPS ?? this.deviceCapabilities.recommendedFPS,
			maxTextureSize: options.maxTextureSize ?? this.deviceCapabilities.maxTextureSize,
			memoryBudget: options.memoryBudget ?? 200 * 1024 * 1024, // 200MB default
			debug: options.debug ?? false,
			handleContextLoss: options.handleContextLoss ?? true,
			onContextLost: options.onContextLost ?? (() => {}),
			onContextRestored: options.onContextRestored ?? (() => {}),
			onError: options.onError ?? (() => {})
		};

		// The utility classes take no options of their own, so the flag is set
		// once here and read by `debugLog`.
		setDebugLogging(this.options.debug);

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

		// Initialize position tracker
		this.positionTracker = new PositionTracker(null); // null = track relative to viewport
		this.positionTracker.onPositionUpdate((elementId, bounds) => {
			this.handlePositionUpdate(elementId, bounds);
		});

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
			/**
			 * Called once the element's texture actually exists.
			 *
			 * Lives here rather than in the component because only this class
			 * knows when the async creation settled. The component used to fire
			 * its own copy from `setTimeout(…, 100)` — so it reported success on
			 * CORS rejection, on an oversize texture and on an unloaded image,
			 * and fired early for anything slower. Failures go to `onError`.
			 */
			onTextureLoaded?: (() => void) | undefined;
		}
	): ElementRegistration | OverlayError {
		if (this.destroyed) {
			return OverlayError.invalidElementType(id, 'Overlay has been destroyed');
		}

		if (this.elements.has(id)) {
			return OverlayError.invalidElementType(id, `Element with ID '${id}' already registered`);
		}

		// Determine update strategy
		const updateStrategy = options.updateStrategy ?? this.inferUpdateStrategy(options.type);

		// Get initial element bounds
		const rect = element.getBoundingClientRect();
		const initialBounds: ElementBounds = {
			x: rect.left,
			y: rect.top,
			width: rect.width,
			height: rect.height
		};

		// Create element registration
		const registration: ElementRegistration = {
			id,
			element,
			type: options.type,
			updateStrategy,
			shader: options.shader,
			bounds: initialBounds
		};

		// Create initial texture
		this.createElementTexture(registration, options.onTextureLoaded);

		// Compile shader program
		this.compileElementShader(registration);

		// Add to elements map
		this.elements.set(id, registration);

		// Register with update scheduler
		this.updateScheduler.registerElement(registration);

		// Start tracking element position
		this.positionTracker.track(id, element);

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

		// Stop tracking element position
		this.positionTracker.untrack(id);

		// Unregister from update scheduler
		this.updateScheduler.unregisterElement(id);

		// Delete texture
		if (registration.texture && this.textureFactory) {
			const width = registration.width ?? 0;
			const height = registration.height ?? 0;
			this.textureFactory.deleteTexture(registration.texture, width, height);
		}

		// Release the compiled program. `ShaderProgramManager` refcounts by
		// source and `releaseProgram` deletes at zero — but it had no callers
		// anywhere, and this map was never touched here at all, so only
		// `destroy()` freed anything, via a `clearCache` that ignores refcounts.
		//
		// The `releaseProgram` call is the pinned half: the fake `gl` counts
		// `deleteProgram` against `createProgram`. The `delete` below is not
		// observable from outside — `render()` iterates `this.elements`, which no
		// longer holds this id, so a stale entry is unreachable rather than
		// wrong. It is still a map that would grow for the life of the overlay,
		// which is a leak of JS objects if not of GPU ones.
		const program = this.elementPrograms.get(id);
		if (program && this.programManager) {
			this.programManager.releaseProgram(program);
		}
		this.elementPrograms.delete(id);

		// Remove from elements map. Deleted *before* awaiting anything, so a
		// texture still in flight can see that its element has gone.
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

		// Replace the shader object rather than mutating it in place.
		//
		// Registering by preset name resolves to the module-level constant, so
		// two elements naming the same preset would otherwise share one object:
		// retuning either retunes both, and — since that object lives in the
		// preset registry — every element registered afterwards for the rest of
		// the page's life.
		if (typeof registration.shader === 'object') {
			registration.shader = {
				...registration.shader,
				uniforms: {
					...registration.shader.uniforms,
					...uniforms
				}
			};
		}
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

		// Acquire the new program before releasing the old one, and release it
		// unconditionally afterwards.
		//
		// Both halves matter. `getProgram` is refcounted and takes a reference
		// on every call, and nothing here ever gave one back: switching shader
		// abandoned the outgoing program *and* left the incoming one a
		// reference too high, so the later `unregisterElement` decremented to 1
		// rather than 0 and freed nothing either. Releasing *first* is not the
		// fix — recompiling to the same source is a cache hit, so it would drop
		// the count to zero, delete the program, and then hand back the deleted
		// handle.
		const previousShader = registration.shader;
		const previousProgram = this.elementPrograms.get(id);

		registration.shader = shader;

		if (this.compileElementShader(registration)) {
			if (previousProgram) {
				this.programManager?.releaseProgram(previousProgram);
			}
			return;
		}

		// A failed recompile keeps the element rendering what it was rendering,
		// so `shader` must go back too. Otherwise the registration handed out
		// by `getElement()` names a shader that is not the one on screen.
		registration.shader = previousShader;
	}

	/**
	 * Update element position
	 *
	 * Manually trigger a position update for an element.
	 * Useful when CSS transforms change the element's visual position.
	 *
	 * @param id - Element ID
	 */
	updateElementPosition(id: string): void {
		this.positionTracker.updateElementPosition(id);
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

		// Set first, not last. `loseContext()` below dispatches
		// `webglcontextlost` synchronously, which runs the context manager's
		// handler, which calls the consumer's `onContextLost` — on an overlay
		// they have just torn down — and, because that handler calls
		// `preventDefault()`, may then trigger `webglcontextrestored` and
		// rebuild every resource on a destroyed overlay. This flag was set at
		// the very end, so the guard the class already had could not help.
		this.destroyed = true;

		// `destroy()`, not `stop()`. `stop()` cancels the pending frame and
		// leaves the `visibilitychange` listener on `document`, so every overlay
		// ever mounted left one behind.
		this.renderLoop.destroy();

		// Unregister all elements
		for (const id of Array.from(this.elements.keys())) {
			this.unregisterElement(id);
		}

		// Destroy position tracker
		this.positionTracker.destroy();

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

		// Before losing the context, so the handlers cannot fire into a
		// half-destroyed overlay. This also drops the consumer's registered
		// callbacks, which were never cleared.
		this.contextManager.destroy();

		// Clean up WebGL resources
		if (this.gl) {
			// Delete all textures (already done in unregisterElement)
			// Lose context to free GPU memory
			const loseContext = this.gl.getExtension('WEBGL_lose_context');
			if (loseContext) {
				loseContext.loseContext();
			}
		}

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
			default:
				return 'static';
		}
	}

	/**
	 * Create texture for an element
	 */
	private async createElementTexture(
		registration: ElementRegistration,
		onTextureLoaded?: (() => void) | undefined
	): Promise<void> {
		if (!this.textureFactory || !this.gl) return;

		// Only what the factory reads. It was handed `gl`, `maxTextureSize` and
		// `needsCORSWorkaround` on every call and discarded all three — it uses
		// the values it was constructed with.
		const result = await this.textureFactory.createTexture({
			element: registration.element,
			type: registration.type
		});

		// The element may have gone while this was resolving. `registerElement`
		// does not await this call, so an immediate `unregisterElement` runs
		// first — and then the texture handle landed on a registration no longer
		// in the map: never deleted, and the memory accounting never told. Free
		// it here instead of assigning it to nothing.
		if (this.destroyed || this.elements.get(registration.id) !== registration) {
			if (result.texture && this.textureFactory) {
				this.textureFactory.deleteTexture(result.texture, result.width ?? 0, result.height ?? 0);
			}
			return;
		}

		if (result.error) {
			registration.error = result.error;
			if (this.options.onError) {
				this.options.onError(result.error);
			}
			console.error(`[WebGLOverlay] Failed to create texture for '${registration.id}':`, result.error);
		} else {
			// `result.texture` is optional on the success branch too, so only assign
			// when there is one. The caller already treats a vacant texture as a
			// supported state — see the `if (!registration.texture) return` guard.
			if (result.texture) {
				registration.texture = result.texture;
			}
			delete registration.error;

			// Only on the success branch, and only once the texture exists.
			onTextureLoaded?.();

			// Store dimensions for memory tracking — in the fields
			// `ElementRegistration` declares for them.
			//
			// These were written as `textureWidth`/`textureHeight` through an
			// `any` cast, so the declared `width` and `height` were never
			// assigned: two exported fields that `getElement()` handed to the
			// consumer as permanently `undefined`, next to two ad-hoc properties
			// the type did not mention.
			registration.width = result.width;
			registration.height = result.height;
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
			delete registration.error;
		}
	}

	/**
	 * Handle element position update from tracker
	 */
	private handlePositionUpdate(elementId: string, bounds: ElementBounds): void {
		const registration = this.elements.get(elementId);
		if (!registration) return;

		// Update bounds
		registration.bounds = bounds;

		// Element needs re-render with new position
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

		// Render the element with bounds
		// WebGL viewport is set to canvas.width x canvas.height (physical pixels)
		// DOM bounds are in CSS pixels from getBoundingClientRect()
		// We must convert CSS pixels to physical pixels for correct NDC conversion
		const dpr = window.devicePixelRatio || 1;
		const physicalBounds = {
			x: registration.bounds.x * dpr,
			y: registration.bounds.y * dpr,
			width: registration.bounds.width * dpr,
			height: registration.bounds.height * dpr
		};

		this.renderPipeline.render(program, registration.texture, {
			bounds: physicalBounds, // Use physical pixel bounds
			canvasWidth: this.canvas.width, // Use physical pixel canvas dimensions
			canvasHeight: this.canvas.height,
			uniforms,
			clear: false // Don't clear between elements
		});

		// Mark as rendered
	}

	/**
	 * Compile shader program for an element
	 */
	private compileElementShader(registration: ElementRegistration): boolean {
		if (!this.programManager) return false;

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
			// Try to load built-in preset
			if (hasPreset(registration.shader)) {
				const preset = getPreset(registration.shader as PresetName);
				if (preset) {
					if (preset.vertex) {
						vertexSource = preset.vertex;
					}
					fragmentSource = preset.fragment;
					// Copy rather than alias. `getElement()` hands the
					// registration to the consumer, and `preset` is the
					// registry's own object — one `shader.uniforms.x = …` from
					// outside would retune every element that names it.
					registration.shader = {
						...preset,
						...(preset.uniforms ? { uniforms: { ...preset.uniforms } } : {})
					};
				}
			} else {
				// Unknown preset name, log warning and use default
				console.warn(
					`[WebGLOverlay] Unknown shader preset '${registration.shader}' for element '${registration.id}', using default shader`
				);
			}
		}

		// Compile program. The list of uniform names that used to be assembled
		// here — the three built-ins plus whatever keys the shader object
		// happened to carry — decided which uniforms were ever bindable, for the
		// life of the element. Anything the shader declared but the list omitted
		// was unreachable, which made `updateUniforms` unable to introduce one.
		// The compiler reads the linked program's active uniforms instead.
		const result = this.programManager.getProgram(vertexSource, fragmentSource);

		if (result instanceof OverlayError) {
			registration.error = result;
			if (this.options.onError) {
				this.options.onError(result);
			}
			console.error(`[WebGLOverlay] Failed to compile shader for '${registration.id}':`, result);
			return false;
		}

		// Cache compiled program
		this.elementPrograms.set(registration.id, result);
		return true;
	}

	/**
	 * Recreate resources after context loss
	 */
	private recreateResources(): void {
		if (!this.gl) return;

		debugLog('[WebGLOverlay] Recreating resources after context restore');

		// Release the outgoing owners before replacing them. They were simply
		// overwritten, so their caches, buffer handles and the objects
		// themselves survived every restore.
		//
		// The GPU memory is already gone — this runs *after* a context loss, so
		// every GL object it held is invalid and the `delete*` calls below are
		// no-ops by specification. What this reclaims is the JS side. Worth
		// doing, and worth not describing as a GPU leak.
		this.programManager?.destroy();
		this.renderPipeline?.destroy();

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

		debugLog('[WebGLOverlay] Resources recreated');
	}
}
