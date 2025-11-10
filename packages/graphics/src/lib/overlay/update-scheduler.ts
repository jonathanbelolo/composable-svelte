/**
 * Update Scheduler
 *
 * Phase 1.3: UpdateScheduler system
 *
 * Manages texture update strategies:
 * - static: Never update (images)
 * - frame: Every animation frame (videos)
 * - manual: Explicit updateElement() calls
 * - reactive: Svelte $effect triggers
 */

import type { ElementRegistration, UpdateStrategy } from './overlay-types.js';

export type UpdateCallback = (elementId: string) => void;

export class UpdateScheduler {
	private elements = new Map<string, ElementRegistration>();
	private updateCallback: UpdateCallback | null = null;
	private frameUpdateElements = new Set<string>();
	private rafId: number | null = null;
	private isRunning = false;

	/**
	 * Set the callback to trigger when an element needs updating
	 *
	 * @param callback - Function to call with element ID
	 */
	setUpdateCallback(callback: UpdateCallback): void {
		this.updateCallback = callback;
	}

	/**
	 * Register an element with its update strategy
	 *
	 * @param registration - Element registration
	 */
	registerElement(registration: ElementRegistration): void {
		this.elements.set(registration.id, registration);

		// Add to frame update set if using frame strategy
		if (registration.updateStrategy === 'frame') {
			this.frameUpdateElements.add(registration.id);

			// Start frame loop if not already running
			if (!this.isRunning) {
				this.start();
			}

			// Set up video-specific handling
			if (registration.type === 'video') {
				this.setupVideoUpdates(registration);
			}
		}
	}

	/**
	 * Unregister an element
	 *
	 * @param id - Element identifier
	 */
	unregisterElement(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) return;

		// Clean up video frame callback if present
		if (registration.animationFrameId) {
			if ('cancelVideoFrameCallback' in registration.element) {
				(registration.element as any).cancelVideoFrameCallback(registration.animationFrameId);
			}
		}

		// Remove from frame updates
		this.frameUpdateElements.delete(id);

		// Remove from map
		this.elements.delete(id);

		// Stop frame loop if no more frame updates
		if (this.frameUpdateElements.size === 0 && this.isRunning) {
			this.stop();
		}
	}

	/**
	 * Trigger manual update for an element
	 *
	 * Used for 'manual' update strategy.
	 *
	 * @param id - Element identifier
	 */
	triggerUpdate(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[UpdateScheduler] Element ${id} not found`);
			return;
		}

		if (registration.updateStrategy !== 'manual') {
			console.warn(
				`[UpdateScheduler] Element ${id} has strategy '${registration.updateStrategy}', not 'manual'`
			);
			return;
		}

		this.notifyUpdate(id);
	}

	/**
	 * Trigger reactive update for an element
	 *
	 * Called by Svelte's $effect when dependencies change.
	 *
	 * @param id - Element identifier
	 */
	triggerReactiveUpdate(id: string): void {
		const registration = this.elements.get(id);
		if (!registration) return;

		if (registration.updateStrategy !== 'reactive') {
			console.warn(
				`[UpdateScheduler] Element ${id} has strategy '${registration.updateStrategy}', not 'reactive'`
			);
			return;
		}

		this.notifyUpdate(id);
	}

	/**
	 * Start frame update loop
	 */
	start(): void {
		if (this.isRunning) return;

		this.isRunning = true;
		this.scheduleFrameUpdate();
	}

	/**
	 * Stop frame update loop
	 */
	stop(): void {
		if (!this.isRunning) return;

		this.isRunning = false;

		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	/**
	 * Check if scheduler is running
	 *
	 * @returns true if running
	 */
	running(): boolean {
		return this.isRunning;
	}

	/**
	 * Get all registered elements
	 *
	 * @returns Array of element registrations
	 */
	getElements(): ElementRegistration[] {
		return Array.from(this.elements.values());
	}

	/**
	 * Get a specific element registration
	 *
	 * @param id - Element identifier
	 * @returns Element registration or undefined
	 */
	getElement(id: string): ElementRegistration | undefined {
		return this.elements.get(id);
	}

	/**
	 * Schedule next frame update
	 */
	private scheduleFrameUpdate(): void {
		if (!this.isRunning) return;

		this.rafId = requestAnimationFrame((timestamp) => {
			this.processFrameUpdates(timestamp);
			this.scheduleFrameUpdate();
		});
	}

	/**
	 * Process all frame-strategy elements
	 *
	 * @param timestamp - Current timestamp
	 */
	private processFrameUpdates(timestamp: number): void {
		for (const id of this.frameUpdateElements) {
			const registration = this.elements.get(id);
			if (!registration) continue;

			// Check if element needs update (rate limiting)
			if (this.shouldUpdateElement(registration, timestamp)) {
				registration.lastUpdate = timestamp;
				this.notifyUpdate(id);
			}
		}
	}

	/**
	 * Check if element should be updated
	 *
	 * Implements rate limiting to avoid unnecessary updates.
	 *
	 * @param registration - Element registration
	 * @param timestamp - Current timestamp
	 * @returns true if should update
	 */
	private shouldUpdateElement(registration: ElementRegistration, timestamp: number): boolean {
		// Always update if no last update
		if (!registration.lastUpdate) return true;

		// For videos, check if new frame is available
		if (registration.type === 'video') {
			const video = registration.element as HTMLVideoElement;

			// Don't update if video is paused or ended
			if (video.paused || video.ended) return false;

			// Update at video frame rate (use requestVideoFrameCallback if available)
			// Otherwise update every frame (60 FPS max)
			return true;
		}

		// For other elements, update every frame
		return true;
	}

	/**
	 * Set up video-specific updates using requestVideoFrameCallback
	 *
	 * This is more efficient than requestAnimationFrame for videos.
	 *
	 * @param registration - Element registration
	 */
	private setupVideoUpdates(registration: ElementRegistration): void {
		const video = registration.element as HTMLVideoElement;

		// Check if requestVideoFrameCallback is supported
		if (!('requestVideoFrameCallback' in video)) {
			// Fall back to frame-based updates
			return;
		}

		const scheduleVideoUpdate = () => {
			if (!this.elements.has(registration.id)) {
				// Element was unregistered
				return;
			}

			// Request next video frame
			registration.animationFrameId = (video as any).requestVideoFrameCallback(
				(now: number, metadata: any) => {
					// Notify update
					this.notifyUpdate(registration.id);

					// Schedule next frame
					scheduleVideoUpdate();
				}
			);
		};

		// Start video frame updates
		if (!video.paused) {
			scheduleVideoUpdate();
		}

		// Handle play/pause events
		const handlePlay = () => scheduleVideoUpdate();
		const handlePause = () => {
			if (registration.animationFrameId) {
				(video as any).cancelVideoFrameCallback(registration.animationFrameId);
				registration.animationFrameId = undefined;
			}
		};

		video.addEventListener('play', handlePlay);
		video.addEventListener('pause', handlePause);

		// Clean up listeners when element is unregistered
		const originalUnregister = this.unregisterElement.bind(this);
		this.unregisterElement = (id: string) => {
			if (id === registration.id) {
				video.removeEventListener('play', handlePlay);
				video.removeEventListener('pause', handlePause);
			}
			originalUnregister(id);
		};
	}

	/**
	 * Notify that an element needs updating
	 *
	 * @param id - Element identifier
	 */
	private notifyUpdate(id: string): void {
		if (this.updateCallback) {
			this.updateCallback(id);
		}
	}

	/**
	 * Change update strategy for an element
	 *
	 * @param id - Element identifier
	 * @param strategy - New update strategy
	 */
	changeStrategy(id: string, strategy: UpdateStrategy): void {
		const registration = this.elements.get(id);
		if (!registration) {
			console.warn(`[UpdateScheduler] Element ${id} not found`);
			return;
		}

		const oldStrategy = registration.updateStrategy;
		if (oldStrategy === strategy) return;

		// Remove from frame updates if was 'frame'
		if (oldStrategy === 'frame') {
			this.frameUpdateElements.delete(id);

			// Clean up video frame callback
			if (registration.animationFrameId) {
				const video = registration.element as HTMLVideoElement;
				if ('cancelVideoFrameCallback' in video) {
					(video as any).cancelVideoFrameCallback(registration.animationFrameId);
					registration.animationFrameId = undefined;
				}
			}
		}

		// Update strategy
		registration.updateStrategy = strategy;

		// Add to frame updates if new strategy is 'frame'
		if (strategy === 'frame') {
			this.frameUpdateElements.add(id);

			// Start frame loop if not running
			if (!this.isRunning) {
				this.start();
			}

			// Set up video updates if needed
			if (registration.type === 'video') {
				this.setupVideoUpdates(registration);
			}
		}

		// Stop frame loop if no more frame updates
		if (this.frameUpdateElements.size === 0 && this.isRunning) {
			this.stop();
		}
	}

	/**
	 * Get elements by update strategy
	 *
	 * @param strategy - Update strategy
	 * @returns Array of element IDs
	 */
	getElementsByStrategy(strategy: UpdateStrategy): string[] {
		const result: string[] = [];

		for (const [id, registration] of this.elements) {
			if (registration.updateStrategy === strategy) {
				result.push(id);
			}
		}

		return result;
	}

	/**
	 * Get update statistics
	 *
	 * @returns Statistics object
	 */
	getStatistics() {
		const strategies: Record<UpdateStrategy, number> = {
			static: 0,
			frame: 0,
			manual: 0,
			reactive: 0
		};

		for (const registration of this.elements.values()) {
			strategies[registration.updateStrategy]++;
		}

		return {
			totalElements: this.elements.size,
			frameUpdateElements: this.frameUpdateElements.size,
			isRunning: this.isRunning,
			strategies
		};
	}

	/**
	 * Destroy scheduler and clean up
	 */
	destroy(): void {
		this.stop();

		// Clean up all video frame callbacks
		for (const registration of this.elements.values()) {
			if (registration.animationFrameId && registration.type === 'video') {
				const video = registration.element as HTMLVideoElement;
				if ('cancelVideoFrameCallback' in video) {
					(video as any).cancelVideoFrameCallback(registration.animationFrameId);
				}
			}
		}

		this.elements.clear();
		this.frameUpdateElements.clear();
		this.updateCallback = null;
	}
}
