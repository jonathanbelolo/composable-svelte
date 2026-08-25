/**
 * `debug` must belong to the overlay that was given it.
 *
 * It used to set a module-level flag, on the argument that threading a logger
 * through five constructors "would be noise". Three consequences: two overlays
 * fought over it, `destroy()` never reset it, and — because the flag was set
 * after `BrowserCompatibility` and `DeviceCapabilities` were constructed, both
 * of which log from their constructors — the browser and device lines never
 * printed on the first overlay of a page, which are the two lines the option
 * exists for.
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

const linesFrom = (spy: { mock: { calls: unknown[][] } }) =>
	spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[WebGLOverlay]'));

describe('debug: true', () => {
	it('prints the browser and device lines it exists for', () => {
		// These come from constructors that ran *before* the module flag was
		// ever set, so they were the one thing `debug: true` reliably missed.
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});

		const api = overlay({ debug: true });

		const lines = linesFrom(info);
		expect(lines.some((l) => l.includes('Browser:')), 'the browser line never printed').toBe(true);
		expect(
			lines.some((l) => l.includes('Device capabilities:')),
			'the device line never printed'
		).toBe(true);
		api.destroy();
	});

	it('prints nothing when it is not set', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});

		const api = overlay();

		expect(linesFrom(info), 'an overlay logged without being asked to').toEqual([]);
		api.destroy();
	});
});

describe('debug belongs to one overlay', () => {
	it('does not leak into an overlay created afterwards', () => {
		// The module flag survived `destroy()`, so one `debug: true` overlay
		// left package-wide logging on for the life of the page.
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});

		const first = overlay({ debug: true });
		first.destroy();
		info.mockClear();

		const second = overlay({ debug: false });

		expect(linesFrom(info), 'a destroyed overlay left logging on').toEqual([]);
		second.destroy();
	});

	it('does not leak into an overlay that is live alongside it', () => {
		// Two on one page: whichever was constructed second used to win for
		// both, so a plain overlay could silently turn a debugging one off — or
		// start logging on behalf of one that never asked.
		//
		// The path has to be one that uses the logger. `registerElement`'s
		// notice reads `this.options.debug` directly and would pass either way;
		// the context-restore line goes through `this.log`.
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const quietCanvas = document.createElement('canvas');
		const loudCanvas = document.createElement('canvas');
		const quiet = createOverlay({ canvas: quietCanvas, debug: false }) as OverlayContextAPI;
		const loud = createOverlay({ canvas: loudCanvas, debug: true }) as OverlayContextAPI;

		const info = vi.spyOn(console, 'info').mockImplementation(() => {});

		loudCanvas.dispatchEvent(new Event('webglcontextlost'));
		loudCanvas.dispatchEvent(new Event('webglcontextrestored'));
		expect(linesFrom(info), 'the debugging overlay logged nothing').not.toEqual([]);

		info.mockClear();
		quietCanvas.dispatchEvent(new Event('webglcontextlost'));
		quietCanvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(linesFrom(info), 'the quiet overlay logged because a loud one exists').toEqual([]);
		loud.destroy();
		quiet.destroy();
	});
});
