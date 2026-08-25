/**
 * Rebuilding after a context restore must not abandon what it replaces.
 *
 * `recreateResources` overwrites `textureFactory`, `programManager` and
 * `renderPipeline` with fresh instances and never calls `destroy()` on the
 * outgoing ones.
 *
 * **What that actually leaks is narrower than it sounds**, and the test says so:
 * this runs only after a context *loss*, at which point every GL object is
 * already invalid and the GPU memory has gone with the context. What survives is
 * the JS side — the program cache, the buffer handles, the manager objects. So
 * the assertion is on the `destroy()` calls being made, not on GPU memory being
 * reclaimed, because the latter would be a claim the mechanism cannot support.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI } from '../../src/lib/overlay/overlay-types.js';
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

function overlay(): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay({});
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

describe('context restore', () => {
	it('releases the render pipeline it replaces', () => {
		const { fake, api } = overlay();
		const canvas = fake.canvas!;

		const buffersBefore = fake.live('buffer');
		expect(buffersBefore, 'the pipeline never allocated any buffers').toBeGreaterThan(0);

		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));

		// A fresh pipeline allocates its own quad buffers; the outgoing one must
		// have released the handles it held rather than simply being dropped.
		expect(
			fake.live('buffer'),
			'the replaced pipeline kept its buffers'
		).toBe(buffersBefore);

		api.destroy();
	});

	it('still rebuilds — the release must not cost the restore', () => {
		// The paired half. Destroying the outgoing managers is only correct if
		// the incoming ones are actually there afterwards.
		const { fake, api } = overlay();
		const canvas = fake.canvas!;
		const createdBefore = fake.created('buffer');

		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(
			fake.created('buffer'),
			'nothing was rebuilt after the restore'
		).toBeGreaterThan(createdBefore);

		api.destroy();
	});
});
