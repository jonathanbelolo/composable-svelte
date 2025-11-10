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

	constructor(targetFPS = 60) {
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
		document.addEventListener('visibilitychange', () => {
			this.tabVisible = !document.hidden;

			if (this.tabVisible && this.running) {
				console.info('[WebGLOverlay] Tab visible - resuming rendering');
				this.lastFrameTime = performance.now();
				this.fpsStartTime = performance.now();
				this.frameCount = 0;
			} else if (!this.tabVisible) {
				console.info('[WebGLOverlay] Tab hidden - pausing rendering');
			}
		});
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
	 * Set target FPS
	 *
	 * Use lower FPS on mobile devices to save battery.
	 *
	 * @param fps - Target frames per second
	 */
	setTargetFPS(fps: number): void {
		this.targetFPS = fps;
		this.frameInterval = 1000 / fps;
		console.info(`[WebGLOverlay] Target FPS set to ${fps}`);
	}

	/**
	 * Get target FPS
	 *
	 * @returns Target frames per second
	 */
	getTargetFPS(): number {
		return this.targetFPS;
	}

	/**
	 * Update FPS counter
	 *
	 * Calculates actual FPS over 1-second intervals.
	 *
	 * @param currentTime - Current timestamp
	 */
	private updateFPS(currentTime: number): void {
		this.frameCount++;

		const elapsed = currentTime - this.fpsStartTime;
		if (elapsed >= 1000) {
			// Calculate FPS over last second
			this.currentFPS = Math.round((this.frameCount * 1000) / elapsed);
			this.frameCount = 0;
			this.fpsStartTime = currentTime;

			// Warn if FPS is significantly below target
			if (this.currentFPS < this.targetFPS * 0.7) {
				console.warn(
					`[WebGLOverlay] Low FPS: ${this.currentFPS}/${this.targetFPS}. Consider reducing overlay complexity or texture count.`
				);
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

	/**
	 * Check if tab is visible
	 *
	 * @returns true if tab is visible
	 */
	isTabVisible(): boolean {
		return this.tabVisible;
	}

	/**
	 * Get frame interval in milliseconds
	 *
	 * @returns Milliseconds between frames
	 */
	getFrameInterval(): number {
		return this.frameInterval;
	}
}
