/**
 * A sustained slump is one line, not one a second.
 *
 * `updateFPS` warned every time it recomputed the frame rate — once a second,
 * for as long as the rate stayed below 70% of target. Sixty times less often
 * than the other repeating diagnostics in this package, and the same defect: a
 * standing condition re-announced on a timer says nothing new after the first
 * line, and buries what does.
 *
 * The rule this follows, and the one that separates it from the messages that
 * *should* repeat: a message about a **standing condition** fires when the
 * condition worsens; a message about a **caller's action** fires every time,
 * because each call is a separate mistake. `updateElement` on a static element
 * is reported on all thirty calls, deliberately.
 *
 * The mark clears when the rate recovers, so a later slump is announced instead
 * of being swallowed by a reading from minutes ago.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RenderLoop } from '../../src/lib/utils/render-loop.js';

afterEach(() => vi.restoreAllMocks());

/**
 * Drive `updateFPS` directly across whole seconds.
 *
 * The private method is reached by name because the alternative is a real
 * `requestAnimationFrame` loop with real timing, which would make the test slow
 * and flaky to assert a counting property. The frames-per-second figure is
 * `frames / elapsed`, so the inputs below are exact.
 *
 * `RenderLoop`'s first constructor argument is the target frame rate, not the
 * callback. Passing a function there — as the first version of this file did —
 * makes `targetFPS * 0.7` `NaN`, every comparison false, and every arm below
 * fail for a reason that has nothing to do with the code under test.
 */
function tick(loop: RenderLoop, fps: number, seconds: number, startAt = 0): number {
	const step = loop as unknown as { updateFPS(t: number): void };
	let now = startAt;
	for (let second = 0; second < seconds; second += 1) {
		for (let frame = 0; frame < fps; frame += 1) {
			now += 1000 / fps;
			step.updateFPS(now);
		}
	}
	return now;
}

/**
 * A console spy, by the only shape these helpers use.
 *
 * Not `ReturnType<typeof vi.spyOn>`: that resolves to the constructor-shaped
 * overload and fails `svelte-check` with thirteen errors, none of which `tsc
 * --noEmit` reports — the package's `typecheck` script does not cover `tests/`,
 * and `check` does.
 */
type ConsoleSpy = { mock: { calls: unknown[][] } };

const lowFpsLines = (warn: ConsoleSpy) =>
	warn.mock.calls.filter((call) => String(call[0]).includes('Low FPS')).length;

describe('a frame rate below target', () => {
	it('is reported', () => {
		// Non-vacuity: "reported once" is satisfied by never reporting.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const loop = new RenderLoop(60);

		tick(loop, 20, 1);

		expect(lowFpsLines(warn), 'a slump was never reported').toBe(1);
	});

	it('is not reported again every second while it persists', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const loop = new RenderLoop(60);

		tick(loop, 20, 10);

		expect(lowFpsLines(warn), 'a steady slump was reported every second').toBe(1);
	});

	it('is reported again when it gets worse', () => {
		// Suppression is about repetition. A slump deepening is new information.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const loop = new RenderLoop(60);

		const at = tick(loop, 20, 2);
		expect(lowFpsLines(warn)).toBe(1);
		tick(loop, 5, 2, at);

		expect(lowFpsLines(warn), 'a deeper slump was suppressed as a repeat').toBe(2);
	});

	it('is reported again after a recovery', () => {
		// Otherwise a reading from minutes ago silences a fresh problem.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const loop = new RenderLoop(60);

		let at = tick(loop, 20, 2);
		expect(lowFpsLines(warn)).toBe(1);

		at = tick(loop, 60, 2, at); // recovered
		tick(loop, 20, 2, at); // and slumps again, no worse than before

		expect(lowFpsLines(warn), 'a fresh slump was hidden by an older one').toBe(2);
	});
});

describe('a healthy frame rate', () => {
	it('says nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const loop = new RenderLoop(60);

		tick(loop, 60, 5);

		expect(lowFpsLines(warn)).toBe(0);
	});
});
