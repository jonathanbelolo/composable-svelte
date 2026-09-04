/**
 * One condition, one code: a source that has nothing to upload yet.
 *
 * A canvas measured before layout, an image registered before it decodes and a
 * video before its first frame are the same situation — the source is not ready.
 * They reported two different codes. The canvas path went through
 * `validationError` and produced `TEXTURE_CREATION_FAILED`; the image and video
 * paths produced `INVALID_ELEMENT_TYPE`, which says the element is the wrong
 * *kind* of thing when in fact it is exactly the right kind and simply early.
 *
 * That collision cost something concrete. `INVALID_ELEMENT_TYPE` is also what a
 * `<div>` handed to the overlay reports, and a `<div>` will never work. Since a
 * refused element now retries on the next update, a consumer's whole decision —
 * try again, or give up and tear the overlay down — rests on telling those two
 * apart, and the code did not let them.
 *
 * The wording differs per element, because the wait differs. The code and the
 * leading clause do not.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import { OverlayError, OverlayErrorCode } from '../../src/lib/utils/overlay-error.js';
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

function image(natural: number | null, complete = true): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: complete });
	Object.defineProperty(img, 'naturalWidth', { value: natural ?? 0 });
	Object.defineProperty(img, 'naturalHeight', { value: natural ?? 0 });
	return img;
}

function video(dimension: number): HTMLVideoElement {
	const el = document.createElement('video');
	Object.defineProperty(el, 'videoWidth', { value: dimension });
	Object.defineProperty(el, 'videoHeight', { value: dimension });
	return el;
}

function canvas(size: number): HTMLCanvasElement {
	const el = document.createElement('canvas');
	el.width = size;
	el.height = size;
	return el;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Register one element and return whatever it reported, if anything. */
async function refusalFor(element: Element, type: 'image' | 'video' | 'canvas') {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const onError = vi.fn();
	const api = overlay({ onError });

	api.registerElement('a', element as HTMLElement, { type, shader: 'wave-gentle-horizontal' });
	await settle();

	return { api, onError, error: onError.mock.calls[0]?.[0] as OverlayError | undefined };
}

const NOT_READY = [
	['an image that has not decoded', () => image(null), 'image'],
	['an image still loading', () => image(null, false), 'image'],
	['a video with no frame', () => video(0), 'video'],
	['a canvas with no area', () => canvas(0), 'canvas']
] as const;

describe.each(NOT_READY)('%s', (_name, make, type) => {
	it('is refused', async () => {
		// Non-vacuity for both arms below: "reports the right code" is empty if
		// nothing is reported at all.
		const { error } = await refusalFor(make(), type);
		expect(error, 'the unready source was accepted').toBeDefined();
	});

	it('reports TEXTURE_CREATION_FAILED, not a wrong-element-type', async () => {
		const { error } = await refusalFor(make(), type);
		expect(error!.code).toBe(OverlayErrorCode.TEXTURE_CREATION_FAILED);
	});

	it('says the source has no pixels', async () => {
		const { error } = await refusalFor(make(), type);
		expect(error!.message).toMatch(/has no pixels/i);
	});
});

describe('the three agree', () => {
	it('reports one code for the one condition', async () => {
		// The property the change exists for, asserted directly rather than
		// inferred from three separate constants matching by eye.
		const codes = [];
		for (const [, make, type] of NOT_READY) {
			const { error } = await refusalFor(make(), type);
			codes.push(error?.code);
		}

		expect(new Set(codes).size, `three conditions, ${new Set(codes).size} codes`).toBe(1);
	});

	it('still distinguishes them in the detail', async () => {
		// One code must not mean one message: a consumer reading the log should
		// still learn *which* source is waiting and for what.
		const messages = [];
		for (const [, make, type] of NOT_READY) {
			const { error } = await refusalFor(make(), type);
			messages.push(error!.message);
		}

		expect(new Set(messages).size, 'every unready source now says the same thing').toBe(
			messages.length
		);
	});
});

describe('INVALID_ELEMENT_TYPE keeps its meaning', () => {
	// The control, and the reason the change is worth anything: if the wrong-kind
	// case had drifted to the same code, the distinction would be gone in the
	// other direction and the tests above would still pass.
	it('a <div> is still the wrong kind of element', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const api = overlay({ onError });

		api.registerElement('a', document.createElement('div'), {
			shader: 'wave-gentle-horizontal'
		} as never);
		await settle();

		expect(onError, 'a <div> was accepted').toHaveBeenCalled();
		expect((onError.mock.calls[0]![0] as OverlayError).code).toBe(
			OverlayErrorCode.INVALID_ELEMENT_TYPE
		);
		api.destroy();
	});

	it('a duplicate id is still reported as a registration fault', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const api = overlay({ onError });
		const opts = { type: 'image', shader: 'wave-gentle-horizontal' } as const;

		api.registerElement('a', image(64), opts);
		await settle();
		onError.mockClear();
		api.registerElement('a', image(64), opts);

		expect((onError.mock.calls[0]![0] as OverlayError).code).toBe(
			OverlayErrorCode.INVALID_ELEMENT_TYPE
		);
		api.destroy();
	});
});

describe('a ready source is not refused', () => {
	// The other control: refusing the empty case must not have refused the
	// ordinary one for any of the three.
	it.each([
		['image', () => image(64), 'image'],
		['video', () => video(64), 'video'],
		['canvas', () => canvas(64), 'canvas']
	] as const)('accepts a %s that has pixels', async (_name, make, type) => {
		const { api, onError } = await refusalFor(make(), type);
		expect(onError, `a healthy ${type} was refused`).not.toHaveBeenCalled();
		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});
});
