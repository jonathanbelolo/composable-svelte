/**
 * The overlay's long-lived listeners must go when the thing that added them does.
 *
 * This subsystem ships ~6,700 lines with no tests at all, so these are its
 * first. They deliberately need no WebGL: both leaks here are plain
 * `addEventListener` calls with no matching removal, which a spy on the target
 * can count exactly.
 *
 * `RenderLoop` and `WebGLContextManager` each register anonymous handlers in a
 * constructor or an `initialize`, keep no reference to them, and declare no
 * `destroy` of any kind — so a page that mounts and unmounts an overlay N times
 * accumulates N handlers, each closing over the object it belongs to.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderLoop } from '../../src/lib/utils/render-loop.js';
import { WebGLContextManager } from '../../src/lib/utils/webgl-context-manager.js';
import { createFakeGL, installFakeGL } from '../helpers/fake-gl.js';

/** Net listeners added to a target: added minus removed, per event name. */
function listenerLedger(target: EventTarget) {
	const net = new Map<string, number>();
	const add = vi
		.spyOn(target, 'addEventListener')
		.mockImplementation(((type: string) => {
			net.set(type, (net.get(type) ?? 0) + 1);
		}) as never);
	const remove = vi
		.spyOn(target, 'removeEventListener')
		.mockImplementation(((type: string) => {
			net.set(type, (net.get(type) ?? 0) - 1);
		}) as never);

	return {
		net: (type: string) => net.get(type) ?? 0,
		restore: () => {
			add.mockRestore();
			remove.mockRestore();
		}
	};
}

describe('RenderLoop releases its visibility listener', () => {
	let ledger: ReturnType<typeof listenerLedger>;
	beforeEach(() => { ledger = listenerLedger(document); });
	afterEach(() => ledger.restore());

	it('leaves nothing behind after destroy', () => {
		const loop = new RenderLoop(60);
		expect(ledger.net('visibilitychange'), 'the listener was never added').toBe(1);

		loop.destroy();

		expect(ledger.net('visibilitychange'), 'the visibility listener outlived the loop').toBe(0);
	});

	it('does not accumulate across mount/unmount cycles', () => {
        // The shape that matters: a component mounted and unmounted repeatedly.
		for (let i = 0; i < 20; i += 1) {
			const loop = new RenderLoop(60);
			loop.destroy();
		}

		expect(ledger.net('visibilitychange'), '20 cycles left 20 listeners').toBe(0);
	});
});

describe('WebGLContextManager releases its canvas listeners', () => {
	it('leaves nothing behind after destroy', () => {
		// The fake `gl` is installed only to keep `[WebGLOverlay] WebGL not
		// supported` off the test output. Noise in a passing run trains you to
		// ignore the output, which is how a real warning gets missed.
		const uninstall = installFakeGL(createFakeGL());
		const canvas = document.createElement('canvas');
		const ledger = listenerLedger(canvas);
		const manager = new WebGLContextManager();

		manager.initialize(canvas);
		expect(ledger.net('webglcontextlost')).toBe(1);
		expect(ledger.net('webglcontextrestored')).toBe(1);

		manager.destroy();

		expect(ledger.net('webglcontextlost'), 'the context-lost listener outlived the manager').toBe(0);
		expect(ledger.net('webglcontextrestored')).toBe(0);
		ledger.restore();
		uninstall();
	});
});
