/**
 * Cleanup Tracker
 *
 * Utility for tracking and cleaning up resources in composable hooks.
 * Prevents memory leaks from timers, intervals, event listeners, etc.
 *
 * @example
 * ```typescript
 * const cleanup = new CleanupTracker();
 *
 * // Track timeout
 * cleanup.setTimeout(() => console.log('Done'), 1000);
 *
 * // Track interval
 * cleanup.setInterval(() => console.log('Tick'), 1000);
 *
 * // Track event listener
 * cleanup.addEventListener(element, 'click', handler);
 *
 * // Track custom cleanup
 * cleanup.add(() => console.log('Cleanup custom resource'));
 *
 * // Clean everything up
 * cleanup.dispose();
 * ```
 */

export type CleanupFunction = () => void;

/**
 * CleanupTracker manages resource cleanup.
 */
export class CleanupTracker {
	private cleanups: CleanupFunction[] = [];
	private timers: Set<ReturnType<typeof setTimeout>> = new Set();
	private intervals: Set<ReturnType<typeof setInterval>> = new Set();
	private isDisposed = false;

	/**
	 * Add a cleanup function to be called on dispose.
	 */
	add(cleanup: CleanupFunction): void {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Adding cleanup after dispose');
			cleanup(); // Call immediately
			return;
		}

		this.cleanups.push(cleanup);
	}

	/**
	 * Set a timeout and track it for cleanup.
	 */
	setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Setting timeout after dispose');
			return setTimeout(() => {}, 0);
		}

		const timer = setTimeout(() => {
			this.timers.delete(timer);
			callback();
		}, delay);

		this.timers.add(timer);

		// Auto-cleanup on execution
		this.add(() => {
			if (this.timers.has(timer)) {
				clearTimeout(timer);
				this.timers.delete(timer);
			}
		});

		return timer;
	}

	/**
	 * Set an interval and track it for cleanup.
	 */
	setInterval(callback: () => void, interval: number): ReturnType<typeof setInterval> {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Setting interval after dispose');
			return setInterval(() => {}, interval);
		}

		const timer = setInterval(callback, interval);
		this.intervals.add(timer);

		this.add(() => {
			if (this.intervals.has(timer)) {
				clearInterval(timer);
				this.intervals.delete(timer);
			}
		});

		return timer;
	}

	/**
	 * Add event listener and track it for cleanup.
	 */
	addEventListener<K extends keyof WindowEventMap>(
		target: Window,
		type: K,
		listener: (ev: WindowEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	addEventListener<K extends keyof DocumentEventMap>(
		target: Document,
		type: K,
		listener: (ev: DocumentEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	addEventListener<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		listener: (ev: HTMLElementEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	addEventListener(
		target: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Adding event listener after dispose');
			return;
		}

		target.addEventListener(type, listener, options);

		this.add(() => {
			target.removeEventListener(type, listener, options);
		});
	}

	/**
	 * Request animation frame and track it for cleanup.
	 */
	requestAnimationFrame(callback: FrameRequestCallback): number {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Requesting animation frame after dispose');
			return 0;
		}

		const handle = requestAnimationFrame((time) => {
			callback(time);
		});

		this.add(() => {
			cancelAnimationFrame(handle);
		});

		return handle;
	}

	/**
	 * Create an AbortController and track it for cleanup.
	 */
	createAbortController(): AbortController {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Creating abort controller after dispose');
			const controller = new AbortController();
			controller.abort();
			return controller;
		}

		const controller = new AbortController();

		this.add(() => {
			if (!controller.signal.aborted) {
				controller.abort();
			}
		});

		return controller;
	}

	/**
	 * Track a Promise and allow cancellation via AbortController.
	 */
	trackPromise<T>(
		factory: (signal: AbortSignal) => Promise<T>,
		onCancel?: () => void
	): Promise<T> {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Tracking promise after dispose');
			return Promise.reject(new Error('CleanupTracker already disposed'));
		}

		const controller = this.createAbortController();

		return new Promise((resolve, reject) => {
			factory(controller.signal)
				.then(resolve)
				.catch((error) => {
					if (controller.signal.aborted) {
						if (onCancel) {
							onCancel();
						}
						reject(new Error('Promise cancelled'));
					} else {
						reject(error);
					}
				});
		});
	}

	/**
	 * Clear a specific timeout.
	 */
	clearTimeout(timer: ReturnType<typeof setTimeout>): void {
		if (this.timers.has(timer)) {
			clearTimeout(timer);
			this.timers.delete(timer);
		}
	}

	/**
	 * Clear a specific interval.
	 */
	clearInterval(timer: ReturnType<typeof setInterval>): void {
		if (this.intervals.has(timer)) {
			clearInterval(timer);
			this.intervals.delete(timer);
		}
	}

	/**
	 * Check if tracker has been disposed.
	 */
	get disposed(): boolean {
		return this.isDisposed;
	}

	/**
	 * Get number of tracked resources.
	 */
	get resourceCount(): number {
		return this.cleanups.length;
	}

	/**
	 * Dispose all tracked resources.
	 */
	dispose(): void {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Already disposed');
			return;
		}

		this.isDisposed = true;

		// Clear all timers
		for (const timer of this.timers) {
			clearTimeout(timer);
		}
		this.timers.clear();

		// Clear all intervals
		for (const interval of this.intervals) {
			clearInterval(interval);
		}
		this.intervals.clear();

		// Run all cleanup functions
		for (const cleanup of this.cleanups) {
			try {
				cleanup();
			} catch (error) {
				console.error('[CleanupTracker] Error during cleanup:', error);
			}
		}
		this.cleanups = [];
	}
}

/**
 * Create a new CleanupTracker instance.
 */
export function createCleanupTracker(): CleanupTracker {
	return new CleanupTracker();
}
