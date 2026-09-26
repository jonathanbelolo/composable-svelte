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

interface TrackedListener {
 target: EventTarget;
 type: string;
 listener: EventListenerOrEventListenerObject;
 capture: boolean;
 release: CleanupFunction;
}

/**
 * CleanupTracker manages resource cleanup.
 */
export class CleanupTracker {
	private cleanups: CleanupFunction[] = [];
	private timers: Set<ReturnType<typeof setTimeout>> = new Set();
	private intervals: Set<ReturnType<typeof setInterval>> = new Set();
	private isDisposed = false;
	private listeners = new Set<TrackedListener>();

	/**
	 * Add a cleanup function to be called on dispose.
	 */
	add(cleanup: CleanupFunction): void {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Adding cleanup after dispose');
			try {
				cleanup(); // Call immediately
			} catch (error) {
				console.error('[CleanupTracker] Error during post-dispose cleanup:', error);
			}
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
			const timer = setTimeout(() => {}, 0);
			clearTimeout(timer);
			return timer;
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
			const timer = setInterval(() => {}, interval);
			clearInterval(timer);
			return timer;
		}

		const timer = setInterval(callback, interval);
		// Same redundancy as `setTimeout` above; `dispose()` clears this Set itself.
		this.intervals.add(timer);

		return timer;
	}

	/**
	 * Add a tracked listener. The returned disposer removes it early; once and
	 * aborted listeners automatically leave the tracker. Duplicate registrations
	 * follow native identity rules (target, type, callback and capture).
	 * Remove tracked listeners through this disposer or dispose(), not by passing
	 * the original callback to the target's native removeEventListener.
	 */
	addEventListener<K extends keyof WindowEventMap>(
		target: Window,
		type: K,
		listener: (ev: WindowEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): CleanupFunction;
	addEventListener<K extends keyof DocumentEventMap>(
		target: Document,
		type: K,
		listener: (ev: DocumentEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): CleanupFunction;
	addEventListener<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		listener: (ev: HTMLElementEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): CleanupFunction;
	addEventListener(
		target: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): CleanupFunction;
	addEventListener(
		target: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): CleanupFunction {
		if (this.isDisposed) {
			console.warn('[CleanupTracker] Adding event listener after dispose');
			return () => {};
		}
		const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
		const signal = typeof options === 'object' ? options.signal : undefined;
		if (signal?.aborted) return () => {};
		for (const existing of this.listeners) {
			if (existing.target === target && existing.type === type && existing.listener === listener && existing.capture === capture) return existing.release;
		}
		const once = typeof options === 'object' && options.once === true;
		let active = true;
		const release = (): void => {
			if (!active) return;
			active = false;
			this.listeners.delete(record);
			try { target.removeEventListener(type, wrapped, { capture }); }
			finally { signal?.removeEventListener('abort', release); }
		};
		const wrapped: EventListener = event => {
			if (!active) return;
			if (once) release();
			if (typeof listener === 'function') listener.call(target, event);
			else listener.handleEvent(event);
		};
		const record: TrackedListener = { target, type, listener, capture, release };
		this.listeners.add(record);
		try {
			target.addEventListener(type, wrapped, options);
			signal?.addEventListener('abort', release, { once: true });
			if (signal?.aborted) release();
		} catch (error) {
			release();
			throw error;
		}
		return release;
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

	/** Clear an interval through its owning tracker, updating resource accounting. */
	clearInterval(timer: ReturnType<typeof setInterval>): void {
		if (this.intervals.delete(timer)) clearInterval(timer);
	}

	/**
	 * Check if tracker has been disposed.
	 */
	get disposed(): boolean {
		return this.isDisposed;
	}

	/**
	 * Get number of tracked resources.
	 *
	 * All tracked kinds, including independently retired event listeners. Timers and intervals stopped pushing closures into
	 * `cleanups[]` when that was found to grow by one per keystroke — which fixed
	 * the leak and left this reporting `0` for a tracker holding twenty live
	 * intervals, so a consumer using it to check for leaks got the wrong answer
	 * in the reassuring direction.
	 */
	get resourceCount(): number {
		return this.cleanups.length + this.timers.size + this.intervals.size + this.listeners.size;
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

		// Snapshot because each release unregisters itself before calling native APIs.
		for (const listener of [...this.listeners]) {
			try { listener.release(); }
			catch (error) { console.error('[CleanupTracker] Error during cleanup:', error); }
		}

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
