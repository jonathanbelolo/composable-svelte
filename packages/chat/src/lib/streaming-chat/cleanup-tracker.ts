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

		// Tracked in the Set and nowhere else. This used to also push a closure
		// into `cleanups[]`, which nothing ever removed — not `clearTimeout`, not
		// the timer firing — so `resourceCount` grew by one per call for the life
		// of the tracker. `useTypingEmitter` starts one of these per keystroke.
		//
		// The closure was redundant as well as unbounded: `dispose()` clears this
		// Set directly *before* running `cleanups`, so by the time each closure ran
		// its own `has()` check was already false and it did nothing.
		this.timers.add(timer);

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
		// Same redundancy as `setTimeout` above; `dispose()` clears this Set itself.
		this.intervals.add(timer);

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
	 * Clear a specific timeout.
	 */
	clearTimeout(timer: ReturnType<typeof setTimeout>): void {
		if (this.timers.has(timer)) {
			clearTimeout(timer);
			this.timers.delete(timer);
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
