/**
 * An element whose first texture is refused must be able to recover.
 *
 * It could not. `createElementTexture` is called from exactly two places —
 * initial registration, and the rebuild after a context loss. The public
 * `updateElement(id)` routes through the scheduler to `handleElementUpdate`,
 * which begins `if (!registration || !registration.texture …) return`. So a
 * refusal at creation left `registration.texture` undefined, and every
 * subsequent update returned immediately: the element was inert for the life of
 * the page, and nothing an application could call would retry it. Only a GPU
 * context loss and restore rebuilds, which an app cannot trigger.
 *
 * The refusals are ordinary, not exotic. A `<canvas>` measured before layout is
 * 0×0. An `<img>` registered before it decodes is not complete. A texture over
 * the memory budget is refused. Each of those used to recover on the next
 * `updateElement()`; the guard that names the empty case is what made the case
 * it names permanent.
 *
 * The same failure loses the consumer's callback. `onTextureLoaded` is only
 * recorded as a debt on the context-lost branch, so a *failed* immediate
 * creation dropped it — even though a later success would have been the moment
 * to fire it. Round five fixed exactly this for a failed rebuild and left the
 * identical hole on the immediate path.
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

/** A canvas with no area — what one measured before layout reports. */
function unlaidOutCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = 0;
	canvas.height = 0;
	return canvas;
}

function sizedCanvas(width: number, height = width): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a canvas registered before layout', () => {
	it('is refused at first, which is the behaviour under test', async () => {
		// Non-vacuity for everything below: if a 0×0 canvas were accepted, the
		// recovery arms would pass without exercising recovery at all.
		const { api } = overlay();
		api.registerElement('a', unlaidOutCanvas(), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.texture, 'a zero-area canvas was accepted').toBeUndefined();
	});

	it('recovers on the next updateElement once it has been laid out', async () => {
		const { api } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();
		expect(api.getElement('a')?.texture).toBeUndefined();

		// Layout happens; the element now has pixels.
		canvas.width = 256;
		canvas.height = 256;
		api.updateElement('a');
		await settle();

		expect(
			api.getElement('a')?.texture,
			'the element never recovered — updateElement cannot retry a refused creation'
		).toBeDefined();
	});

	it('reports the recovered dimensions, not the refused ones', async () => {
		const { api } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		canvas.width = 128;
		canvas.height = 64;
		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.width).toBe(128);
		expect(api.getElement('a')?.height).toBe(64);
	});

	it('clears the error it reported when the retry succeeds', async () => {
		const { api } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();
		expect(api.getElement('a')?.error, 'the refusal was not reported at all').toBeDefined();

		canvas.width = 256;
		canvas.height = 256;
		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.error, 'the element still carries a stale error').toBeUndefined();
	});

	it('leaves a still-empty canvas refused rather than pretending', async () => {
		// Recovery must be conditional on the source actually having pixels now.
		const { api } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.texture).toBeUndefined();
	});
});

describe('the callback owed to a failed creation', () => {
	it('does not fire while the element is still refused', async () => {
		const { api } = overlay();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', unlaidOutCanvas(), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a refused creation reported success').not.toHaveBeenCalled();
	});

	it('fires when a later update finally creates the texture', async () => {
		// The debt was recorded only on the context-lost branch, so a failed
		// immediate creation dropped the callback for good. In shader-gallery
		// that callback fades the DOM image out, so the effect stayed invisible.
		const { api } = overlay();
		const canvas = unlaidOutCanvas();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual',
			onTextureLoaded
		});
		await settle();

		canvas.width = 256;
		canvas.height = 256;
		api.updateElement('a');
		await settle();

		expect(
			onTextureLoaded,
			'the texture arrived and the consumer was never told'
		).toHaveBeenCalledTimes(1);
	});

	it('fires once, not on every subsequent update', async () => {
		const { api } = overlay();
		const canvas = unlaidOutCanvas();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual',
			onTextureLoaded
		});
		await settle();

		canvas.width = 256;
		canvas.height = 256;
		api.updateElement('a');
		await settle();
		api.updateElement('a');
		await settle();

		expect(onTextureLoaded).toHaveBeenCalledTimes(1);
	});

	it('still fires normally when the first creation succeeds', async () => {
		// The control: the recovery path must not have broken the ordinary one.
		const { api } = overlay();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', sizedCanvas(256), {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded).toHaveBeenCalledTimes(1);
	});
});

describe('a refusal that keeps repeating is reported once', () => {
	// Retrying on update is what makes recovery possible, and it is also what
	// makes repetition possible: a `frame`-strategy element updates every frame,
	// so an element that stays refused would report the same error sixty times a
	// second through `onError` and the console. The retry is only worth having
	// if it is quiet.
	it('does not re-report an identical refusal on every update', async () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();
		expect(onError, 'the first refusal was not reported').toHaveBeenCalledTimes(1);

		for (let i = 0; i < 5; i += 1) {
			api.updateElement('a');
			await settle();
		}

		expect(onError, 'the same refusal was reported on every retry').toHaveBeenCalledTimes(1);
	});

	it('still reports a refusal that changes', async () => {
		// Non-vacuity: suppression must be about *repetition*, not about
		// swallowing everything after the first.
		//
		// The second refusal has to be a genuinely different one. An oversized
		// source is *scaled to fit* rather than refused, so growing the canvas
		// past `maxTextureSize` produces a success, not a second error — which is
		// how the first version of this test failed, for the right reason.
		// Exceeding the memory budget is a refusal with a different code.
		const onError = vi.fn();
		const { api } = overlay({ onError, memoryBudget: 4096 });
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();
		const firstCode = onError.mock.calls[0]?.[0]?.code;
		expect(firstCode, 'the empty refusal was not reported').toBeTruthy();

		// Real pixels now, but more bytes than the budget allows.
		canvas.width = 512;
		canvas.height = 512;
		api.updateElement('a');
		await settle();

		expect(onError.mock.calls.length, 'a different refusal was suppressed').toBeGreaterThan(1);
		expect(onError.mock.calls.at(-1)?.[0]?.code).not.toBe(firstCode);
	});
})

describe('retrying does not stack creations', () => {
	// The hazard the retry introduces, and it is a real one: `handleElementUpdate`
	// starts an *async* creation, so a second update arriving before the first
	// resolves starts another. Both then pass the supersede guard — same
	// registration, same generation — and both assign `registration.texture`.
	// The earlier handle is overwritten and never freed.
	//
	// A `frame`-strategy element updates every frame, so this is not a
	// contrived race: it leaks a GPU texture per frame for as long as a
	// creation is in flight. Measured before the guard: three updates in one
	// tick made three textures, and two survived `destroy()`.
	it('creates one texture for several updates in the same tick', async () => {
		const { api, fake } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		canvas.width = 64;
		canvas.height = 64;
		api.updateElement('a');
		api.updateElement('a');
		api.updateElement('a');
		await settle();
		await settle();

		expect(fake.live('texture'), 'a retry stacked concurrent creations').toBe(1);
	});

	it('leaves nothing behind on destroy', async () => {
		// The oracle the overlay's other lifetime tests use. A leaked handle is
		// invisible until something counts.
		const { api, fake } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		canvas.width = 64;
		canvas.height = 64;
		api.updateElement('a');
		api.updateElement('a');
		api.updateElement('a');
		await settle();
		await settle();

		api.destroy();
		await settle();

		expect(fake.live('texture'), 'textures outlived the overlay').toBe(0);
	});

	it('still retries after an attempt finishes', async () => {
		// Non-vacuity: a guard that simply never retried again would satisfy both
		// arms above and undo the fix it is protecting.
		const { api } = overlay();
		const canvas = unlaidOutCanvas();

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		// One attempt while still empty — refused, and it must clear its slot.
		api.updateElement('a');
		await settle();

		canvas.width = 64;
		canvas.height = 64;
		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.texture, 'the retry slot was never released').toBeDefined();
	});
})
