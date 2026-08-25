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

	it('releases the outgoing program when an element changes shader', async () => {
		// `setShader` recompiles through the same refcounted cache that
		// `registerElement` uses, so every switch takes a reference. Nothing
		// gave the previous one back. Two consequences, and the second is the
		// worse one: the old program is never freed, and the *new* refcount is
		// one too high, so `unregisterElement` decrements to 1 rather than 0
		// and frees nothing either.
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await Promise.resolve();

		api.setShader('a', 'ripple-gentle');

		expect(fake.created('program'), 'the new shader was not compiled').toBe(2);
		expect(fake.live('program'), 'the shader it switched away from was abandoned').toBe(1);

		api.unregisterElement('a');
		expect(fake.live('program'), 'the element let go of nothing on the way out').toBe(0);
		api.destroy();
	});

	it('keeps a program a second element is still using when the first switches away', async () => {
		// The paired half. Releasing on switch is only correct if it decrements
		// rather than deletes: two elements share one program, one of them
		// changes shader, and the other must keep rendering.
		const { fake, api } = overlay();

		for (const id of ['a', 'b']) {
			api.registerElement(id, loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		}
		await Promise.resolve();
		expect(fake.created('program')).toBe(1);

		api.setShader('a', 'ripple-gentle');

		expect(fake.live('program'), 'b lost the program it was sharing').toBe(2);
		api.destroy();
	});

	it('does not double-release when an element is set to the shader it already has', async () => {
		// Re-setting the same source is a cache hit, so the release and the
		// acquire cancel out. A release that ran unconditionally *before* the
		// new acquire would drop the refcount to zero, delete the program, and
		// hand back a deleted handle.
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await Promise.resolve();

		api.setShader('a', 'wave-gentle-horizontal');

		expect(fake.created('program'), 'the identical shader was recompiled').toBe(1);
		expect(fake.live('program'), 'the element deleted the program it still uses').toBe(1);

		api.unregisterElement('a');
		expect(fake.live('program')).toBe(0);
		api.destroy();
	});

	it('keeps the working program, and the shader that names it, when a recompile fails', async () => {
		// The release is conditional on the compile succeeding. Without that,
		// a bad custom shader takes the element's working program down with it
		// and leaves `shader` naming something that never linked — which
		// `getElement()` then hands to the consumer.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, api } = overlay();

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await Promise.resolve();
		const before = api.getElement('a')?.shader;
		expect(fake.live('program')).toBe(1);

		// The harness compiles everything successfully, so a test that needs a
		// failure overrides the getter.
		//
		// It is not what rejects this particular source, though — the comment
		// used to imply it was. `validateShaderSource` refuses 'this is not
		// glsl' for its missing `main()`, `precision` and `gl_FragColor` before
		// `gl.createShader` is ever reached. The override is what makes the
		// *vertex* shader fail too, since `DEFAULT_VERTEX_SHADER` validates
		// fine; the test passes without it, for a different reason than stated.
		(fake.context as unknown as Record<string, unknown>).getShaderParameter = () => false;

		api.setShader('a', { fragment: 'this is not glsl' });

		expect(fake.live('program'), 'a working program was released for one that never linked').toBe(
			1
		);
		expect(
			api.getElement('a')?.shader,
			'the registration names a shader that is not the one rendering'
		).toBe(before);
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
