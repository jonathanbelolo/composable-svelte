/**
 * Position Tracker
 *
 * Tracks DOM element positions using IntersectionObserver and ResizeObserver.
 * Automatically updates element bounds when they move, resize, or scroll.
 */

import type { ElementBounds } from './overlay-types';

/**
 * Position update callback
 */
export type PositionUpdateCallback = (elementId: string, bounds: ElementBounds) => void;

/**
 * Position Tracker
 *
 * Uses IntersectionObserver to efficiently track element positions.
 */
export class PositionTracker {
	private elements: Map<string, HTMLElement> = new Map();
	private observer: IntersectionObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private updateCallback: PositionUpdateCallback | null = null;
	private root: HTMLElement | null;
	private scrollListener: (() => void) | null = null;
	private rafId: number | null = null;

	/**
	 * Create position tracker
	 *
	 * @param root - Root element for intersection observation (null = viewport)
	 */
	constructor(root: HTMLElement | null = null) {
		this.root = root;
		this.initializeObservers();
		this.initializeScrollTracking();
	}

	/**
	 * Initialize IntersectionObserver and ResizeObserver
	 */
	private initializeObservers(): void {
		// IntersectionObserver tracks when elements enter/exit viewport and position changes
		this.observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const element = entry.target as HTMLElement;
					const elementId = this.getElementId(element);

					if (elementId && this.updateCallback) {
						// Get current bounds
						const rect = element.getBoundingClientRect();
						const bounds: ElementBounds = {
							x: rect.left,
							y: rect.top,
							width: rect.width,
							height: rect.height
						};

						this.updateCallback(elementId, bounds);
					}
				}
			},
			{
				root: this.root,
				threshold: [0, 0.1, 0.5, 0.9, 1.0] // Track at multiple intersection points
			}
		);

		// ResizeObserver tracks element size changes
		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const element = entry.target as HTMLElement;
				const elementId = this.getElementId(element);

				if (elementId && this.updateCallback) {
					const rect = element.getBoundingClientRect();
					const bounds: ElementBounds = {
						x: rect.left,
						y: rect.top,
						width: rect.width,
						height: rect.height
					};

					this.updateCallback(elementId, bounds);
				}
			}
		});
	}

	/**
	 * Initialize scroll tracking for continuous position updates
	 */
	private initializeScrollTracking(): void {
		// Use requestAnimationFrame to throttle scroll updates
		this.scrollListener = () => {
			if (this.rafId !== null) return; // Already scheduled

			this.rafId = requestAnimationFrame(() => {
				this.rafId = null;
				this.updateAllPositions();
			});
		};

		// Listen to scroll events on window (for viewport scrolling)
		window.addEventListener('scroll', this.scrollListener, { passive: true });

		// If we have a custom root, also listen to its scroll events
		if (this.root) {
			this.root.addEventListener('scroll', this.scrollListener, { passive: true });
		}
	}

	/**
	 * Get element ID from element
	 */
	private getElementId(element: HTMLElement): string | null {
		for (const [id, el] of this.elements.entries()) {
			if (el === element) {
				return id;
			}
		}
		return null;
	}

	/**
	 * Track an element
	 *
	 * @param id - Element ID
	 * @param element - HTML element to track
	 */
	track(id: string, element: HTMLElement): void {
		if (this.elements.has(id)) {
			console.warn(`[PositionTracker] Element '${id}' already tracked`);
			return;
		}

		this.elements.set(id, element);

		// Start observing
		if (this.observer) {
			this.observer.observe(element);
		}
		if (this.resizeObserver) {
			this.resizeObserver.observe(element);
		}

		// Immediately get initial bounds
		if (this.updateCallback) {
			const rect = element.getBoundingClientRect();
			const bounds: ElementBounds = {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height
			};

			this.updateCallback(id, bounds);
		}
	}

	/**
	 * Stop tracking an element
	 *
	 * @param id - Element ID
	 */
	untrack(id: string): void {
		const element = this.elements.get(id);
		if (!element) return;

		// Stop observing
		if (this.observer) {
			this.observer.unobserve(element);
		}
		if (this.resizeObserver) {
			this.resizeObserver.unobserve(element);
		}

		this.elements.delete(id);
	}

	/**
	 * Set position update callback
	 *
	 * Called whenever an element's position changes.
	 *
	 * @param callback - Update callback
	 */
	onPositionUpdate(callback: PositionUpdateCallback): void {
		this.updateCallback = callback;
	}

	/**
	 * Manually trigger position update for an element
	 *
	 * Useful when you know an element moved but observers haven't fired yet.
	 *
	 * @param id - Element ID
	 */
	updateElementPosition(id: string): void {
		const element = this.elements.get(id);
		if (!element || !this.updateCallback) return;

		const rect = element.getBoundingClientRect();
		const bounds: ElementBounds = {
			x: rect.left,
			y: rect.top,
			width: rect.width,
			height: rect.height
		};

		this.updateCallback(id, bounds);
	}

	/**
	 * Update all tracked element positions
	 *
	 * Useful after major layout changes.
	 */
	updateAllPositions(): void {
		for (const id of this.elements.keys()) {
			this.updateElementPosition(id);
		}
	}

	/**
	 * Destroy tracker and clean up observers
	 */
	destroy(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		// Clean up scroll listener
		if (this.scrollListener) {
			window.removeEventListener('scroll', this.scrollListener);
			if (this.root) {
				this.root.removeEventListener('scroll', this.scrollListener);
			}
			this.scrollListener = null;
		}

		// Cancel any pending RAF callback
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		this.elements.clear();
		this.updateCallback = null;
	}
}
