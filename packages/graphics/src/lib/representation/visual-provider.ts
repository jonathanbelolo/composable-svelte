/**
 * First-party representation provider for graphics surfaces.
 *
 * During a fluid-motion run the framework asks providers to represent each
 * element of a participant. For a `<canvas>` that `<Scene>` or `<WebGLOverlay>`
 * is rendering into, this provider answers with a 2D mirror the renderer copies
 * into after every frame. When the canvas's feature retires (`retire()`), render
 * authority moves from the component to the visual run: the renderer's own
 * frame loop and page inputs stop, and the run's frame clock drives it from then
 * on until the run disposes it.
 *
 * What continues after retirement is visual only, of two kinds:
 * - **renderer-driven** progression — the engine clock, camera inertia, the
 *   renderer's own animations and shader time uniforms;
 * - **declared animations** (`<Scene>`'s `startAnimation` descriptors) that were
 *   playing, continued from a data snapshot on the reducer's own clock, so the
 *   outgoing copy stays in phase with a destination reading the same state.
 *
 * **Business-driven** change stops: the store subscription is cut at owner
 * retirement, no reducer runs and nothing dispatches, so every other state
 * change ends on the last synced pose. A destination that should continue the
 * same scene gets that state through its own application state; this provider
 * never seeds it.
 *
 * Renderers opt in through `RenderAuthority`. `BabylonAdapter` and the WebGL
 * overlay implement it; a custom `GraphicsAdapter` without `renderAuthority()`
 * is not represented here, and the framework's built-in canvas mirror applies.
 */

// ---------------------------------------------------------------------------
// Provider contract.
//
// A structural copy of core's `RepresentationProvider` family
// (`@composable-svelte/core/application/motion`), declared here rather than
// imported: a provider is consumed structurally, and the peer range this
// package supports predates the contract. `tests/representation/contract.types.ts`
// fails the check if the two drift apart.
// ---------------------------------------------------------------------------

/** Scoped visual capabilities for one representation (core's `RepresentationContext`). */
export interface GraphicsRepresentationContext {
	readonly document: Document;
	readonly signal: AbortSignal;
	readonly reducedMotion: boolean;
	diagnose(reason: string): void;
}

/** Render authority held by the visual run after retirement (core's `RetainedRenderer`). */
export interface GraphicsRetainedRenderer {
	frame?(time: number): void;
	dispose(): void;
}

/** One graphics representation (core's `ProvidedRepresentation`). */
export interface GraphicsRepresentation {
	readonly node: HTMLElement;
	readonly continuity: 'static' | 'live' | 'retained';
	readonly ready?: Promise<void> | undefined;
	frame?(time: number): void;
	retire?(): GraphicsRetainedRenderer | void;
	dispose(): void;
}

/** The provider (core's `RepresentationProvider`). */
export interface GraphicsVisualProvider {
	readonly name: string;
	represent(
		source: Element,
		context: GraphicsRepresentationContext
	): GraphicsRepresentation | { readonly declined: string } | undefined;
}

/**
 * What a renderer offers so its drawing can outlive the component that owns it.
 *
 * Every method is visual. Nothing here reads or writes application state.
 */
export interface RenderAuthority {
	/**
	 * Stop the renderer's own frame loop and page-facing inputs (camera controls,
	 * resize and position tracking). From then on it draws only through
	 * `renderFrame`. Called once, at retirement.
	 */
	detachFromPage(): void;
	/** Draw one frame now, advancing renderer-driven progression only. */
	renderFrame(time: number): void;
	/**
	 * Observe every completed frame — the renderer's own loop and `renderFrame`
	 * alike — while its drawing buffer is still readable. Returns the removal.
	 */
	onFrame(listener: () => void): () => void;
	/** Observe GPU context loss. Returns the removal. */
	onContextLost(listener: () => void): () => void;
	isContextLost(): boolean;
	/** Release the renderer and its GPU context. Idempotent. */
	dispose(): void;
}

/** What the owning component holds for its registered canvas. */
export interface SurfaceRegistration {
	/**
	 * The business owner retired and the component has already cut its store
	 * ties. Releases the renderer now, unless a representation of it is
	 * outstanding: then at retirement's transfer, the component's teardown, or
	 * the last representation's disposal, whichever comes first.
	 */
	ownerRetired(): void;
	/**
	 * The component is tearing down. Releases the renderer, unless render
	 * authority was transferred, in which case the visual run releases it.
	 */
	release(): void;
	/** Render authority was transferred to a visual run. */
	readonly retained: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'graphics';

/**
 * The representation provider for `<Scene>` and `<WebGLOverlay>` canvases.
 *
 * Pass it to the application's visual configuration. No other code is needed:
 * the components register their canvases themselves.
 *
 * @example
 * ```ts
 * import { fluidMotion } from '@composable-svelte/core/application/motion';
 * import { graphicsVisualProvider } from '@composable-svelte/graphics';
 *
 * defineApplication(composition, {
 *   initialState,
 *   routing,
 *   visual: fluidMotion({ providers: [graphicsVisualProvider()] })
 * });
 * ```
 */
export function graphicsVisualProvider(): GraphicsVisualProvider {
	return {
		name: PROVIDER_NAME,
		represent(source, context) {
			if (!(source instanceof HTMLCanvasElement)) return undefined;
			return surfaces.get(source)?.represent(context);
		}
	};
}

/**
 * Ends a component's business: detaches it from its store, and may return a
 * visual-only continuation built from a data snapshot (see
 * `continueAnimations`), which runs before each retained frame.
 */
export type BusinessHandOff = () => (() => void) | void;

/**
 * Register a component's canvas while its renderer is live.
 *
 * Called by `<Scene>` and `<WebGLOverlay>` once initialisation has succeeded.
 * From then on the renderer is released only through the returned registration
 * or, after retirement, by the visual run — exactly once either way.
 *
 * `handOff` runs exactly once, at the owner's retirement or at the transfer of
 * render authority, whichever comes first, and is dropped afterwards so nothing
 * retained can reach the store.
 */
export function registerRenderSurface(
	canvas: HTMLCanvasElement,
	authority: RenderAuthority,
	handOff: BusinessHandOff
): SurfaceRegistration {
	surfaces.get(canvas)?.componentRelease();
	const surface = new RenderSurface(canvas, authority, handOff);
	surfaces.set(canvas, surface);
	return {
		ownerRetired: () => surface.ownerRetired(),
		release: () => surface.componentRelease(),
		get retained() {
			return surface.phase === 'retained';
		}
	};
}

/**
 * Live resources this module holds, for resource ledgers and tests: registered
 * renderers not yet released, of which retained by a visual run, outstanding
 * representations, and mirrors still receiving frames.
 */
export function graphicsRepresentationResources(): {
	surfaces: number;
	retained: number;
	representations: number;
	mirrors: number;
} {
	return { ...ledger };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const surfaces = new WeakMap<HTMLCanvasElement, RenderSurface>();
const ledger = { surfaces: 0, retained: 0, representations: 0, mirrors: 0 };

interface Mirror {
	readonly canvas: HTMLCanvasElement;
	readonly context: GraphicsRepresentationContext;
	/** First frame copied (readiness), and for a static mirror, its last. */
	copied(): void;
}

interface Lease extends GraphicsRetainedRenderer {
	frame(time: number): void;
}

type Phase = 'owned' | 'retained' | 'released';

class RenderSurface {
	phase: Phase = 'owned';
	private authority: RenderAuthority | undefined;
	private handOff: BusinessHandOff | undefined;
	private continuation: (() => void) | undefined;
	private ownerGone = false;
	private representations = 0;
	private leases = 0;
	private readonly mirrors = new Set<Mirror>();
	private unhookFrame: (() => void) | undefined;
	private unhookLoss: (() => void) | undefined;
	private lost = false;
	private lastFrameTime = Number.NaN;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		authority: RenderAuthority,
		handOff: BusinessHandOff
	) {
		this.authority = authority;
		this.handOff = handOff;
		ledger.surfaces++;
	}

	represent(context: GraphicsRepresentationContext): GraphicsRepresentation | { declined: string } {
		if (this.phase === 'released' || !this.authority) return { declined: 'graphicsRendererReleased' };

		const node = context.document.createElement('canvas');
		node.setAttribute('aria-hidden', 'true');
		node.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';

		// Reduced motion: one faithful frame, no retained rendering.
		const isStatic = context.reducedMotion;
		let resolveReady: () => void = () => {};
		const ready = new Promise<void>((resolve) => (resolveReady = resolve));

		const mirror: Mirror = {
			canvas: node,
			context,
			copied: () => {
				resolveReady();
				if (isStatic) this.detachMirror(mirror);
			}
		};
		// Immediate copy: valid when the drawing buffer is preserved (Scene).
		// Otherwise the next rendered frame fills it, and `ready` waits for that.
		this.copy(node);
		this.attachMirror(mirror);
		this.representations++;
		ledger.representations++;

		// The one terminal path of this representation. Core disposes either the
		// representation or its retained renderer, and aborts the signal; any of
		// the three finishes it — mirror, readiness, lease and accounting — once,
		// leaving other representations' leases running.
		let finished = false;
		let leased = false;
		let lease: Lease | undefined;
		const finish = () => {
			if (finished) return;
			finished = true;
			this.representations--;
			ledger.representations--;
			this.detachMirror(mirror);
			resolveReady();
			if (leased) {
				leased = false;
				this.leases--;
			}
			this.settle();
		};
		context.signal.addEventListener('abort', finish, { once: true });

		if (isStatic) return { node, continuity: 'static', ready, dispose: finish };
		return {
			node,
			continuity: 'retained',
			ready,
			retire: () => {
				if (finished) return undefined;
				// Repeated retirement of one representation keeps one lease.
				if (!lease && this.grant(context)) {
					leased = true;
					lease = {
						frame: (time) => {
							if (!finished) this.render(time, context);
						},
						dispose: finish
					};
				}
				return lease;
			},
			dispose: finish
		};
	}

	ownerRetired(): void {
		this.ownerGone = true;
		this.endBusiness();
		this.settle();
	}

	componentRelease(): void {
		this.handOff = undefined;
		if (this.phase === 'owned') this.release();
	}

	/** Run the hand-off once; keep only its (data-only) continuation. */
	private endBusiness(): void {
		const handOff = this.handOff;
		this.handOff = undefined;
		if (handOff) this.continuation = handOff() ?? undefined;
	}

	/** Grant one lease on render authority, transferring it on the first. */
	private grant(context: GraphicsRepresentationContext): boolean {
		const authority = this.authority;
		if (this.phase === 'released' || !authority) {
			context.diagnose('graphicsRendererReleased');
			return false;
		}
		if (authority.isContextLost()) {
			// Nothing to draw with: the last copied frame stays, and the component
			// keeps ownership (its teardown releases the renderer).
			context.diagnose('contextLost');
			return false;
		}
		if (this.phase === 'owned') this.transfer(authority);
		this.leases++;
		return true;
	}

	/** Move render authority from the component to the visual run. */
	private transfer(authority: RenderAuthority): void {
		this.phase = 'retained';
		ledger.retained++;
		this.endBusiness();
		authority.detachFromPage();
		this.unhookLoss = authority.onContextLost(() => {
			if (this.lost) return;
			this.lost = true;
			// Drawing stops; every mirror keeps its last frame.
			for (const mirror of this.mirrors) mirror.context.diagnose('contextLost');
		});
	}

	private render(time: number, context: GraphicsRepresentationContext): void {
		const authority = this.authority;
		if (this.phase !== 'retained' || this.lost || !authority) return;
		// One draw per Host frame, however many leases (adopting runs) call it.
		if (time === this.lastFrameTime) return;
		this.lastFrameTime = time;
		try {
			this.continuation?.();
			authority.renderFrame(time);
		} catch (error) {
			this.lost = true;
			context.diagnose(`graphicsRenderFailed:${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private settle(): void {
		if (this.phase === 'retained' && this.leases === 0) this.release();
		else if (this.phase === 'owned' && this.ownerGone && this.representations === 0) this.release();
	}

	private release(): void {
		if (this.phase === 'released') return;
		if (this.phase === 'retained') ledger.retained--;
		this.phase = 'released';
		ledger.surfaces--;
		this.unhookFrame?.();
		this.unhookFrame = undefined;
		this.unhookLoss?.();
		this.unhookLoss = undefined;
		for (const mirror of this.mirrors) this.detachMirror(mirror);
		if (surfaces.get(this.canvas) === this) surfaces.delete(this.canvas);
		const authority = this.authority;
		this.authority = undefined;
		this.handOff = undefined;
		this.continuation = undefined;
		authority?.dispose();
	}

	private attachMirror(mirror: Mirror): void {
		if (this.mirrors.has(mirror) || !this.authority) return;
		this.mirrors.add(mirror);
		ledger.mirrors++;
		this.unhookFrame ??= this.authority.onFrame(() => this.copyAll());
	}

	private detachMirror(mirror: Mirror): void {
		if (!this.mirrors.delete(mirror)) return;
		ledger.mirrors--;
		if (this.mirrors.size === 0) {
			this.unhookFrame?.();
			this.unhookFrame = undefined;
		}
	}

	private copyAll(): void {
		for (const mirror of [...this.mirrors]) {
			if (this.copy(mirror.canvas)) mirror.copied();
		}
	}

	/** Copy the renderer's current drawing buffer into a mirror. */
	private copy(target: HTMLCanvasElement): boolean {
		const { width, height } = this.canvas;
		if (width === 0 || height === 0) return false;
		try {
			if (target.width !== width) target.width = width;
			if (target.height !== height) target.height = height;
			const context = target.getContext('2d');
			if (!context) return false;
			context.clearRect(0, 0, width, height);
			context.drawImage(this.canvas, 0, 0);
			return true;
		} catch {
			// An unreadable frame keeps the previous one.
			return false;
		}
	}
}
