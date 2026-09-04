/**
 * Destroying the overlay must not call back into the consumer.
 *
 * `destroy()` deliberately calls `loseContext()` to free GPU memory. That
 * dispatches `webglcontextlost` synchronously, which runs the manager's own
 * still-registered handler, which invokes `options.onContextLost()` — on an
 * overlay the consumer has just torn down. And because the handler calls
 * `preventDefault()`, the browser may then fire `webglcontextrestored`, running
 * `recreateResources()` and rebuilding a texture factory, program manager and
 * render pipeline on a destroyed overlay.
 *
 * `this.destroyed = true` was set *after* `loseContext()`, so the guard the
 * class already had could not help.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
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

function overlay(options: Parameters<typeof createOverlay>[0] = {}) {
	const fake: FakeGL = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());

	const api = createOverlay(options);
	// `createOverlay` returns `OverlayContextAPI | OverlayError`. A test that
	// silently accepted the error would assert nothing at all.
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);

	return { fake, api };
}

describe('destroy() does not re-enter the consumer', () => {
	it('does not call onContextLost while tearing down', () => {
		const onContextLost = vi.fn();
		const { api } = overlay({ onContextLost });

		api.destroy();

		expect(
			onContextLost,
			'destroy() lost the context and the consumer heard about it afterwards'
		).not.toHaveBeenCalled();
	});

	it('still calls onContextLost for a real loss while alive', () => {
		// The paired half: silencing teardown must not silence the event the
		// option exists for.
		const onContextLost = vi.fn();
		const { api } = overlay({ onContextLost });

		const canvas = api.getCanvas();
		canvas.dispatchEvent(new Event('webglcontextlost'));

		expect(onContextLost, 'a genuine context loss went unreported').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('releases the render loop, not just the pending frame', () => {
		// `destroy()` called `stop()`, which cancels the frame and leaves the
		// `visibilitychange` listener on `document`. Asserted through the
		// overlay, because the `RenderLoop` test constructs one directly and so
		// cannot see whether the overlay actually calls the new method.
		const net = { count: 0 };
		const add = vi
			.spyOn(document, 'addEventListener')
			.mockImplementation(((t: string) => {
				if (t === 'visibilitychange') net.count += 1;
			}) as never);
		const remove = vi
			.spyOn(document, 'removeEventListener')
			.mockImplementation(((t: string) => {
				if (t === 'visibilitychange') net.count -= 1;
			}) as never);

		const { api } = overlay();
		expect(net.count, 'the overlay never registered one').toBe(1);

		api.destroy();

		expect(net.count, 'the overlay kept its visibility listener').toBe(0);
		add.mockRestore();
		remove.mockRestore();
	});

	it('does not rebuild resources after being destroyed', () => {
		// A restore event arriving after teardown used to run
		// `recreateResources()` — rebuilding a texture factory, program manager
		// and render pipeline on a destroyed overlay, with no guard of any kind.
		//
		// What closes it is the listener removal, not the `destroyed` flag:
		// `recreateResources` has exactly one call site, inside the handler that
		// `contextManager.destroy()` now unregisters. The flag is set early
		// because setting a destroyed marker last is wrong on its own terms, not
		// because a reachable path depends on it.
		const { fake, api } = overlay();
		const canvas = fake.canvas!;

		api.destroy();
		const buffersAfterDestroy = fake.created('buffer');

		canvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(
			fake.created('buffer'),
			'a destroyed overlay rebuilt its render pipeline'
		).toBe(buffersAfterDestroy);
	});
});