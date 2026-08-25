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
		//
		// The recorded dimensions are not enough on their own. Routing *every*
		// update through the scratch canvas produces the same 400 here, because
		// `scaleToFit` caps at 1 — and with a silent 2D stub and a no-op
		// `texImage2D`, "uploaded the element" and "uploaded a copy of it" were
		// the same observation. The harness records `drawImage` now, so the
		// difference is visible: in a browser, always-scaling is a full canvas
		// redraw per frame for a `frame`-strategy video.
		const { fake, api } = overlay({ maxTextureSize: 512 });
		const canvas = sizedCanvas(256);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 400;
		canvas.height = 400;
		fake.clearCalls();
		api.updateElement('a');

		expect(api.getElement('a')?.width, 'a re-upload within the limit was scaled anyway').toBe(400);
		expect(
			fake.calls.filter((name) => name === 'drawImage'),
			'a re-upload within the limit went through the scratch canvas'
		).toHaveLength(0);
		api.destroy();
	});

	it('does go through the scratch canvas when it must scale', async () => {
		// And the other half of that: the `drawImage` assertion above is only
		// worth having if scaling actually produces one.
		const { fake, api } = overlay({ maxTextureSize: 512 });
		const canvas = sizedCanvas(256);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 2048;
		canvas.height = 2048;
		fake.clearCalls();
		api.updateElement('a');

		expect(
			fake.calls.filter((name) => name === 'drawImage'),
			'an oversize re-upload never reached the scratch canvas'
		).toHaveLength(1);
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

	it('refuses a scaled re-upload that would still exceed the budget', async () => {
		// The size cap and the budget were in a race the size cap always won:
		// `validateSize` returned as soon as the dimensions were over the cap
		// and never consulted the budget, and the caller then allocated the
		// scaled size unconditionally. Measured before the fix: an 8MB budget,
		// a 512² canvas grown to 8192², scaled to 2048² — 16MB allocated, and
		// `onError` called zero times.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 8 * MB, maxTextureSize: 2048, onError });
		const canvas = sizedCanvas(512);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 8192;
		canvas.height = 8192;
		api.updateElement('a');

		expect(onError, 'a 16MB scaled upload passed an 8MB budget').toHaveBeenCalledTimes(1);
		expect(api.getElement('a')?.width, 'the refused size was recorded anyway').toBe(512);
		api.destroy();
	});

	it('allows a scaled re-upload that does fit', async () => {
		// The paired half: checking the budget for the scaled size must not
		// refuse one that fits. 2048² is 16MB, inside a 32MB budget.
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 32 * MB, maxTextureSize: 2048, onError });
		const canvas = sizedCanvas(512);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 8192;
		canvas.height = 8192;
		api.updateElement('a');

		expect(onError, 'a scaled upload that fits was refused').not.toHaveBeenCalled();
		expect(api.getElement('a')?.width).toBe(2048);
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

describe('a failed upload is not charged for', () => {
	/** Make `texImage2D` throw, as a cross-origin source does with SecurityError. */
	function breakUploads(fake: FakeGL): () => void {
		const original = fake.context.texImage2D.bind(fake.context);
		(fake.context as unknown as Record<string, unknown>).texImage2D = () => {
			throw new Error('SecurityError');
		};
		return () => {
			(fake.context as unknown as Record<string, unknown>).texImage2D = original;
		};
	}

	it('leaves the budget where it was when the upload throws', async () => {
		// The accounting used to be settled before the upload, and three of the
		// failure returns never put it back — so the difference stayed charged,
		// and was charged again on every retry.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { fake, api } = overlay({ memoryBudget: 8 * MB, onError });
		const canvas = sizedCanvas(1024);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		const restore = breakUploads(fake);
		canvas.width = 1200;
		canvas.height = 1200;
		for (let i = 0; i < 5; i++) api.updateElement('a');
		restore();

		// a still holds its original 4MB. A second 4MB element must still fit
		// in an 8MB budget; if the failures were charged, it will not.
		onError.mockClear();
		api.registerElement('b', loadedImage(1024), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'the failed uploads were charged to the budget').not.toHaveBeenCalled();
		expect(api.getElement('b')?.texture).toBeDefined();
		api.destroy();
	});

	it('still charges for one that succeeds', async () => {
		// The paired half: not charging on failure must not become not charging.
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 8 * MB, onError });
		const canvas = sizedCanvas(1024);

		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		canvas.width = 1200;
		canvas.height = 1200;
		api.updateElement('a');
		expect(api.getElement('a')?.width, 'the successful re-upload was not recorded').toBe(1200);

		// a now holds 1200² × 4 ≈ 5.5MB, so a 4MB element no longer fits.
		api.registerElement('b', loadedImage(1024), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'the grown texture was not charged for').toHaveBeenCalledTimes(1);
		api.destroy();
	});
});

describe('the budget survives register and unregister', () => {
	it('credits back what an unregistered element held', async () => {
		// `deleteTexture` calls `trackDeallocation`, and deleting that call was
		// free: usage becomes monotonic, and an app that registers and
		// unregisters eventually refuses every texture. The existing
		// restore-time test asserts a credit did *not* happen, which passes
		// equally when credits never happen at all.
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 6 * MB, onError });

		for (let i = 0; i < 5; i++) {
			api.registerElement(`e${i}`, loadedImage(1024), {
				type: 'image',
				shader: 'wave-gentle-horizontal'
			});
			await settle();
			api.unregisterElement(`e${i}`);
		}

		api.registerElement('last', loadedImage(1024), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(onError, 'unregistering never gave the budget back').not.toHaveBeenCalled();
		expect(api.getElement('last')?.texture).toBeDefined();
		api.destroy();
	});

	it('credits back the size the element grew to, not the one it started at', async () => {
		// This is what the `tracked` argument is for, and nothing exercised it:
		// the only test that touched it re-uploaded at an unchanged size, where
		// `tracked ?? size` and `size` are the same value.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 24 * MB, onError });
		const canvas = sizedCanvas(1024);

		// a: 4MB, then grown to 16MB. b: 4MB. Total 20MB of a 24MB budget.
		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();
		canvas.width = 2048;
		canvas.height = 2048;
		api.updateElement('a');

		api.registerElement('b', loadedImage(1024), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();
		expect(onError, 'b did not fit alongside the grown a').not.toHaveBeenCalled();

		api.unregisterElement('a');

		// With a gone, 20MB is free. A 16MB element must fit; if unregistering
		// credited back a's *registration* size of 4MB rather than the 16MB it
		// actually held, only 8MB is free and this is refused.
		api.registerElement('c', loadedImage(2048), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'unregistering credited the wrong size back').not.toHaveBeenCalled();
		expect(api.getElement('c')?.texture).toBeDefined();
		api.destroy();
	});
});
