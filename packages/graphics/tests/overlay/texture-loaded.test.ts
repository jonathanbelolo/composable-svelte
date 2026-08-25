/**
 * `onTextureLoaded` must mean the texture loaded.
 *
 * `WebGLOverlay.svelte` fired it from a fixed `setTimeout(…, 100)`, under its
 * own TODO saying so. Registration returns synchronously and the texture
 * resolves later, so the callback fired on CORS rejection, on an oversize
 * texture, on an unloaded image — and early for anything slower than 100ms.
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

const loadedImage = (): HTMLImageElement => {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: 64 });
	Object.defineProperty(img, 'naturalHeight', { value: 64 });
	return img;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('onTextureLoaded', () => {
	it('fires when the texture is actually created', async () => {
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', loadedImage(), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a successful load reported nothing').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('does not fire when the texture fails', async () => {
		// The half the timer got wrong. An `<img>` that never loaded fails in
		// `createImageTexture`, and the consumer used to be told it had loaded
		// 100ms later regardless.
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', document.createElement('img'), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a failed load was reported as success').not.toHaveBeenCalled();
		api.destroy();
	});

	it('does not fire for an element unregistered before the texture resolved', async () => {
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', loadedImage(), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		api.unregisterElement('a');
		await settle();

		expect(onTextureLoaded, 'a discarded element reported a load').not.toHaveBeenCalled();
		api.destroy();
	});
});
