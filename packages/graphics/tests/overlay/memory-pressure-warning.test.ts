/**
 * Memory pressure is announced when it worsens, not on every allocation.
 *
 * `trackAllocation` warned whenever usage sat above 80% of the budget, and a
 * re-upload calls it twice: `updateTexture` releases the outgoing texture,
 * re-tracks it to validate the incoming one against the budget minus itself,
 * then settles the new size. Measured on a 256² canvas at 87% of a 300 KB
 * budget: **21 warnings for 10 updates**. A `frame`-strategy element updates
 * every frame, so that is 120 lines a second for a condition that has not
 * changed.
 *
 * An edge trigger on "crossed 80%" would not have fixed it. That same
 * release-and-re-track dips usage to 0% and back on every single update, so
 * every update is a fresh crossing. The high-water mark is what survives the
 * accounting — and it still reports a *worse* level, which is the part worth
 * keeping.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import { createFakeGL, installFakeGL, installFakeObservers } from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

function overlay(options: OverlayOptions = {}): OverlayContextAPI {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return api;
}

function canvas(size: number): HTMLCanvasElement {
	const el = document.createElement('canvas');
	el.width = size;
	el.height = size;
	return el;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const MANUAL = { type: 'canvas', shader: 'wave-gentle-horizontal', updateStrategy: 'manual' } as const;

/** Memory lines only — the suite produces other warnings that are not the subject. */
/**
 * A console spy, by the only shape these helpers use.
 *
 * Not `ReturnType<typeof vi.spyOn>`: that resolves to the constructor-shaped
 * overload and fails `svelte-check` with thirteen errors, none of which `tsc
 * --noEmit` reports — the package's `typecheck` script does not cover `tests/`,
 * and `check` does.
 */
type ConsoleSpy = { mock: { calls: unknown[][] } };

const memoryLines = (warn: ConsoleSpy) =>
	warn.mock.calls.filter((call) => String(call[0]).includes('Memory usage')).length;

describe('a texture near the budget', () => {
	it('is announced', () => {
		// Non-vacuity: "warns once" is satisfied by a system that never warns.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = overlay({ memoryBudget: 300_000 });

		// 256² × 4 bytes = 262,144 — 87% of the budget.
		api.registerElement('a', canvas(256), MANUAL);

		expect(memoryLines(warn), 'memory pressure was never reported').toBe(1);
		api.destroy();
	});

	it('is not re-announced on every re-upload', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = overlay({ memoryBudget: 300_000 });
		api.registerElement('a', canvas(256), MANUAL);
		await settle();

		for (let update = 0; update < 10; update += 1) {
			api.updateElement('a');
			await settle();
		}

		expect(memoryLines(warn), 'the same pressure was reported on every update').toBe(1);
		api.destroy();
	});
});

describe('pressure that gets worse', () => {
	it('is announced again', async () => {
		// Suppression must be about repetition. A second element pushing usage
		// higher is new information and has to arrive.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = overlay({ memoryBudget: 900_000 });

		// The sizes are arithmetic, not guesses: 900,000 bytes of budget, and each
		// canvas costs width × height × 4. The first version of this arm used a
		// 400² canvas, which costs 640,000 and takes the total *past* the budget
		// — so it was refused rather than warned about, and the arm failed for
		// the right reason.
		api.registerElement('a', canvas(256), MANUAL); // 262,144 — 29%, quiet
		await settle();
		expect(memoryLines(warn), 'a comfortable budget complained').toBe(0);

		api.registerElement('b', canvas(340), MANUAL); // +462,400 → 724,544, 80.5%
		await settle();
		expect(memoryLines(warn), 'crossing the threshold said nothing').toBe(1);

		api.registerElement('c', canvas(64), MANUAL); // +16,384 → 740,928, 82.3%
		await settle();

		expect(memoryLines(warn), 'a worse level was suppressed as a repeat').toBe(2);
		api.destroy();
	});
});

describe('a comfortable budget', () => {
	it('says nothing at all', async () => {
		// The control: the threshold must still be a threshold.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = overlay({ memoryBudget: 50 * 1024 * 1024 });

		api.registerElement('a', canvas(256), MANUAL);
		await settle();
		api.updateElement('a');
		await settle();

		expect(memoryLines(warn)).toBe(0);
		api.destroy();
	});
});
