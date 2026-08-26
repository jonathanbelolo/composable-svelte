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
import { createLogger, type DebugLog } from '../utils/debug.js';
import { ShaderProgramManager } from '../shaders/shader-program-manager.js';
import { RenderPipeline } from '../shaders/render-pipeline.js';
import { DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from '../shaders/default-shaders.js';
import { getPreset, hasPreset, type PresetName } from '../shaders/presets/index.js';
import { PositionTracker } from './position-tracker.js';
import type {
	OverlayOptions,
	OverlayInit,
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
export function createOverlay(options: OverlayInit = {}): OverlayContextAPI | OverlayError {
	// Check WebGL support
	const webglSupport = checkWebGLSupport();
	if (!webglSupport.supported) {
		return OverlayError.webGLNotSupported(webglSupport.reason);
	}

	try {
		return new WebGLOverlay(options);
	} catch (error) {
		// Not `webGLNotSupported`: `checkWebGLSupport` already said it is, and
		// the context was created. Reporting a missing `ResizeObserver` as
		// "use a modern browser that supports WebGL" sends the reader somewhere
		// there is nothing to find.
		console.error('[WebGLOverlay] Initialization failed:', error);
		return OverlayError.initializationFailed(
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
	private readonly log: DebugLog;
	private rebuildGeneration = 0;

	/**
	 * Load callbacks owed to elements registered during a context loss, by id.
	 *
	 * Beside the registrations rather than on them: `ElementRegistration` is
	 * handed to the consumer by `registerElement` and `getElement`, so a field
	 * there is published API — and this one was a mutable implementation detail
	 * of rebuild scheduling, writable from outside, describing nothing a
	 * consumer can act on.
	 *
	 * The contract is "called once the texture actually exists" — once, not once
	 * per restore, and not lost when a rebuild is superseded or fails.
	 */
	private readonly owedTextureLoaded = new Map<string, () => void>();
	private destroyed = false;

	constructor(options: OverlayInit = {}) {
		// The logger comes first, before anything that might use it.
		//
		// This used to be a module-level flag set 59 lines below, after
		// `BrowserCompatibility` and `DeviceCapabilities` had already been
		// constructed — and both log from their constructors, so the browser and
		// device lines never printed on the first overlay of a page. They are
		// the two lines `debug: true` exists for.
		this.log = createLogger(options.debug ?? false);

		// Initialize browser compatibility first
		this.browserCompatibility = new BrowserCompatibility(this.log);

		this.canvas = options.canvas || this.createCanvas();

		// Everything acquired from here on registers its own teardown.
		//
		// The constructor had no error path at all. `WebGLContextManager`
		// attaches canvas listeners, `RenderLoop` attaches one to `document`,
		// and `PositionTracker` constructs observers that throw where they are
		// absent — and `createOverlay` catches the throw, so the half-built
		// instance and its `destroy()` were unreachable. Verified: a failed
		// construction left one `visibilitychange` listener and two
		// `webglcontext*` listeners behind, which is the leak class `ed5cb3c`
		// fixed on the success path only.
		//
		// `acquired` collects a release for each resource as it is taken, and the
		// catch runs them in reverse. Inline rather than extracted into a
		// `build()` method: every field has to stay definitely assigned in the
		// constructor, and `tsc` rejects the extracted form for exactly that.
		const acquired: Array<() => void> = [];
		try {
				// Initialize context manager
				this.contextManager = new WebGLContextManager(this.log);
			acquired.push(() => this.contextManager.destroy());

			// Set up context loss/restore callbacks.
			//
			// The consumer is always told; `handleContextLoss` gates only whether we
			// *recover* for them. Both callbacks used to live inside the disabled
			// block, so `handleContextLoss: false` — exactly what someone intending
			// to handle loss themselves would pass — silently removed the
			// notification they were relying on, while the low-level listeners in
			// `WebGLContextManager` stayed registered regardless.
			//
			// Read from `this.options` rather than a local computed here: there
			// were two of these, a local that decided the behaviour and a field
			// nothing read, which is one more than the number of answers the
			// question has. The callbacks run long after the merge below.
			this.contextManager.onContextLost(() => {
				console.warn('[WebGLOverlay] WebGL context lost');
				if (this.options.onContextLost) {
					this.options.onContextLost();
				}
			});

			this.contextManager.onContextRestored(() => {
				this.log('[WebGLOverlay] WebGL context restored');
				if (this.options.handleContextLoss) {
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
			this.deviceCapabilities = new DeviceCapabilities(this.gl, this.log);

			// Merge options with defaults
			this.options = {
				targetFPS: options.targetFPS ?? this.deviceCapabilities.recommendedFPS,
				maxTextureSize: options.maxTextureSize ?? this.deviceCapabilities.maxTextureSize,
				memoryBudget: options.memoryBudget ?? 200 * 1024 * 1024, // 200MB default
				debug: options.debug ?? false,
				handleContextLoss: options.handleContextLoss ?? true,
				onContextLost: options.onContextLost ?? (() => {}),
				onContextRestored: options.onContextRestored ?? (() => {}),
				onError: options.onError ?? (() => {})
			};

			// Initialize texture factory
			this.textureFactory = new TextureFactory(
				this.gl,
				this.options.maxTextureSize,
				this.options.memoryBudget,
				this.browserCompatibility.needsCORSWorkaround(),
				// The fifth of the five classes `fbef369` threaded a logger
				// through, and the one construction site that missed it — so
				// `debug: true` printed the max-texture-size line only after a
				// context restore, which is the path that did pass it.
				this.log
			);

			// Initialize shader program manager
			this.programManager = new ShaderProgramManager(this.gl);
			acquired.push(() => this.programManager?.destroy());

			// Initialize render pipeline
			this.renderPipeline = new RenderPipeline(this.gl, this.programManager);
			acquired.push(() => this.renderPipeline?.destroy());

			// Initialize update scheduler
			this.updateScheduler = new UpdateScheduler();
			acquired.push(() => this.updateScheduler.destroy());
			this.updateScheduler.setUpdateCallback((elementId) => {
				this.handleElementUpdate(elementId);
			});

			// Initialize render loop
			this.renderLoop = new RenderLoop(this.options.targetFPS, this.log);
			acquired.push(() => this.renderLoop.destroy());

			// Initialize position tracker
			this.positionTracker = new PositionTracker(null); // null = track relative to viewport
			acquired.push(() => this.positionTracker.destroy());
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
		} catch (error) {
			for (const release of acquired.reverse()) {
				try {
					release();
				} catch {
					// A teardown must not mask the failure that triggered it.
				}
			}
			throw error;
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
		// Every failure here goes through `report`. Two of these three returned
		// the error and nothing else — no warning, no `onError` — against this
		// method's own docstring, so a consumer registering a duplicate id saw
		// silence unless they checked the return.
		if (this.destroyed) {
			return this.report(OverlayError.invalidElementType(id, 'Overlay has been destroyed'));
		}

		if (this.elements.has(id)) {
			return this.report(
				OverlayError.invalidElementType(id, `Element with ID '${id}' already registered`)
			);
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

		// A registration made while the context is gone is accepted, not refused —
		// unless the consumer turned automatic recovery off, in which case
		// nothing will ever build it.
		//
		// `recreateResources` runs only under `handleContextLoss`, so on that
		// branch a deferred element is dead permanently *and* its id cannot be
		// reclaimed: the natural retry after the restore is refused as a
		// duplicate. Refusing here keeps the id free and still produces
		// `CONTEXT_LOST`, which is the signal a consumer who opted out is
		// waiting for.
		if (this.contextIsLost() && !this.options.handleContextLoss) {
			return this.report(OverlayError.contextLost());
		}

		// A registration made while the context is gone is accepted, not refused.
		//
		// Refusing it produced `CONTEXT_LOST` — the first thing in the package
		// ever to — but it meant the element never entered `this.elements`, and
		// `recreateResources` iterates exactly that map on restore. So the
		// element was dropped for good, and the README's own pattern registers
		// from `img.onload`, which can land in that window at any time. The
		// consumer is told; the restore builds what could not be built now.
		// Resolving the shader needs no GL, so it happens either way — a preset
		// name left as a string makes `updateUniforms` a silent no-op, and the
		// restore would then resolve the preset afresh and discard whatever the
		// consumer had set.
		this.resolveElementShader(registration);

		const lost = this.contextIsLost();

		if (lost) {
			// Carried so the rebuild can honour it. It used to be a parameter of
			// `createElementTexture` and nothing else, and `recreateResources`
			// calls that with no callback — so for a deferred element
			// `onTextureLoaded` never fired at all, not during the loss and not
			// after it. In `examples/shader-gallery` that callback fades the DOM
			// image out, so the effect stayed invisible for the life of the page.
			if (options.onTextureLoaded) {
				this.owedTextureLoaded.set(registration.id, options.onTextureLoaded);
			}
		} else {
			// Create initial texture
			this.createElementTexture(registration, options.onTextureLoaded);

			// Compile shader program
			this.compileElementShader(registration);
		}

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

		if (lost) {
			this.report(OverlayError.contextLost());
		}

		return registration;
	}

	/**
	 * Unregister an element
	 */
	unregisterElement(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) {
			this.report(OverlayError.elementNotFound(id));
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
		// The debt goes with the element. Keyed by id rather than held on the
		// registration, so unlike a field it does not disappear on its own.
		this.owedTextureLoaded.delete(id);

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
			this.report(OverlayError.elementNotFound(id));
			return;
		}

		if (registration.updateStrategy === 'manual') {
			this.updateScheduler.triggerUpdate(id);
		} else {
			this.report(
				OverlayError.invalidElementType(
					id,
					`has strategy '${registration.updateStrategy}'; updateElement() services 'manual' only`
				)
			);
		}
	}

	/**
	 * Update shader uniforms for an element
	 */
	updateUniforms(id: string, uniforms: Record<string, number | number[]>): void {
		const registration = this.elements.get(id);
		if (!registration) {
			this.report(OverlayError.elementNotFound(id));
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
			this.report(OverlayError.elementNotFound(id));
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
		// The fifth id-taking method, and the one that reported nothing —
		// which made "every refusal goes through `report()`" false, and the test
		// named "reports every method called with an id that is not registered"
		// exercise four of five.
		if (!this.elements.has(id)) {
			this.report(OverlayError.elementNotFound(id));
			return;
		}
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

		// Free the GPU context.
		//
		// This was gated on an `ownsCanvas` flag, derived from whether
		// `options.canvas` was supplied — and `createOverlay` is not exported,
		// so the only public entry is the component, which always supplies its
		// own bound canvas. The flag was therefore always `false` and this whole
		// branch was dead: no overlay released its context, ever. That is the
		// opposite of what the same series argued in `webgl-support.ts`, where
		// the support probe was taught to release *its* context because browsers
		// cap live contexts near sixteen and force-lose the oldest.
		//
		// The concern the flag came from was real — losing the context of a
		// canvas the caller keeps using kills it, since a context lost this way
		// returns only on `restoreContext()`. But no caller keeps one: the
		// component unmounts its canvas in the same teardown. If `createOverlay`
		// is ever exported for a foreign canvas, that entry point owes an opt-out.
		if (this.gl) {
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
		onTextureLoaded?: (() => void) | undefined,
		generation = this.rebuildGeneration
	): Promise<void> {
		if (!this.textureFactory || !this.gl) return;

		// The factory that will do the allocating, captured before the await.
		//
		// `recreateResources` replaces `this.textureFactory` with one whose
		// accounting starts at zero. Deallocating a superseded texture against
		// `this.textureFactory` therefore subtracted bytes the *current* factory
		// never allocated, and the budget silently gained room — the exact hole
		// the comment in `recreateResources` says it is being careful about, and
		// which the generation guard introduced while closing a handle leak.
		// Deallocating against the factory that allocated is a no-op when that
		// factory has been discarded, which is what it should be.
		const factory = this.textureFactory;

		// Only what the factory reads. It was handed `gl`, `maxTextureSize` and
		// `needsCORSWorkaround` on every call and discarded all three — it uses
		// the values it was constructed with.
		const result = await factory.createTexture({
			element: registration.element,
			type: registration.type
		});

		// The element may have gone while this was resolving. `registerElement`
		// does not await this call, so an immediate `unregisterElement` runs
		// first — and then the texture handle landed on a registration no longer
		// in the map: never deleted, and the memory accounting never told. Free
		// it here instead of assigning it to nothing.
		// Superseded by a later rebuild, as well as destroyed or unregistered.
		// Identity alone is not enough here: `recreateResources` reuses the
		// registration objects, so two restores in one task both assigned and
		// the first texture was never freed.
		if (
			this.destroyed ||
			this.elements.get(registration.id) !== registration ||
			generation !== this.rebuildGeneration
		) {
			if (result.texture) {
				factory.deleteTexture(result.texture, result.width ?? 0, result.height ?? 0);
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
			//
			// Clearing the deferred callback *here* is what makes it survive a
			// rebuild that never delivers. `recreateResources` used to read and
			// delete it before starting the creation, so a rebuild superseded by
			// a second restore — or one whose creation failed — consumed the
			// callback and dropped it: the texture appeared and the consumer was
			// never told, for the life of the page. That is the shader-gallery
			// symptom this deferral was written to close, reopened by the
			// generation guard added alongside it.
			this.owedTextureLoaded.delete(registration.id);
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
		// Same reason as `render()`, and it matters more here: a `frame`-strategy
		// video went on calling `texImage2D` every frame for the whole duration
		// of a context loss.
		if (this.contextIsLost()) return;

		const registration = this.elements.get(elementId);
		if (!registration || !registration.texture || !this.textureFactory) return;

		// Update texture. The tracked dimensions go in so the factory can release
		// the outgoing allocation rather than adding the new one on top of it.
		const result = this.textureFactory.updateTexture(
			registration.texture,
			registration.element,
			registration.type,
			registration.width !== undefined && registration.height !== undefined
				? { width: registration.width, height: registration.height }
				: undefined
		);

		if (result.success) {
			// A re-upload can change the texture's dimensions — a video that
			// switched resolution, a canvas the app resized — and the accounting
			// deallocates against these on unregister.
			if (result.width !== undefined) registration.width = result.width;
			if (result.height !== undefined) registration.height = result.height;
		}

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
	 * Report an error to the consumer and hand it back.
	 *
	 * Every failure path used to `console.warn` and return, so `onError` — the
	 * one programmatic signal the overlay offers — saw texture and shader
	 * failures only. Three `OverlayErrorCode` members had no constructor call
	 * anywhere as a result, on an enum exported so consumers could switch on it.
	 */
	private report(error: OverlayError): OverlayError {
		console.warn(`[WebGLOverlay] ${error.message}`);
		if (this.options.onError) {
			this.options.onError(error);
		}
		return error;
	}

	/**
	 * Whether the context is currently lost.
	 *
	 * `WebGLContextManager` already tracks this and returns null from
	 * `getContext()` while lost — the overlay simply never asked, and went on
	 * drawing and uploading into a dead context every frame.
	 */
	private contextIsLost(): boolean {
		return this.contextManager.getContext() === null;
	}

	/**
	 * Render frame
	 */
	private render(deltaTime: number): void {
		// A lost context accepts every call and performs none of them, so this
		// used to spend a frame's work per frame producing nothing until the
		// restore arrived — if it ever did.
		if (!this.gl || this.destroyed || this.contextIsLost()) return;

		const gl = this.gl;

		// Clear canvas
		gl.clearColor(0, 0, 0, 0); // Transparent
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Render each element that has something to render with.
		//
		// This used to also skip any element with a truthy `error`, which was
		// both redundant and destructive. Redundant because `renderElement`
		// already returns without a program or a texture, and those are the two
		// things a failure leaves missing. Destructive because `error` is set by
		// a failed `setShader` on an element that still has a perfectly good
		// program and texture — and nothing cleared it, so a single bad shader
		// blanked the element permanently, with no public call that could bring
		// it back. `compileElementShader` clears it on success now, so the field
		// reports the last operation rather than latching forever.
		for (const registration of this.elements.values()) {
			if (registration.texture) {
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
	/**
	 * Resolve a shader to its sources, and normalise `registration.shader`.
	 *
	 * Split out of `compileElementShader` because it needs no GL, and the
	 * compile does. That mattered the moment registrations began deferring
	 * through a context loss: the whole method was skipped, so a preset *name*
	 * stayed a string — and `updateUniforms` guards on
	 * `typeof shader === 'object'`, so it was a silent no-op for the length of
	 * the loss, with whatever the consumer set discarded when the restore
	 * resolved the preset afresh. Verbatim the defect the unknown-preset branch
	 * below was written to close, reopened through a different door.
	 */
	private resolveElementShader(registration: ElementRegistration): {
		vertexSource: string;
		fragmentSource: string;
	} {
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
				// Unknown preset name: fall back to the default shader, and
				// record it as an *object*.
				//
				// It used to be left as the unrecognised string, and
				// `updateUniforms` guards on `typeof … === 'object'` — so that
				// element's uniforms were a silent no-op for the rest of its
				// life, on top of the shader it asked for not existing.
				console.warn(
					`[WebGLOverlay] Unknown shader preset '${registration.shader}' for element '${registration.id}', using default shader`
				);
				registration.shader = { fragment: DEFAULT_FRAGMENT_SHADER };
			}
		}


		return { vertexSource, fragmentSource };
	}

	private compileElementShader(registration: ElementRegistration): boolean {
		if (!this.programManager) return false;

		const { vertexSource, fragmentSource } = this.resolveElementShader(registration);

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

		// Cache compiled program. A success clears whatever error was standing:
		// without this there is no way back from a failed recompile, because
		// nothing else ever clears the field for an element whose texture is
		// already made — and `static` is the default strategy, so the texture
		// path that clears it will not run again either.
		delete registration.error;
		this.elementPrograms.set(registration.id, result);
		return true;
	}

	/**
	 * Recreate resources after context loss
	 */
	private recreateResources(): void {
		if (!this.gl) return;

		this.log('[WebGLOverlay] Recreating resources after context restore');

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
		this.deviceCapabilities = new DeviceCapabilities(this.gl, this.log);

		// Reinitialize texture factory
		this.textureFactory = new TextureFactory(
			this.gl,
			this.options.maxTextureSize,
			this.options.memoryBudget,
			this.browserCompatibility.needsCORSWorkaround(),
			this.log
		);

		// Reinitialize shader program manager
		this.programManager = new ShaderProgramManager(this.gl);

		// Reinitialize render pipeline
		this.renderPipeline = new RenderPipeline(this.gl, this.programManager);

		// Clear program cache
		this.elementPrograms.clear();

		// Recreate all textures and shaders.
		//
		// The stale handles and dimensions go first. Every GL object from the
		// dead context is invalid, and the new `TextureFactory` starts its
		// accounting at zero — so leaving `width`/`height` in place meant that
		// if the rebuild's texture creation failed, a later `unregisterElement`
		// deallocated bytes this factory never allocated, and the budget
		// silently gained room for textures it could not afford.
		// A generation per rebuild, so a second restore landing while the first
		// one's async texture creation is still in flight cannot orphan its
		// result. `createElementTexture` guards on the *registration* identity,
		// and `recreateResources` reuses the same objects — so both creations
		// used to assign, and the first handle was never deleted.
		this.rebuildGeneration += 1;
		const generation = this.rebuildGeneration;

		for (const registration of this.elements.values()) {
			delete registration.texture;
			delete registration.width;
			delete registration.height;

			// The callback owed to a registration deferred through the loss.
			// Read, not consumed: `createElementTexture` clears it when it
			// actually fires, so a rebuild that is superseded or fails leaves the
			// debt in place for the next one.
			this.createElementTexture(
				registration,
				this.owedTextureLoaded.get(registration.id),
				generation
			);
			this.compileElementShader(registration);
		}

		this.log('[WebGLOverlay] Resources recreated');
	}
}
