/**
 * Every GPU resource the overlay creates must be released when its owner goes.
 *
 * The fake `gl` counts `create*` against `delete*` per resource kind, so each of
 * these is a plain equality rather than an inspection of internal state — which
 * matters because the leaks here are in private maps no test can reach.
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

/** An `<img>` that reports as loaded, so texture creation reaches the GL calls. */
function loadedImage(): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: 64 });
	Object.defineProperty(img, 'naturalHeight', { value: 64 });
	document.body.appendChild(img);
	return img;
}

describe('compiled programs are released', () => {
	it('deletes an element\'s program when the element is unregistered', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await Promise.resolve();
		expect(fake.created('program'), 'no program was ever compiled').toBeGreaterThan(0);

		api.unregisterElement('a');

		expect(
			fake.live('program'),
			'the compiled program outlived the element that asked for it'
		).toBe(0);
		api.destroy();
	});

	it('keeps a shared program alive until the last element using it goes', async () => {
		// The refcount exists for exactly this: two elements, one preset, one
		// program. Releasing on the first unregister would break the second.
		const { fake, api } = overlay();

		for (const id of ['a', 'b']) {
			api.registerElement(id, loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		}
		await Promise.resolve();
		expect(fake.created('program'), 'the two elements did not share a program').toBe(1);

		api.unregisterElement('a');
		expect(fake.live('program'), 'the shared program went while b was still using it').toBe(1);

		api.unregisterElement('b');
		expect(fake.live('program')).toBe(0);
		api.destroy();
	});
});

describe('textures are released', () => {
	it('deletes the texture of an element unregistered before it finished loading', async () => {
		// `createElementTexture` is async and un-awaited, so a registration can
		// be torn down while the texture is still resolving. The handle then
		// lands on a registration no longer in the map: never deleted, and the
		// memory accounting never told.
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		api.unregisterElement('a');

		// Let the pending texture creation settle.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fake.live('texture'), 'the in-flight texture was orphaned').toBe(0);
		api.destroy();
	});

	it('keeps the texture of an element that is still registered', async () => {
		// The paired half of the orphan test, and it is load-bearing.
		// `registerElement` sets the element map *after* kicking off texture
		// creation, so a guard that asks "is this element still registered?"
		// could delete every texture on the normal path — and the destroy test
		// below would still pass, because zero live is what it asserts.
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fake.created('texture'), 'no texture was ever created').toBeGreaterThan(0);
		expect(fake.live('texture'), 'the live element lost its texture').toBeGreaterThan(0);
		api.destroy();
	});

	it('deletes textures for elements still registered at destroy', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fake.created('texture'), 'no texture was ever created').toBeGreaterThan(0);

		api.destroy();

		expect(fake.live('texture'), 'destroy left textures behind').toBe(0);
	});
});
