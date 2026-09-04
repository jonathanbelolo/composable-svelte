/**
 * A refused element must be able to recover whatever its update strategy is —
 * and until now the commonest case could not.
 *
 * The retry added for refused elements routes through `updateElement()`, which
 * services `'manual'` elements and reports anything else as a fault. That gate
 * is right for a *re-read*: `static` exists precisely so a consumer does not
 * re-upload an unchanging image every frame. It is wrong for an element that
 * has no texture at all, where the call is asking for the *first* upload.
 *
 * The effect was that the fix reached two of the three element types:
 *
 * - a `<canvas>` infers `manual`, so it recovered
 * - a `<video>` infers `frame`, so the render loop retried it — while it is
 *   *playing*; the scheduler does not sample a paused video, which is correct
 *   and is asserted below so the recovery arm cannot be mistaken for a promise
 *   the code does not make
 * - an `<img>` infers `static`, so it was refused at registration and then
 *   refused again by `updateElement` for having the strategy an image always
 *   has. It stayed inert for the life of the page with no public call able to
 *   recover it.
 *
 * An image registered before it decodes is not an edge case — it is what
 * happens whenever the element is registered on mount rather than on `load`,
 * and it is what `examples/shader-gallery` does.
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

/** An `<img>` that has not decoded, and can be made to. */
function pendingImage() {
	const el = document.createElement('img');
	let natural = 0;
	let complete = false;
	Object.defineProperty(el, 'complete', { get: () => complete });
	Object.defineProperty(el, 'naturalWidth', { get: () => natural });
	Object.defineProperty(el, 'naturalHeight', { get: () => natural });
	return {
		el,
		decode: (size: number) => {
			natural = size;
			complete = true;
		}
	};
}

/** A `<video>` with no frame yet, playing or paused as asked. */
function pendingVideo(playing: boolean) {
	const el = document.createElement('video');
	let dimension = 0;
	Object.defineProperty(el, 'videoWidth', { get: () => dimension });
	Object.defineProperty(el, 'videoHeight', { get: () => dimension });
	Object.defineProperty(el, 'paused', { get: () => !playing });
	Object.defineProperty(el, 'ended', { get: () => false });
	return { el, frame: (size: number) => (dimension = size) };
}

const SHADER = 'wave-gentle-horizontal';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const frames = async (n: number) => {
	for (let i = 0; i < n; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
};

describe('an image registered before it decodes', () => {
	it('is refused at registration', async () => {
		// Non-vacuity: the recovery arms below say nothing if the image was
		// accepted in the first place.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = overlay();
		const img = pendingImage();

		api.registerElement('a', img.el, { type: 'image', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture, 'an undecoded image was accepted').toBeUndefined();
		api.destroy();
	});

	it('infers the static strategy, which is what made it unrecoverable', async () => {
		// Pinned because the whole defect follows from it. If images ever infer
		// `manual`, this arm fails and the reader is sent to the reason.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = overlay();
		const img = pendingImage();

		api.registerElement('a', img.el, { type: 'image', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.updateStrategy).toBe('static');
		api.destroy();
	});

	it('recovers on updateElement once it has decoded', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = overlay();
		const img = pendingImage();

		api.registerElement('a', img.el, { type: 'image', shader: SHADER });
		await settle();

		img.decode(64);
		api.updateElement('a');
		await settle();

		expect(
			api.getElement('a')?.texture,
			'a static element could not be retried, so an image never recovered'
		).toBeDefined();
		api.destroy();
	});

	it('does not report the retry as a strategy fault', async () => {
		// The second refusal, and the one that made the state permanent: the
		// element was told its strategy was wrong for a call that was asking for
		// its first upload.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const api = overlay({ onError });
		const img = pendingImage();

		api.registerElement('a', img.el, { type: 'image', shader: SHADER });
		await settle();
		onError.mockClear();

		img.decode(64);
		api.updateElement('a');
		await settle();

		expect(onError.mock.calls.map((call) => (call[0] as OverlayError).code)).not.toContain(
			OverlayErrorCode.INVALID_ELEMENT_TYPE
		);
		api.destroy();
	});

	it('fires the callback it was owed', async () => {
		// The debt has to survive both refusals, not just the first.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = overlay();
		const img = pendingImage();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', img.el, { type: 'image', shader: SHADER, onTextureLoaded });
		await settle();
		expect(onTextureLoaded, 'a refused creation reported success').not.toHaveBeenCalled();

		img.decode(64);
		api.updateElement('a');
		await settle();

		expect(onTextureLoaded).toHaveBeenCalledTimes(1);
		api.destroy();
	});
});

describe('the strategy gate still holds where it means something', () => {
	// The control. The exception is for an element with *no texture*; an element
	// that has one is asking to re-read a source that `static` says will not
	// change, and that is still a fault.
	it('refuses updateElement on a static element that already loaded', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const api = overlay({ onError });
		const img = pendingImage();
		img.decode(64);

		api.registerElement('a', img.el, { type: 'image', shader: SHADER });
		await settle();
		expect(api.getElement('a')?.texture, 'the image never loaded').toBeDefined();
		onError.mockClear();

		api.updateElement('a');
		await settle();

		expect((onError.mock.calls[0]?.[0] as OverlayError)?.code).toBe(
			OverlayErrorCode.INVALID_ELEMENT_TYPE
		);
		api.destroy();
	});

	it('still reports an unknown id rather than silently retrying it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const api = overlay({ onError });

		api.updateElement('nobody');
		await settle();

		expect((onError.mock.calls[0]?.[0] as OverlayError)?.code).toBe(
			OverlayErrorCode.ELEMENT_NOT_FOUND
		);
		api.destroy();
	});
});

describe('a video recovers on its own, while it is playing', () => {
	it('retries per frame and loads once the first frame arrives', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = overlay();
		const video = pendingVideo(true);

		api.registerElement('a', video.el, { type: 'video', shader: SHADER });
		await settle();
		expect(api.getElement('a')?.texture, 'a frameless video was accepted').toBeUndefined();

		video.frame(64);
		await frames(6);

		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});

	it('does not sample a paused video, so that one waits for updateElement', async () => {
		// Not a defect and deliberately pinned: the scheduler skips a paused or
		// ended video, so "a video recovers on its own" is true only of one that
		// is playing. Without this arm the sibling above would read as a promise
		// the code does not make — and a paused video is not stuck either, since
		// the textureless retry now services it.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = overlay();
		const video = pendingVideo(false);

		api.registerElement('a', video.el, { type: 'video', shader: SHADER });
		await settle();

		video.frame(64);
		await frames(6);
		expect(api.getElement('a')?.texture, 'a paused video was sampled').toBeUndefined();

		api.updateElement('a');
		await settle();
		expect(api.getElement('a')?.texture, 'a paused video could not be retried').toBeDefined();
		api.destroy();
	});
});

describe('a budget refusal recovers too', () => {
	// The README says an element too big for the budget loads if the budget
	// later has room. That is a claim about the retry reaching *every* refusal,
	// not only the not-ready-yet ones, and it is here so the sentence is pinned
	// by something rather than by my having tried it once.
	it('loads once another element frees the room', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		// 256×256×4 = 262,144 bytes each: room for one, not two.
		const api = overlay({ onError, memoryBudget: 400_000 });
		const canvas = (size: number) => {
			const el = document.createElement('canvas');
			el.width = size;
			el.height = size;
			return el;
		};

		api.registerElement('occupant', canvas(256), { type: 'canvas', shader: SHADER });
		await settle();
		expect(api.getElement('occupant')?.texture, 'the first element did not fit').toBeDefined();

		api.registerElement('a', canvas(256), { type: 'canvas', shader: SHADER });
		await settle();
		expect(api.getElement('a')?.texture, 'the budget did not refuse the second').toBeUndefined();
		expect((onError.mock.calls.at(-1)?.[0] as OverlayError).code).toBe(
			OverlayErrorCode.MEMORY_BUDGET_EXCEEDED
		);

		api.unregisterElement('occupant');
		await settle();
		api.updateElement('a');
		await settle();

		expect(
			api.getElement('a')?.texture,
			'the budget refusal never recovered, so unregistering does not release its bytes'
		).toBeDefined();
		api.destroy();
	});
});
