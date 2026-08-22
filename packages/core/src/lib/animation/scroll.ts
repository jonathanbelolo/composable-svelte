/**
 * Smooth scrolling that the caller owns.
 *
 * `scroll-behavior: smooth` is prohibited by `guides/ANIMATION-GUIDELINES.md`
 * for the same reason as a CSS transition: the store cannot see it, sequence on
 * it, or cancel it. This is the replacement the guideline's remedy line names.
 *
 * It is deliberately not another `animate.ts` helper. Those are one-shot
 * `(element, config?) => Promise<void>` functions that always resolve; this is a
 * long-lived loop with a cancel handle, because the thing it follows keeps
 * moving. A streaming chat appends a token at a time, so the bottom of the list
 * is a *moving* target: a one-shot animation per chunk would be interrupted by
 * the next, and an interrupted Motion One `.finished` never settles — a long
 * response would leave one permanently pending promise per token. A single
 * `requestAnimationFrame` loop that re-reads the target each frame retargets for
 * nothing.
 *
 * @packageDocumentation
 */

import { prefersReducedMotion } from './reduced-motion.js';

/** How the follower eases. */
export interface ScrollFollowerConfig {
	/**
	 * Fraction of the remaining distance covered per frame, 0-1. Higher is
	 * snappier. The default lands within a pixel in roughly half a second at
	 * 60fps.
	 */
	readonly stiffness?: number;
	/**
	 * Distance in pixels below which the follower snaps and stops.
	 *
	 * Must be at least 1. Browsers round `scrollTop` to whole pixels, so a
	 * smaller threshold cannot be reached: an eased step below 1px rounds back to
	 * where it started and the loop spins forever a few pixels short.
	 */
	readonly epsilon?: number;
	/**
	 * Skip the animation and jump.
	 *
	 * Defaults to the user's `prefers-reduced-motion` setting, read at the moment
	 * `follow()` is called rather than cached, so a preference changed mid-session
	 * takes effect. Pass it explicitly only to override — a test pinning one
	 * branch, or a caller that already holds the value in a store.
	 *
	 * Skipping the animation must never skip the outcome: the follower still
	 * lands at the bottom, it simply gets there in one step.
	 */
	readonly reducedMotion?: boolean;
}

export interface ScrollFollower {
	/**
	 * Begin (or continue) following the bottom.
	 *
	 * Idempotent: calling it while the loop is already running does nothing,
	 * because the loop reads the target live and will pick up new content by
	 * itself. That is what makes one call per streamed chunk cheap.
	 */
	follow(): void;
	/** Stop the loop and release the frame. Safe to call when not running. */
	stop(): void;
	/**
	 * Was the element's current scroll position put there by this follower?
	 *
	 * A scroll listener cannot otherwise distinguish a programmatic scroll from a
	 * user's, and that ambiguity is a real defect: a chat list that watches
	 * `scroll` to detect "the user scrolled away" will see the follower's own
	 * frames and conclude the user left.
	 *
	 * This compares the live position against the last value written, so it
	 * answers *"was that me?"* rather than *"am I running?"*. The difference
	 * matters — suppressing every event while running would leave a user unable
	 * to scroll away from a stream at all.
	 */
	isSelfScroll(): boolean;
}

const DEFAULT_STIFFNESS = 0.18;
const DEFAULT_EPSILON = 1;

/**
 * Follow the bottom of a scrollable element as its content grows.
 *
 * @example
 * ```ts
 * const follower = createScrollFollower(container, { reducedMotion });
 * $effect(() => {
 *   if (shouldAutoScroll && hasContent) follower.follow();
 * });
 * // in the scroll listener:
 * if (follower.isSelfScroll()) return;
 * ```
 */
export function createScrollFollower(
	element: HTMLElement,
	config: ScrollFollowerConfig = {}
): ScrollFollower {
	const stiffness = config.stiffness ?? DEFAULT_STIFFNESS;
	// Never below 1: see the note on `epsilon`.
	const epsilon = Math.max(1, config.epsilon ?? DEFAULT_EPSILON);

	let frame: number | null = null;
	// The last position this follower wrote. `-1` is "nothing yet", which no real
	// scrollTop can be.
	let written = -1;

	const target = (): number => element.scrollHeight - element.clientHeight;

	const settle = (): void => {
		element.scrollTop = target();
		written = element.scrollTop;
		frame = null;
	};

	const tick = (): void => {
		const distance = target() - element.scrollTop;

		if (Math.abs(distance) < epsilon) {
			settle();
			return;
		}

		// At least one whole pixel of progress. `scrollTop` is integral, so an
		// eased step of less than 1px rounds straight back and the follower stalls
		// a few pixels short of the bottom — which is exactly what happens over the
		// last stretch of any exponential approach.
		const step = distance * stiffness;
		element.scrollTop =
			element.scrollTop + (Math.abs(step) < 1 ? Math.sign(distance) : step);
		// Read back rather than trusting the write: the browser clamps to the
		// scrollable range and rounds, and `isSelfScroll` compares against what the
		// element actually holds.
		written = element.scrollTop;
		frame = requestAnimationFrame(tick);
	};

	return {
		follow(): void {
			if (config.reducedMotion ?? prefersReducedMotion()) {
				settle();
				return;
			}
			if (frame !== null) return;
			frame = requestAnimationFrame(tick);
		},

		stop(): void {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = null;
		},

		isSelfScroll(): boolean {
			// Sub-pixel tolerance: the browser rounds `scrollTop`, so an exact
			// comparison would disown the follower's own final frame.
			return written >= 0 && Math.abs(element.scrollTop - written) < 1;
		}
	};
}
