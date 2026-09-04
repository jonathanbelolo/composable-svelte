/**
 * Render Loop
 *
 * Manages animation frame loop with tab visibility detection and frame rate limiting.
 *
 * Performance considerations:
 * - Don't render when tab is hidden (saves battery and CPU)
 * - Limit frame rate on mobile devices (30 FPS vs 60 FPS)
 * - Provide delta time for smooth animations
 */

import { noDebug, type DebugLog } from './debug.js';

export type RenderCallback = (deltaTime: number) => void;

export class RenderLoop {
	private running = false;
	private rafId: number | null = null;
	private lastFrameTime = 0;
	private targetFPS = 60;
	private frameInterval: number;
	private tabVisible = true;
	private callback: RenderCallback | null = null;
	private frameCount = 0;
	private fpsStartTime = 0;
	private currentFPS = 0;
	private onVisibilityChange: (() => void) | null = null;

	constructor(targetFPS = 60, private log: DebugLog = noDebug) {
		this.targetFPS = targetFPS;
		this.frameInterval = 1000 / targetFPS;
		this.setupVisibilityListener();
	}

	/**
	 * Setup tab visibility change listener
	 *
	 * Pauses rendering when tab is hidden to save battery/CPU.
	 * Resumes when tab becomes visible again.
	 */
	private setupVisibilityListener(): void {
		// Retained so `destroy` can remove it. This was an anonymous arrow
		// passed straight to `addEventListener`, which made it unremovable —
		// and the class had no `destroy` at all, so every overlay that was ever
		// mounted left a handler on `document` holding its `RenderLoop` alive
		// for the life of the page.
		this.onVisibilityChange = () => {
			this.tabVisible = !document.hidden;

			if (this.tabVisible && this.running) {
				this.log('[WebGLOverlay] Tab visible - resuming rendering');
				this.lastFrameTime = performance.now();
				this.fpsStartTime = performance.now();
				this.frameCount = 0;
			} else if (!this.tabVisible) {
				this.log('[WebGLOverlay] Tab hidden - pausing rendering');
			}
		};

		document.addEventListener('visibilitychange', this.onVisibilityChange);
	}

	/**
	 * Stop the loop and release the visibility listener.
	 *
	 * Separate from `stop()`, which only cancels the pending frame: the listener
	 * has to go too, or a mounted-and-unmounted overlay leaves one behind every
	 * time.
	 */
	destroy(): void {
		this.stop();

		if (this.onVisibilityChange) {
			document.removeEventListener('visibilitychange', this.onVisibilityChange);
			this.onVisibilityChange = null;
		}
	}

	/**
	 * Start render loop
	 *
	 * @param callback - Function to call each frame with delta time
	 */
	start(callback: RenderCallback): void {
		if (this.running) {
			console.warn('[WebGLOverlay] Render loop already running');
			return;
		}

		this.running = true;
		this.callback = callback;
		this.lastFrameTime = performance.now();
		this.fpsStartTime = performance.now();
		this.frameCount = 0;

		const loop = (currentTime: number) => {
			if (!this.running) return;

			// Skip rendering if tab is hidden
			if (!this.tabVisible) {
				this.rafId = requestAnimationFrame(loop);
				return;
			}

			const deltaTime = currentTime - this.lastFrameTime;

			// Frame rate limiting
			if (deltaTime >= this.frameInterval) {
				// Call render callback with delta time
				if (this.callback) {
					this.callback(deltaTime);
				}

				// Update FPS counter
				this.updateFPS(currentTime);

				// Update last frame time (with compensation for frame interval)
				this.lastFrameTime = currentTime - (deltaTime % this.frameInterval);
			}

			this.rafId = requestAnimationFrame(loop);
		};

		this.rafId = requestAnimationFrame(loop);
	}

	/**
	 * Stop render loop
	 */
	stop(): void {
		this.running = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.callback = null;
	}

	/**
	 * Check if render loop is running
	 *
	 * @returns true if running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Update FPS counter
	 *
	 * Calculates actual FPS over 1-second intervals.
	 *
	 * @param currentTime - Current timestamp
	 */
	/**
	 * The lowest frame rate already reported, so a sustained slump is one line
	 * rather than one a second. Reset when the rate recovers.
	 */
	private worstReportedFPS = Number.POSITIVE_INFINITY;

	private updateFPS(currentTime: number): void {
		this.frameCount++;

		const elapsed = currentTime - this.fpsStartTime;
		if (elapsed >= 1000) {
			// Calculate FPS over last second
			this.currentFPS = Math.round((this.frameCount * 1000) / elapsed);
			this.frameCount = 0;
			this.fpsStartTime = currentTime;

			// Warn when the frame rate is *worse* than anything already reported,
			// not once a second for as long as it stays bad.
			//
			// The same rule the memory-pressure warning follows: a message about a
			// standing condition is worth saying when the condition worsens, and
			// worth saying once otherwise. A caller *action* that is wrong — an
			// `updateElement` on a static element — is reported every time,
			// because each call is a separate mistake; this is not that.
			//
			// The mark clears once the frame rate recovers, so a later slump is
			// announced rather than swallowed by a reading from minutes ago.
			const struggling = this.currentFPS < this.targetFPS * 0.7;
			if (struggling && this.currentFPS < this.worstReportedFPS) {
				this.worstReportedFPS = this.currentFPS;
				console.warn(
					`[WebGLOverlay] Low FPS: ${this.currentFPS}/${this.targetFPS}. Consider reducing overlay complexity or texture count.`
				);
			} else if (!struggling) {
				this.worstReportedFPS = Number.POSITIVE_INFINITY;
			}
		}
	}

	/**
	 * Get current FPS
	 *
	 * Returns actual measured FPS, not target FPS.
	 *
	 * @returns Current frames per second
	 */
	getCurrentFPS(): number {
		return this.currentFPS;
	}
}
