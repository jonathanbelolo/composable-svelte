/**
 * WebGL Context Manager
 *
 * Handles WebGL context initialization, loss, and recovery.
 *
 * WebGL contexts can be lost due to:
 * - GPU crashes or driver issues
 * - Tab backgrounding (browser power management)
 * - Memory pressure
 * - User navigating away and back
 *
 * Without proper handling, the overlay becomes permanently broken after context loss.
 */

export class WebGLContextManager {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext | null = null;
	private contextLost = false;
	private onContextLostCallbacks: (() => void)[] = [];
	private onContextRestoredCallbacks: (() => void)[] = [];

	/**
	 * Initialize WebGL context with loss/restore event handlers
	 *
	 * @param canvas - Canvas element to create context from
	 * @returns WebGL context or null if not supported
	 */
	initialize(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
		this.canvas = canvas;

		// Setup context loss handler
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault(); // Prevent default to allow restoration
			this.contextLost = true;
			console.warn('[WebGLOverlay] Context lost - will attempt to restore');
			this.notifyContextLost();
		});

		// Setup context restore handler
		canvas.addEventListener('webglcontextrestored', () => {
			console.info('[WebGLOverlay] Context restored - recreating resources');
			this.contextLost = false;
			this.gl = this.createContext();
			this.notifyContextRestored();
		});

		this.gl = this.createContext();
		return this.gl;
	}

	/**
	 * Create WebGL rendering context with optimal settings
	 *
	 * @returns WebGL context or null if not supported
	 */
	private createContext(): WebGLRenderingContext | null {
		const gl = this.canvas.getContext('webgl', {
			alpha: true, // Allow transparency
			antialias: true, // Smooth edges
			depth: false, // Don't need depth buffer for 2D overlay
			stencil: false, // Don't need stencil buffer
			preserveDrawingBuffer: false // Better performance
		});

		if (!gl) {
			console.error('[WebGLOverlay] WebGL not supported');
			return null;
		}

		return gl;
	}

	/**
	 * Register callback for context loss events
	 *
	 * Use this to clean up resources when context is lost
	 *
	 * @param callback - Function to call when context is lost
	 */
	onContextLost(callback: () => void): void {
		this.onContextLostCallbacks.push(callback);
	}

	/**
	 * Register callback for context restore events
	 *
	 * Use this to recreate resources when context is restored
	 *
	 * @param callback - Function to call when context is restored
	 */
	onContextRestored(callback: () => void): void {
		this.onContextRestoredCallbacks.push(callback);
	}

	/**
	 * Notify all listeners that context was lost
	 */
	private notifyContextLost(): void {
		this.onContextLostCallbacks.forEach((cb) => cb());
	}

	/**
	 * Notify all listeners that context was restored
	 */
	private notifyContextRestored(): void {
		this.onContextRestoredCallbacks.forEach((cb) => cb());
	}

	/**
	 * Check if context is currently lost
	 *
	 * @returns true if context is lost
	 */
	isContextLost(): boolean {
		return this.contextLost;
	}

	/**
	 * Get current WebGL context
	 *
	 * @returns WebGL context or null if lost or not initialized
	 */
	getContext(): WebGLRenderingContext | null {
		return this.contextLost ? null : this.gl;
	}

	/**
	 * Manually trigger context loss (for testing)
	 *
	 * Requires WEBGL_lose_context extension
	 */
	simulateContextLoss(): void {
		const loseContext = this.gl?.getExtension('WEBGL_lose_context');
		if (loseContext) {
			loseContext.loseContext();
		} else {
			console.warn('[WebGLOverlay] WEBGL_lose_context extension not available');
		}
	}

	/**
	 * Manually trigger context restore (for testing)
	 *
	 * Requires WEBGL_lose_context extension
	 */
	simulateContextRestore(): void {
		const loseContext = this.gl?.getExtension('WEBGL_lose_context');
		if (loseContext) {
			loseContext.restoreContext();
		} else {
			console.warn('[WebGLOverlay] WEBGL_lose_context extension not available');
		}
	}
}
