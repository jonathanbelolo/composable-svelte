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

describe('a source no shrinking can help still gets pixels', () => {
	it('scales an extreme aspect ratio to at least one pixel high', async () => {
		// `Math.floor(1 * (4096 / 8192))` is 0, and a zero-area texture
		// re-validates as *valid* — it costs no bytes, so no budget refuses it.
		// The element rendered nothing while `onTextureLoaded` fired and
		// `onError` never did. Wide gradient strips and sprite sheets are
		// ordinary content.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: 512, onError });

		api.registerElement('a', sizedCanvas(4096, 1), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.width, 'the width was not capped').toBe(512);
		expect(api.getElement('a')?.height, 'the height was floored to nothing').toBeGreaterThan(0);
		expect(api.getElement('a')?.texture, 'no texture was created').toBeDefined();
		expect(onError).not.toHaveBeenCalled();
		api.destroy();
	});

	it('still scales an ordinary oversize source proportionally', async () => {
		// The paired half: a floor of one must not become a floor for
		// everything. A square 2048 at a 512 cap is 512, not 1.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api } = overlay({ maxTextureSize: 512 });

		api.registerElement('a', sizedCanvas(2048, 1024), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.width).toBe(512);
		expect(api.getElement('a')?.height).toBe(256);
		api.destroy();
	});
});

describe('the texture size limits are validated', () => {
	const unusable = [-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

	it.each(unusable)('ignores a maxTextureSize of %s rather than acting on it', async (bad) => {
		// `-1` sent `scaleToFit` into a recursion that ran ~2480 frames before
		// the stack blew, surfacing as `TEXTURE_CREATION_FAILED: Cannot read
		// properties of undefined`. `0` produced a silent 0×0.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: bad as number, onError });

		api.registerElement('a', sizedCanvas(256), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(api.getElement('a')?.width, 'a bad limit was acted on').toBe(256);
		expect(onError).not.toHaveBeenCalled();
		expect(
			warn.mock.calls.some((call) => String(call[0]).includes('maxTextureSize')),
			'the ignored value was not reported'
		).toBe(true);
		api.destroy();
	});

	it('falls back rather than uncapping when the driver reports nothing usable', async () => {
		// `width > undefined` is false for every width, so an unreadable driver
		// limit used to disable the cap entirely.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());
		(fake.context as unknown as Record<string, unknown>).getParameter = () => undefined;

		const api = createOverlay({});
		if (!('destroy' in api)) throw new Error('overlay failed to initialise');

		api.registerElement('a', sizedCanvas(4096), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(api.getElement('a')?.width, 'the cap was disabled entirely').toBe(2048);
		expect(
			warn.mock.calls.some((call) => String(call[0]).includes('MAX_TEXTURE_SIZE')),
			'the fallback was not reported'
		).toBe(true);
		api.destroy();
	});

	it('does not blame the consumer for a limit the driver got wrong', async () => {
		// `MAX_TEXTURE_SIZE` has two readers and only `TextureValidator` guarded
		// it. `DeviceCapabilities` took the driver's answer raw, and
		// `WebGLOverlay` uses that as the *default* for `options.maxTextureSize`
		// — so an unusable driver value came back round as though the consumer
		// had supplied it, and the warning said "maxTextureSize must be a whole
		// number of pixels of at least 1; ignoring -1" to someone who called
		// `createOverlay({})`.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());
		(fake.context as unknown as Record<string, unknown>).getParameter = () => -1;

		const api = createOverlay({});
		if (!('destroy' in api)) throw new Error('overlay failed to initialise');

		api.registerElement('a', sizedCanvas(4096), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		// Non-vacuity: something must actually have been capped, or "no
		// complaint" is true because nothing happened.
		expect(api.getElement('a')?.width, 'the driver value was acted on').toBe(2048);
		expect(
			warn.mock.calls.filter((call) => String(call[0]).includes('maxTextureSize must be')),
			'the consumer was blamed for the driver'
		).toEqual([]);
		api.destroy();
	});
});

describe('the budget error describes the decision that produced it', () => {
	it('reports the bytes it actually judged, not the un-scaled source', async () => {
		// The refusal is about the *scaled* size; the caller still holds the
		// original dimensions, so the error reported a figure four times too
		// large for a half-scale fit.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: 2048, memoryBudget: 8 * MB, onError });

		// 8192² scales to 2048² = 16MB, over an 8MB budget.
		api.registerElement('a', sizedCanvas(8192), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError).toHaveBeenCalledTimes(1);
		const details = (onError.mock.calls[0]![0] as { details?: Record<string, number> }).details;
		expect(details?.requestedSize, 'the un-scaled size was reported').toBe(2048 * 2048 * 4);
		api.destroy();
	});

	it('reports the usage it judged against, not the one after the outgoing texture is credited back', async () => {
		// The other half of the same fix, and it had no test at all: its
		// mutation survived the whole suite twice over. `updateTexture`
		// deallocates the outgoing texture before validating — otherwise a
		// re-upload that fits perfectly well is refused for the space it already
		// occupies — and the error used to be built *after* the accounting was
		// put back, so `currentUsage` included the very texture the validator
		// had been told to ignore.
		//
		// The creation path cannot reach this: the deallocate/reallocate dance
		// exists only on update. The previous test drove `registerElement`,
		// which is why it pinned `requestedSize` and nothing else.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		// Between 4MB and 5.76MB: the first upload fits, the re-upload does not
		// even after the outgoing 4MB is credited back. A 6MB budget made the
		// re-upload *fit* — deallocating first is exactly what gives it room — so
		// the first version of this test asserted a refusal that never came.
		const { api } = overlay({ memoryBudget: 5 * MB, onError });

		const canvas = sizedCanvas(1000); // 4MB
		api.registerElement('a', canvas, { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		// Non-vacuity: the element must actually hold its 4MB, or "usage is
		// zero" below is true for the boring reason.
		expect(api.getElement('a')?.width, 'the first upload never landed').toBe(1000);
		expect(onError, 'the first upload was already refused').not.toHaveBeenCalled();

		// Grow it to 1200² = 5.76MB, past the 5MB ceiling on its own merits.
		// `currentUsage` at the moment of judgement is 0, because the outgoing 4MB
		// has been credited back; the un-fixed code restored it first and reported
		// 4MB — the very texture the validator was told to ignore.
		canvas.width = 1200;
		canvas.height = 1200;
		api.updateElement('a');
		await settle();

		expect(onError, 'the re-upload was accepted').toHaveBeenCalledTimes(1);
		const details = (onError.mock.calls[0]![0] as { details?: Record<string, number> }).details;
		expect(details?.currentUsage, 'the message counted the texture being replaced').toBe(0);
		api.destroy();
	});
});

describe('a source with a zero dimension is refused, not silently drawn', () => {
	it('refuses a canvas with no height', async () => {
		// `elementSize` tested only `canvas.width > 0`, so a 256x0 canvas — a
		// collapsed layout, or a chart before it measures — passed as a valid
		// source and produced a zero-area texture. That re-validates as *valid*
		// because it costs no bytes, so `onTextureLoaded` fired, `onError` never
		// did, and the element rendered nothing. The one-pixel floor in
		// `scaleToFit` cannot help: there is nothing to scale down from.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', sizedCanvas(256, 0), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a texture with no pixels was reported as loaded').not.toHaveBeenCalled();
		expect(api.getElement('a')?.texture, 'a zero-area texture was created').toBeUndefined();
		api.destroy();
	});

	it('still accepts an ordinary source, so the check is not refusing everything', async () => {
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', sizedCanvas(256, 128), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(api.getElement('a')?.width, 'an ordinary source was refused').toBe(256);
		expect(onTextureLoaded).toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('refuses an image with no height', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api } = overlay();

		api.registerElement('a', loadedImage(256, 0), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.texture, 'a zero-area texture was created').toBeUndefined();
		api.destroy();
	});
});
