/**
 * The animation test helpers (`src/lib/test/animation.ts`): each one proven
 * against a real Web Animation or a real ticking value, and each guard —
 * reduced motion, fake timers — proven to fire (R1-REVIEW 2.1).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	assertMotionAllowed,
	midFlight,
	nextFrame,
	scrubAnimations,
	settleAnimations,
	settleValue,
	waitForAnimations,
	waitForStyle,
	waitUntil
} from '../../src/lib/test/animation.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function box(): HTMLElement {
	const el = document.createElement('div');
	el.style.cssText = 'position:absolute;top:0;left:0;width:50px;height:50px;background:red;';
	document.body.appendChild(el);
	cleanup.push(() => el.remove());
	return el;
}

const opacity = (el: Element) => Number.parseFloat(getComputedStyle(el).opacity);

/** Answer the media query as if the user had asked for reduced motion. */
function withReducedMotion<T>(fn: () => T): T {
	const original = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		matches: /prefers-reduced-motion/.test(query),
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false
	})) as never;
	try {
		return fn();
	} finally {
		window.matchMedia = original;
	}
}

describe('assertMotionAllowed', () => {
	it('passes when motion is allowed, and names the preference when it is not', () => {
		expect(() => assertMotionAllowed()).not.toThrow();
		withReducedMotion(() => {
			expect(() => assertMotionAllowed()).toThrow(/prefers-reduced-motion: reduce/);
		});
	});
});

describe('under vi.useFakeTimers() every helper refuses', () => {
	it('names the fake clock', async () => {
		vi.useFakeTimers();
		try {
			expect(() => waitUntil(() => 1, () => true)).toThrow(/cannot run under vi.useFakeTimers/);
			expect(() => midFlight(() => 0, { from: 0, to: 1 })).toThrow(/vi.useFakeTimers/);
			expect(() => settleValue(() => 0)).toThrow(/vi.useFakeTimers/);
			expect(() => nextFrame()).toThrow(/vi.useFakeTimers/);
			expect(() => scrubAnimations(document, 0.5)).toThrow(/vi.useFakeTimers/);
			await expect(settleAnimations(document)).rejects.toThrow(/vi.useFakeTimers/);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('waitUntil and waitForStyle', () => {
	it('resolves with the value once the predicate holds', async () => {
		let n = 0;
		const timer = setInterval(() => {
			n += 1;
		}, 5);
		cleanup.push(() => clearInterval(timer));
		expect(await waitUntil(() => n, (v) => v >= 3)).toBeGreaterThanOrEqual(3);
	});

	it('times out naming the last value read', async () => {
		await expect(waitUntil(() => 'still', (v) => v === 'done', { timeout: 60, what: 'the door' })).rejects.toThrow(
			/timed out after 60ms waiting for the door; last value: "still"/
		);
	});

	it('waitForStyle reads a computed property', async () => {
		const el = box();
		setTimeout(() => {
			el.style.opacity = '0.5';
		}, 20);
		expect(await waitForStyle(el, 'opacity', (v) => v === '0.5')).toBe('0.5');
	});
});

describe('waitForAnimations and scrubAnimations', () => {
	it('waits for a Web Animation on the element, ignoring infinite ones', async () => {
		const el = box();
		const spinner = el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(1turn)' }], { duration: 100, iterations: Infinity });
		cleanup.push(() => spinner.cancel());
		await expect(waitForAnimations(el, { timeout: 80 })).rejects.toThrow(/getAnimations\(\) sees opacity, transform, clipPath and filter only/);

		setTimeout(() => el.animate([{ opacity: 0 }, { opacity: 1 }], 300), 10);
		const running = await waitForAnimations(el);
		expect(running).toHaveLength(1);
	});

	it('scrubs every running animation to a fraction, and restore() puts the clocks back', async () => {
		const el = box();
		el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, fill: 'both' });
		await waitForAnimations(el);

		const restore = scrubAnimations(el, 0.5);
		expect(opacity(el)).toBeCloseTo(0.5, 1);
		restore();
		expect(opacity(el)).toBeLessThan(0.3);
	});

	it('throws when nothing animates, and on a fraction outside [0, 1]', () => {
		const el = box();
		expect(() => scrubAnimations(el, 0.5)).toThrow(/nothing animates on the target/);
		el.animate([{ opacity: 0 }, { opacity: 1 }], 300);
		expect(() => scrubAnimations(el, 2)).toThrow(RangeError);
	});
});

describe('settleAnimations', () => {
	it('returns 0 when nothing animates, and finishes what does', async () => {
		const el = box();
		expect(await settleAnimations(el)).toBe(0);
		el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 10_000, fill: 'forwards' });
		expect(await settleAnimations(el)).toBe(1);
		expect(opacity(el)).toBe(1);
	});

	it('finishes an animation that another one spawned, in a second pass', async () => {
		const el = box();
		const first = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 10_000, fill: 'forwards' });
		first.onfinish = () => {
			el.animate([{ transform: 'scale(1)' }, { transform: 'scale(2)' }], { duration: 10_000, fill: 'forwards' });
		};
		expect(await settleAnimations(el)).toBe(2);
		// Finished, filled animations stay listed; none is still going.
		expect(el.getAnimations().every((a) => a.playState === 'finished')).toBe(true);
	});

	it('gives up after the configured passes when animations keep spawning', async () => {
		const el = box();
		const spawn = (): void => {
			const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 10_000 });
			a.onfinish = spawn;
		};
		spawn();
		await expect(settleAnimations(el, { passes: 2 })).rejects.toThrow(/never settled after 2 passes/);
		el.getAnimations().forEach((a) => {
			a.onfinish = null;
			a.cancel();
		});
	});
});

describe('midFlight', () => {
	it('resolves with a value strictly between the endpoints', async () => {
		const el = box();
		el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
		const mid = await midFlight(() => opacity(el), { from: 1, to: 0 });
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
	});

	it('says "nothing moved" when the value never leaves the start', async () => {
		await expect(midFlight(() => 0, { from: 0, to: 1, timeout: 50 })).rejects.toThrow(/nothing moved/);
	});

	it('says "it jumped to the end" when the value is at the end from the first read', async () => {
		await expect(midFlight(() => 1, { from: 0, to: 1, timeout: 50 })).rejects.toThrow(/it jumped to the end/);
	});

	it('says "it overshot" when the value lands outside the range', async () => {
		await expect(midFlight(() => 2, { from: 0, to: 1, timeout: 50 })).rejects.toThrow(/it overshot/);
	});
});

describe('settleValue and nextFrame', () => {
	it('settleValue resolves once the value holds for the frames asked', async () => {
		let value = 0;
		let changes = 0;
		const timer = setInterval(() => {
			if (changes < 5) {
				value += 1;
				changes += 1;
			}
		}, 5);
		cleanup.push(() => clearInterval(timer));
		expect(await settleValue(() => value, { frames: 3 })).toBe(5);
	});

	it('settleValue times out on a value that keeps changing', async () => {
		let value = 0;
		await expect(settleValue(() => (value += 1), { timeout: 80, what: 'the counter' })).rejects.toThrow(/the counter never settled within 80ms/);
	});

	it('nextFrame resolves after the requested number of frames', async () => {
		let frames = 0;
		let counting = true;
		const count = (): void => {
			if (!counting) return;
			frames += 1;
			requestAnimationFrame(count);
		};
		requestAnimationFrame(count);
		await nextFrame(3);
		counting = false;
		expect(frames).toBeGreaterThanOrEqual(2);
		expect(frames).toBeLessThanOrEqual(4);
	});
});
