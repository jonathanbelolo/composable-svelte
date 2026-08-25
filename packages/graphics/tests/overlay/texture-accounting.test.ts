/**
 * `maxTextureSize` and `memoryBudget` must bound every upload, not the first.
 *
 * `TextureFactory.updateTexture` went straight to `texImage2D` at whatever size
 * the element had reached: no size validation, no memory accounting, and the
 * tracked dimensions left at their registration values. So a `<video>` that
 * switched resolution mid-playback, or a `<canvas>` the app resized before
 * calling `updateElement()`, uploaded past the cap the consumer set while the
 * budget went on describing a texture that no longer existed.
 *
 * Both options were the subject of `82412fa`, "make the overlay's options
 * real". They were made real at creation only.
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

function overlay(options: OverlayOptions = {}): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

function sizedCanvas(width: number, height = width): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function loadedImage(width: number, height = width): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: width });
	Object.defineProperty(img, 'naturalHeight', { value: height });
	return img;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const MB = 1024 * 1024;

describe('a re-upload is bounded by maxTextureSize', () => {
	it('scales a canvas that grew past the limit', async () => {
		const { api } = overlay({ maxTextureSize: 512 });
		const canvas = sizedCanvas(256);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();
		expect(api.getElement('a')?.width).toBe(256);

		canvas.width = 2048;
		canvas.height = 2048;
		api.updateElement('a');

		expect(api.getElement('a')?.width, 'a 2048px re-upload passed a 512px limit').toBe(512);
		api.destroy();
	});

	it('leaves one that stayed within it alone', async () => {
		// The paired half: the scaling must not fire for a size that fits.
		const { api } = overlay({ maxTextureSize: 512 });
		const canvas = sizedCanvas(256);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 400;
		canvas.height = 400;
		api.updateElement('a');

		expect(api.getElement('a')?.width, 'a re-upload within the limit was scaled anyway').toBe(400);
		api.destroy();
	});
});

describe('a re-upload is accounted for', () => {
	it('leaves the budget describing the texture that now exists', async () => {
		// 20MB budget. A 1024² canvas is 4MB; grown to 2048² it is 16MB. With no
		// accounting on the update path the tracked figure stays at 4MB, so a
		// second 9MB element is admitted — 25MB of real textures inside a 20MB
		// budget, and no error anywhere.
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 20 * MB, onError });
		const canvas = sizedCanvas(1024);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 2048;
		canvas.height = 2048;
		api.updateElement('a');
		expect(onError, 'the grown canvas was itself refused').not.toHaveBeenCalled();

		api.registerElement('b', loadedImage(1500), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'the budget still described the pre-update size').toHaveBeenCalledTimes(1);
		expect(api.getElement('b')?.texture, 'a texture was created over budget').toBeUndefined();
		api.destroy();
	});

	it('does not leak budget across repeated re-uploads at the same size', async () => {
		// The paired half, and the one an over-eager fix would break: replacing
		// a texture must release the outgoing allocation, not stack a new one on
		// top. Five updates of a 4MB canvas inside a 20MB budget must still
		// leave room for a 9MB element.
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 20 * MB, onError });
		const canvas = sizedCanvas(1024);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		for (let i = 0; i < 5; i++) api.updateElement('a');

		api.registerElement('b', loadedImage(1500), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'repeated re-uploads consumed the budget').not.toHaveBeenCalled();
		expect(api.getElement('b')?.texture).toBeDefined();
		api.destroy();
	});

	it('refuses a re-upload that would exceed the budget, and keeps the old size', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 8 * MB, onError });
		const canvas = sizedCanvas(1024);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 2048;
		canvas.height = 2048;
		api.updateElement('a');

		expect(onError, 'a 16MB re-upload passed an 8MB budget').toHaveBeenCalledTimes(1);
		expect(api.getElement('a')?.width, 'the refused size was recorded anyway').toBe(1024);
		api.destroy();
	});
});
