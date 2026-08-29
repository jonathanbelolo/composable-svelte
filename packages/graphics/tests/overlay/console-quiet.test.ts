/**
 * A running overlay does not talk to the console every frame.
 *
 * Three separate defects of this shape were fixed in one afternoon — the render
 * pipeline reporting itself uninitialised, a missing uniform, memory pressure —
 * and each was found by hand, after the previous one, by grepping for the next
 * instance. A per-site fix does not stop the fourth being written.
 *
 * This is the end-to-end version: run an overlay in each of the states that used
 * to produce a flood, and bound the total output. It does not care *which* line
 * repeats, so it covers sites that do not exist yet.
 *
 * It drives the **render loop**, not just `updateElement`. The first version of
 * this file drove updates only, and a `console.log` planted in
 * `RenderPipeline.render` — the exact function two of the three defects lived in
 * — sailed through all three arms. A guard against a class has to enter every
 * path the class lives on, and the way to find out is to plant one and watch.
 *
 * The rule it encodes: a message about a **standing condition** is worth saying
 * when the condition worsens, and once otherwise. A message about a **caller's
 * action** fires every time, because each call is a separate mistake — those are
 * asserted in the suites for the calls themselves, not bounded here.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

/** Every console channel, counted together — the flood is what matters. */
function watchConsole() {
	const calls: string[] = [];
	for (const channel of ['error', 'warn', 'info', 'log'] as const) {
		vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
			calls.push(String(args[0]));
		});
	}
	return calls;
}

function overlay(options: OverlayOptions = {}): { api: OverlayContextAPI; fake: FakeGL } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { api, fake };
}

function canvas(size: number): HTMLCanvasElement {
	const el = document.createElement('canvas');
	el.width = size;
	el.height = size;
	return el;
}

const MANUAL = { type: 'canvas', shader: 'wave-gentle-horizontal', updateStrategy: 'manual' } as const;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const FRAMES = 60;

/**
 * Drive both hot paths: the texture updates *and* the render loop.
 *
 * `drawArrays` is the oracle for the second one — it says how many frames were
 * really drawn, so an arm can require the console output not to grow with them
 * rather than trusting that the loop ran.
 */
async function run(api: OverlayContextAPI, id: string, fake: FakeGL) {
	api.start();
	for (let frame = 0; frame < FRAMES; frame += 1) {
		api.updateElement(id);
		await settle();
	}
	// Real frames, since the loop is driven by requestAnimationFrame.
	const deadline = 40;
	for (let wait = 0; wait < deadline && fake.drawCalls() < 10; wait += 1) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	api.stop();
	return fake.drawCalls();
}

describe('sixty frames of ordinary work', () => {
	it('produce nothing on the console', async () => {
		const calls = watchConsole();
		const { api, fake } = overlay();
		api.registerElement('a', canvas(64), MANUAL);
		await settle();
		calls.length = 0;

		const drawn = await run(api, 'a', fake);

		expect(drawn, 'the render loop never ran, so this proves nothing').toBeGreaterThan(0);
		expect(calls, `an idle overlay wrote ${calls.length} console lines`).toEqual([]);
		api.destroy();
	});
});

describe('sixty frames while something is wrong', () => {
	it('say it a bounded number of times, not once per frame', async () => {
		// 256² × 4 = 262,144 against a 300,000 budget: 87%, sustained, and
		// re-tracked twice per update. This produced 21 lines for 10 updates.
		const calls = watchConsole();
		const { api, fake } = overlay({ memoryBudget: 300_000 });
		api.registerElement('a', canvas(256), MANUAL);
		await settle();
		calls.length = 0;

		const drawn = await run(api, 'a', fake);

		expect(drawn, 'the render loop never ran, so this proves nothing').toBeGreaterThan(0);
		expect(
			calls.length,
			`a standing condition was re-reported ${calls.length} times in ${FRAMES} frames:\n` +
				calls.slice(0, 3).join('\n')
		).toBeLessThanOrEqual(2);
		api.destroy();
	});

	it('and the count does not scale with the number of frames', async () => {
		// The property that actually distinguishes "reported" from "flooding",
		// and the one a fixed bound can pass by luck: doubling the frames must
		// not double the output.
		const shortRun = watchConsole();
		const first = overlay({ memoryBudget: 300_000 });
		first.api.registerElement('a', canvas(256), MANUAL);
		await settle();
		shortRun.length = 0;
		first.api.start();
		for (let frame = 0; frame < 10; frame += 1) {
			first.api.updateElement('a');
			await settle();
		}
		await new Promise((resolve) => setTimeout(resolve, 60));
		first.api.stop();
		const short = shortRun.length;
		const shortDraws = first.fake.drawCalls();
		first.api.destroy();
		vi.restoreAllMocks();

		const longRun = watchConsole();
		const second = overlay({ memoryBudget: 300_000 });
		second.api.registerElement('a', canvas(256), MANUAL);
		await settle();
		longRun.length = 0;
		const longDraws = await run(second.api, 'a', second.fake);

		expect(longDraws, 'the long run did not draw more frames').toBeGreaterThan(shortDraws);
		expect(longRun.length, 'output grew with the frame count').toBe(short);
		second.api.destroy();
	});
});
