/**
 * Deterministic waits for animation tests.
 *
 * A test that samples a running animation at a fixed delay — `await wait(20)`
 * then "opacity is between 0 and 1" — passes on a fast machine and fails on a
 * loaded one: the R1 adversarial review reproduced that class of failure in
 * the runner across sixteen sites (R1-REVIEW 2.1). These helpers replace the
 * fixed delays with two primitives that do not depend on frame timing:
 *
 * - **Scrub.** A Web Animation is addressable: `scrubAnimations` moves each
 *   running animation's `currentTime` to a fraction of its length, so the
 *   mid-flight value is read at a chosen point, not at whatever point the
 *   scheduler reached. Motion One drives `opacity`, `transform`, `clipPath`
 *   and `filter` through the Web Animations API, so fades and moves scrub.
 * - **Poll.** Everything else — `x`, `rotate`, `scale`, `height`,
 *   `marginLeft`, a scroll position — Motion drives on its own JavaScript
 *   ticker, which `getAnimations()` never sees. `midFlight` polls a reader on
 *   a real 5 ms timer for a value strictly between two endpoints; `settleValue`
 *   waits for the value to stop changing.
 *
 * Every helper throws under `vi.useFakeTimers()` — Motion's ticker runs on
 * `requestAnimationFrame`, which sinon fakes too — and `assertMotionAllowed`
 * throws under `prefers-reduced-motion: reduce`, where nothing animates at
 * all; call it in a `beforeAll` of any file that samples mid-flight. The
 * module touches no DOM at load, so `@composable-svelte/core/test` still
 * loads under plain Node.
 */

import { realClearTimeout, realSetTimeout, timersAreFaked } from './real-timers.js';

/** The default bound on a wait, in milliseconds of real time. */
const DEFAULT_TIMEOUT = 2000;

function assertRealTimers(helper: string): void {
	if (timersAreFaked()) {
		throw new Error(
			`[animation] ${helper}() cannot run under vi.useFakeTimers(): Motion's ticker is on requestAnimationFrame, which the fake clock holds. Use real timers in animation tests.`
		);
	}
}

/**
 * Throw when the environment asks for reduced motion: a test that samples an
 * animation mid-flight would otherwise fail on a value that never moved, with
 * a message about the component. Call it in `beforeAll`.
 */
export function assertMotionAllowed(): void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		throw new Error(
			'[animation] this file samples animations mid-flight, and the environment asks for reduced motion (prefers-reduced-motion: reduce): nothing will animate. Run it with motion allowed.'
		);
	}
}

export interface WaitOptions {
	/** Real milliseconds before giving up. @default 2000 */
	readonly timeout?: number | undefined;
	/** Real milliseconds between reads. @default 10 */
	readonly interval?: number | undefined;
	/** Named in the timeout message. */
	readonly what?: string | undefined;
}

/**
 * Poll `read` on a real timer until `until(value)` holds; resolves with the
 * value. The timeout message names the last value read.
 */
export function waitUntil<T>(read: () => T, until: (value: T) => boolean, options: WaitOptions = {}): Promise<T> {
	assertRealTimers('waitUntil');
	const { timeout = DEFAULT_TIMEOUT, interval = 10, what = 'the condition' } = options;
	return new Promise<T>((resolve, reject) => {
		const started = performance.now();
		let last: T;
		const attempt = (): void => {
			try {
				last = read();
				if (until(last)) {
					resolve(last);
					return;
				}
			} catch (error) {
				reject(error);
				return;
			}
			if (performance.now() - started > timeout) {
				reject(new Error(`[animation] timed out after ${timeout}ms waiting for ${what}; last value: ${describe(last)}`));
				return;
			}
			realSetTimeout(attempt, interval);
		};
		attempt();
	});
}

/** `waitUntil` over a computed style property. */
export function waitForStyle(
	element: Element,
	property: string,
	until: (value: string) => boolean,
	options: WaitOptions = {}
): Promise<string> {
	return waitUntil(() => getComputedStyle(element).getPropertyValue(property), until, {
		what: `${property} of <${element.tagName.toLowerCase()}>`,
		...options
	});
}

export interface AnimationsOptions extends WaitOptions {
	/** Include descendants. @default true */
	readonly subtree?: boolean | undefined;
	/** Ignore animations that repeat forever (a spinner, a caret blink). @default true */
	readonly finiteOnly?: boolean | undefined;
}

/**
 * The animations that are still going. A finished animation with
 * `fill: forwards` stays in `getAnimations()` — the toast's entry animation
 * was still listed while its exit ran — so a finished one counts as settled.
 */
function animationsOf(target: Element | Document, subtree: boolean, finiteOnly: boolean): Animation[] {
	const all = target instanceof Document ? target.getAnimations() : target.getAnimations({ subtree });
	const going = all.filter((a) => a.playState !== 'finished');
	return finiteOnly ? going.filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity) : going;
}

/**
 * Wait until at least one Web Animation runs on the target. The timeout
 * message says what `getAnimations()` cannot see: a property Motion drives
 * on its JavaScript ticker, or an environment with reduced motion.
 */
export function waitForAnimations(target: Element | Document, options: AnimationsOptions = {}): Promise<Animation[]> {
	const { subtree = true, finiteOnly = true, what = 'a Web Animation' } = options;
	return waitUntil(() => animationsOf(target, subtree, finiteOnly), (list) => list.length > 0, {
		...options,
		what: `${what} on ${target instanceof Document ? 'the document' : `<${target.tagName.toLowerCase()}>`} — getAnimations() sees opacity, transform, clipPath and filter only (Motion drives x, rotate, scale, height and margins on its own ticker: poll with midFlight), and sees nothing under prefers-reduced-motion`
	});
}

/**
 * Move every running Web Animation on the target to `fraction` of its
 * length, so the mid-flight value is read at a known point. Returns a
 * function that restores the animations' clocks. Throws when nothing
 * animates.
 */
export function scrubAnimations(
	target: Element | Document,
	fraction: number,
	options: { readonly subtree?: boolean | undefined } = {}
): () => void {
	assertRealTimers('scrubAnimations');
	if (!(fraction >= 0 && fraction <= 1)) throw new RangeError(`[animation] fraction must be within [0, 1], got ${fraction}`);
	const animations = animationsOf(target, options.subtree ?? true, true);
	if (animations.length === 0) {
		throw new Error('[animation] scrubAnimations: nothing animates on the target (see waitForAnimations for what getAnimations() cannot see)');
	}
	const previous = animations.map((a) => a.currentTime);
	for (const animation of animations) {
		const timing = animation.effect?.getComputedTiming();
		const total = ((timing?.delay ?? 0) as number) + ((timing?.activeDuration ?? 0) as number);
		animation.currentTime = total * fraction;
	}
	return () => {
		animations.forEach((animation, i) => {
			animation.currentTime = previous[i] ?? null;
		});
	};
}

/**
 * Finish every finite Web Animation under the root, repeatedly: finishing
 * one can spawn another (a CSS transition on a variable a keyframe changed),
 * so each pass waits two frames before looking again — which is also what
 * lets Motion's commit land before the caller reads. Resolves with the
 * number of animations finished; throws after `passes`.
 */
export async function settleAnimations(root: Element | Document, options: { readonly passes?: number | undefined } = {}): Promise<number> {
	assertRealTimers('settleAnimations');
	const passes = options.passes ?? 5;
	let finished = 0;
	for (let pass = 0; pass < passes; pass += 1) {
		const finite = animationsOf(root, true, true);
		if (finite.length === 0) return finished;
		for (const animation of finite) animation.finish();
		finished += finite.length;
		await nextFrame(2);
	}
	throw new Error(`[animation] animations never settled after ${passes} passes`);
}

export interface MidFlightOptions extends WaitOptions {
	/** The resting value before the animation. */
	readonly from: number;
	/** The value it ends at. */
	readonly to: number;
}

/**
 * Poll `read` on a real 5 ms timer until it returns a value strictly between
 * `from` and `to`; resolves with it. The timeout message says whether nothing
 * moved, the value jumped to the end, or it overshot.
 */
export function midFlight(read: () => number, options: MidFlightOptions): Promise<number> {
	assertRealTimers('midFlight');
	const { from, to, timeout = DEFAULT_TIMEOUT, interval = 5, what = 'the value' } = options;
	const low = Math.min(from, to);
	const high = Math.max(from, to);
	return new Promise<number>((resolve, reject) => {
		const started = performance.now();
		const seen: number[] = [];
		const attempt = (): void => {
			let value: number;
			try {
				value = read();
			} catch (error) {
				reject(error);
				return;
			}
			seen.push(value);
			if (value > low && value < high) {
				resolve(value);
				return;
			}
			if (performance.now() - started > timeout) {
				const reason =
					seen.every((v) => v === from)
						? 'nothing moved'
						: seen.some((v) => v === to)
							? 'it jumped to the end'
							: seen.some((v) => v < low || v > high)
								? 'it overshot'
								: 'it never read between the endpoints';
				reject(new Error(`[animation] ${what} was never strictly between ${from} and ${to} within ${timeout}ms: ${reason} (read ${describeNumbers(seen)})`));
				return;
			}
			realSetTimeout(attempt, interval);
		};
		attempt();
	});
}

export interface SettleValueOptions extends WaitOptions {
	/** Consecutive frames the value must hold. @default 3 */
	readonly frames?: number | undefined;
	/** Change below this is "the same". @default 0.001 */
	readonly epsilon?: number | undefined;
}

/**
 * Wait until `read` returns the same value (within `epsilon`) for `frames`
 * consecutive animation frames; resolves with it.
 */
export function settleValue(read: () => number, options: SettleValueOptions = {}): Promise<number> {
	assertRealTimers('settleValue');
	const { frames = 3, epsilon = 0.001, timeout = DEFAULT_TIMEOUT, what = 'the value' } = options;
	return new Promise<number>((resolve, reject) => {
		const started = performance.now();
		let previous: number | undefined;
		let stable = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = (): void => {
			let value: number;
			try {
				value = read();
			} catch (error) {
				if (timer !== undefined) realClearTimeout(timer);
				reject(error);
				return;
			}
			stable = previous !== undefined && Math.abs(value - previous) <= epsilon ? stable + 1 : 0;
			previous = value;
			if (stable >= frames) {
				if (timer !== undefined) realClearTimeout(timer);
				resolve(value);
				return;
			}
			requestAnimationFrame(tick);
		};
		timer = realSetTimeout(() => {
			reject(new Error(`[animation] ${what} never settled within ${timeout}ms; last value: ${describe(previous)}`));
		}, timeout);
		const guarded = (): void => {
			if (performance.now() - started > timeout) return;
			tick();
		};
		requestAnimationFrame(guarded);
	});
}

/** Resolve after `count` animation frames — for a deliberate one-frame negative. */
export function nextFrame(count = 1): Promise<void> {
	assertRealTimers('nextFrame');
	return new Promise<void>((resolve) => {
		let left = count;
		const tick = (): void => {
			left -= 1;
			if (left <= 0) resolve();
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

function describe(value: unknown): string {
	if (typeof value === 'string') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.length} item(s)]`;
	return String(value);
}

function describeNumbers(values: number[]): string {
	const head = values.slice(0, 6).map((v) => Number(v.toFixed(3)));
	return values.length > 6 ? `${head.join(', ')} … (${values.length} reads)` : head.join(', ');
}
