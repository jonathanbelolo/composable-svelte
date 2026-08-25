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

import { debugLog } from './debug.js';

export class WebGLContextManager {
	private canvas: HTMLCanvasElement | null = null;
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
	private contextLostHandler: ((e: Event) => void) | null = null;
	private contextRestoredHandler: (() => void) | null = null;

	initialize(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
		this.canvas = canvas;

		// Retained so `destroy` can remove them. These were anonymous arrows
		// passed straight to `addEventListener`, and the class had no `destroy`
		// of any kind, so the handlers — and the manager they close over —
		// outlived every overlay that ever initialised one.
		this.contextLostHandler = (e: Event) => {
			e.preventDefault(); // Prevent default to allow restoration
			this.contextLost = true;
			console.warn('[WebGLOverlay] Context lost - will attempt to restore');
			this.notifyContextLost();
		};

		this.contextRestoredHandler = () => {
			debugLog('[WebGLOverlay] Context restored - recreating resources');
			this.contextLost = false;
			this.gl = this.createContext();
			this.notifyContextRestored();
		};

		canvas.addEventListener('webglcontextlost', this.contextLostHandler);
		canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);

		this.gl = this.createContext();
		return this.gl;
	}

	/**
	 * Create WebGL rendering context with optimal settings
	 *
	 * @returns WebGL context or null if not supported
	 */
	private createContext(): WebGLRenderingContext | null {
		if (!this.canvas) {
			console.error('[WebGLOverlay] Canvas not initialized');
			return null;
		}

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

	/**
	 * Release the canvas listeners and drop every registered callback.
	 *
	 * The callback arrays were never cleared either, so a manager kept alive by
	 * its own listeners also kept every consumer callback reachable.
	 */
	destroy(): void {
		if (this.canvas) {
			if (this.contextLostHandler) {
				this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
			}
			if (this.contextRestoredHandler) {
				this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
			}
		}

		this.contextLostHandler = null;
		this.contextRestoredHandler = null;
		this.onContextLostCallbacks.length = 0;
		this.onContextRestoredCallbacks.length = 0;
		this.canvas = null;
		this.gl = null;
	}
}
